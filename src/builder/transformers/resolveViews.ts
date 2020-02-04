import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {
  AssignmentDirective,
  AssignTransitionAction,
  BindDeclaration,
  Bundle,
  CloneDeclaration,
  ControllerStatement,
  DispatchAction,
  DOMEventAction,
  DOMEventDeclaration,
  EventHandlerConfig,
  Formula,
  FunctionFormula,
  GotoAction,
  LetStatement,
  NativeDictionaryType,
  NativeType,
  ReferenceFormula,
  SlotStatement,
  State,
  Statement,
  toFormula,
  TransformData,
  Transition,
  TransitionAction,
  TypedFormula,
  TypedRef,
  ViewDeclaration,
  ViewRule,
  ViewStatement,
} from '../types'

import {F, P, R, removeUndefined, S, withInfo} from './helpers'
import createPackFormulasContext from './packFormulas'
import { BindTargetType } from '../types'

export default function resolveViews(bundle: Bundle, im: TransformData): Bundle {
    const prevTable = S.Table('@view_prev', {valueType: {dictionary: ['u32',  'string']}})
    const prevClonesTable = S.Table('@view_prev_clones', {valueType: {dictionary: ['u32', 'string']}})
    im.tables[prevTable.name as string] = Object.keys(im.tables).length
    im.tables[prevClonesTable.name as string] = Object.keys(im.tables).length
    const viewStatements = bundle.filter(({type}) => type === 'View')

    const {indexOfFormula, indexOfType, typeMap, formulas} = createPackFormulasContext({
        enforceTypes: false
    })
    function resolveRefs(f: Formula | null,
                         refMap: {[key: string]: Formula}, {allow}: {allow: boolean}): Formula | null {
        if (!f)
            return null
        const ref = Reflect.get(f, '$ref')
        const replaced = refMap[ref]
        if (replaced)
            return replaced

        if (ref && !allow)
            throw new Error(`Unresolved ref in view: ${ref}`)
        if (!Reflect.has(f, 'args'))
            return f

        const {args} = f as FunctionFormula
        return {...f, args: (args || []).map(a => resolveRefs(a, refMap, {allow}))} as Formula
    }

    function resolveDeclaration(d: ViewDeclaration, iterator?: [string, string], source?: Formula) {
        if (d.type === 'Bind')
            return source ? {...(d as BindDeclaration),
                src: withInfo(F.map(source, resolveRefs(
                (d as BindDeclaration).src, iterator ? {
                    [iterator[0]]: F.key(),
                    [iterator[1]]: F.value()
                } : {}, {allow: true})), `Map binding`)} as BindDeclaration : d
        if (d.type === 'DOMEvent') {
            const declaration = d as DOMEventDeclaration
            const refs = {
                ...(iterator ? {[iterator[0]]: F.key()} : {}),
                ...(declaration.argName ? {[declaration.argName]: F.source()} : {})
            }

            return {...declaration,
                condition: resolveRefs(declaration.condition || null, refs, {allow: false}),
                actions: (declaration.actions || []).map(a => {
                    const da = a as DispatchAction

                    if (da.type !== 'Dispatch' || !da.payload)
                        return da
                    return {...da, payload: resolveRefs(da.payload, refs, {allow: false})}
                })}
        }

        return d
    }

    interface FlatDeclaration<D> {
        view: string
        root: string | null
        selector: string
        declaration: D
    }

    const flattenRules = (
        {rules, view, root, iterator, mapSource}:
        Partial<{rules: ViewRule[], view: string, root: string, iterator: [string, string], mapSource: Formula}>) =>
        (rules as ViewRule[]).flatMap(({selector, declarations}) =>
            declarations.map(
                declaration => ({
                    view,
                    root: root || null,
                    selector,
                    declaration: resolveDeclaration(declaration, iterator, mapSource)
                } as FlatDeclaration<ViewDeclaration>)))

    const flatViewDeclarations = viewStatements.flatMap((s, viewIndex) => {
        const {rules, name} = s as ViewStatement
        return flattenRules({rules, view: name})
    })

    const cloneDeclarations = flatViewDeclarations.filter(
        ({declaration}) => declaration.type === 'Clone') as Array<FlatDeclaration<CloneDeclaration>>

    const clonedViewDeclarations = cloneDeclarations.flatMap(({view, selector, declaration}) =>
        flattenRules({rules: declaration.childRules, view, root: selector,
                      iterator: declaration.iterator, mapSource: declaration.mapSource}))

    const allViewDeclarations = [...flatViewDeclarations, ...clonedViewDeclarations]

    const viewEventDeclarations = allViewDeclarations.filter(({declaration}) => declaration.type === 'DOMEvent') as
        Array<FlatDeclaration<DOMEventDeclaration>>
    const viewBindingDeclarations = allViewDeclarations.filter(({declaration}) => declaration.type === 'Bind') as
        Array<FlatDeclaration<BindDeclaration>>

    im.views = {
        events: viewEventDeclarations.map(({view, root, selector, declaration}) => ({
            view,
            selector,
            root,
            eventType: declaration.eventType,
            condition: declaration.condition ? indexOfFormula(declaration.condition) : null,
            handlers: declaration.actions.filter(a => a.type === 'Dispatch').map(d => {
                const da = d as DispatchAction
                return {
                    header: im.getEventHeader(da.event, da.target),
                    payloadType: indexOfType(im.getEventPayloadType(da.event, da.target)),
                    payloadFormula: da.payload ? indexOfFormula(da.payload) : null
                } as EventHandlerConfig
            }),
            preventDefault: declaration.actions.findIndex(a => a.type === 'PreventDefault') >= 0,
            stopPropagation: declaration.actions.findIndex(a => a.type === 'StopPropagation') >= 0,
        })),
        bindings: [...viewBindingDeclarations.map(({view, root, selector, declaration}) => ({
            root,
            view,
            selector,
            target: declaration.target,
            type: declaration.targetType,
        })), ...cloneDeclarations.map(({view, selector}) => ({
            root: selector,
            view,
            selector: '&',
            type: 'remove' as BindTargetType
        }))],
        formulas,
        types: [...typeMap.values()]
    }

    const viewBindings = viewBindingDeclarations.map(({root, declaration}, index) =>
        root ? {...declaration.src, $token: {info: `binding ${index}`}} as toFormula<Map<number, string>> :
        withInfo(F.object(F.pair(0, declaration.src as toFormula<string>)), `binding ${index}`))

    const viewPrev = {$ref: '@view_prev', $T: new Map<number, Map<number, string>>()} as
            TypedFormula<Map<number, Map<number, string>>>

    const bindingIndices = Array(viewBindingDeclarations.length).fill(0).map((a, i) => i)
    const cloneIndices = cloneDeclarations.map((d, i) => i)
    const prevBindings = bindingIndices.map(index =>
        withInfo(F.get(viewPrev, index), `Prev value for binding ${index}`))
    const diffs = bindingIndices.map(index => withInfo(F.diff(viewBindings[index], prevBindings[index]), `Diff for binding ${index}`))
    const bindingsDiff = withInfo(F.filter(F.array(...diffs), F.size(F.value())), 'all view diff')
    const viewBindingsToCommit = withInfo(F.array(...viewBindings), 'root view bindings')

    const clonesPrev = {$ref: '@view_prev_clones', $T: new Map<number, Map<number, string>>()} as
            TypedFormula<Map<number, Map<number, string>>>

    const viewClones = withInfo(F.array(...cloneDeclarations.map(
        c => F.map(c.declaration.mapSource as
            TypedFormula<Map<number, any>>, {$primitive: '', $T: ''} as TypedFormula<string>))), 'clones')
    const deletedClones = withInfo(
        F.filter(F.array(...cloneIndices.map(cloneIndex =>
                withInfo(F.diff(F.get(clonesPrev, cloneIndex), F.get(viewClones, cloneIndex)),
                `Remove clone ${cloneDeclarations[cloneIndex].selector}`))), F.size(F.value())), 'deleted clones')

    const viewDiff = withInfo(F.flatMap(F.array(0, 1),
        F.cond(F.key(),
            F.flatMap(deletedClones, F.object(
                F.pair(F.plus(F.key(), bindingIndices.length),
                    F.value() as TypedFormula<Map<number, string>>))),
            bindingsDiff
        )), 'view diff with clones')

    im.onCommit = [
        withInfo(F.put(im.tables['@view_prev'], F.replace(), viewBindingsToCommit), 'commit view bindings'),
        withInfo(F.put(im.tables['@view_prev_clones'], F.replace(), viewClones), 'commit view clones')
    ]

    im.outputs = {
        '@view_channel': F.cond(F.size(viewDiff),
        withInfo(F.encode(viewDiff,
            {$type: {dictionary: ['u32', {dictionary: ['u32', 'string']}]}}), 'encode outbox'), null)
    }

    return bundle.flatMap((statement) => {
        if (statement.type === 'View')
            return []

        return [statement]
    }).concat([prevTable, prevClonesTable])
}
