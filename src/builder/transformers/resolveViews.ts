import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {
  AssignmentDirective,
  AssignTransitionAction,
  BindDeclaration,
  Bundle,
  ControllerStatement,
  DispatchAction,
  DOMEventDeclaration,
  Formula,
  FunctionFormula,
  GotoAction,
  LetStatement,
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
  ViewStatement,
} from '../types'

import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'

export default function resolveViews(bundle: Bundle, im: TransformData): Bundle {
    const prevTable = S.Table('@view_prev', {valueType: 'string'})
    im.tables[prevTable.name as string] = Object.keys(im.tables).length
    const viewStatements = bundle.filter(({type}) => type === 'View')

    const flatViewDeclarations = viewStatements.flatMap((s, viewIndex) => {
        const {rules, name} = s as ViewStatement
        return rules.flatMap(({selector, declarations}) =>
            declarations.map(declaration => ([name, selector, declaration] as [string, string, ViewDeclaration])))
    })

    const viewEventDeclarations = flatViewDeclarations.filter(([, , dec]) => dec.type === 'DOMEvent') as
        Array<[string, string, DOMEventDeclaration]>
    const viewBindingDeclarations = flatViewDeclarations.filter(([, , dec]) => dec.type === 'Bind') as
        Array<[string, string, BindDeclaration]>

    im.views = {
        events: viewEventDeclarations.map(([view, selector, declaration]) => ({
            view,
            selector,
            eventType: declaration.eventType,
            headers: declaration.actions.filter(a => a.type === 'Dispatch').map(d => {
                const da = d as DispatchAction
                return im.getEventHeader(da.event, da.target)
            }),
            preventDefault: declaration.actions.findIndex(a => a.type === 'PreventDefault') >= 0,
            stopPropagation: declaration.actions.findIndex(a => a.type === 'StopPropagation') >= 0,
        })),
        bindings: viewBindingDeclarations.map(([view, selector, declaration]) => ({
            view,
            selector,
            target: declaration.target,
            type: declaration.targetType,
        })),
    }

    const viewBindings = F.array(...viewBindingDeclarations.map(([, , d]) => d.src as TypedFormula<string>))
    const viewDiff = F.diff(viewBindings, {$ref: '@view_prev', $T: new Map<number, string>()} as
        TypedFormula<Map<number, string>>)

    im.roots.commitViewDiff = F.put(im.tables['@view_prev'], F.replace(), viewBindings)

    im.outputs = {
        '@view_channel': F.cond(F.size(viewDiff), F.encode(viewDiff), null)
    }

    return bundle.flatMap((statement) => {
        if (statement.type === 'View')
            return []

        return [statement]
    }).concat([prevTable])
}
