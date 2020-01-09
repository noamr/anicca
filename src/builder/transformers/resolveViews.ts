import {F, P, S, R, removeUndefined} from './helpers'
import { State, Transition, Statement, toFormula, TransitionAction, AssignTransitionAction, DispatchAction, Formula, ReferenceFormula, LetStatement, TypedRef, SlotStatement, FunctionFormula, Bundle, ControllerStatement, AssignmentDirective, TypedFormula, GotoAction, ViewStatement, ViewDeclaration, DOMEventDeclaration, BindDeclaration, RunScriptAction, TransformData } from '../types'
import {keys, forEach, values, flatten, pickBy, map, assign, mapValues, filter} from 'lodash'
import useMacro from './useMacro'
import fs from 'fs'
import path from 'path'
import { Slot } from '../StoreDefinition'


export default function resolveViews(bundle: Bundle, im: TransformData): Bundle {
    const prevTable = S.Table('@view_prev', {type: ''})
    const viewStatements = bundle.filter(({type}) => type === 'View')

    const flatViewDeclarations = viewStatements.flatMap((s, viewIndex) => {
        const {rules, name} = s as ViewStatement
        return rules.flatMap(({selector, declarations}) => declarations.map(declaration => ([name, selector, declaration] as [string, string, ViewDeclaration])))
    })

    const viewEventDeclarations = flatViewDeclarations.filter(([,,dec]) => dec.type === 'DOMEvent') as [string, string, DOMEventDeclaration][]

     im.views.events = viewEventDeclarations.map(([view, selector, declaration]) => ({
        view,
        selector,
        eventType: declaration.eventType,
        headers: declaration.actions.filter(a => a.type === 'Dispatch').map(d => {
            const da = d as DispatchAction
            const fc = im.flatControllers[da.target]
            if (!fc)
                throw new Error(`Unknown event target: ${da.target}`)
            const eventIndex = fc[1].events.indexOf(da.event)
            if (eventIndex < 0)
                throw new Error(`Unknown event: ${da.target}.${da.event}`)
            return (fc[0] << 15) | eventIndex
        }),
        preventDefault: declaration.actions.findIndex(a => a.type === 'PreventDefault') >= 0
    }))

    const viewBindingDeclarations = flatViewDeclarations.filter(([,,dec]) => dec.type === 'Bind') as [string, string, BindDeclaration][]
    im.views.bindings = viewBindingDeclarations.map(([view, selector, declaration]) => ({
        view,
        selector,
        target: declaration.target,
        type: declaration.targetType
    }))

    const viewBindings = viewBindingDeclarations.map(([,,d]) => d.src) as TypedFormula<string>[]
    const viewDiff = F.diff(F.array(...viewBindings), {$ref: '@view_prev', $T: [] as string[]} as TypedFormula<string[]>)

    return bundle.flatMap((statement) => {
        if (statement.type === 'View')
            return []

        return [statement]
    }).concat([prevTable])
}
