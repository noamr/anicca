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
import { RouterStatement } from '../types'

export default function resolveRouters(bundle: Bundle, im: TransformData): Bundle {
    const routerStatements = bundle.filter(({type}) => type === 'Router') as RouterStatement[]
    if (!routerStatements.length)
        return bundle
    const routeTable = S.Table('@routes', {valueType: 'string'})
    const routes = {$ref: '@routes', $T: new Map<number, string>()}
    im.tables[routeTable.name as string] = Object.keys(im.tables).length

    const transitions = routerStatements.map((rs, routerIndex) =>
        ({type: 'Transition', event: '@route',
            condition: F.eq({$ref: 'router', $T: 0} as TypedFormula<number>, routerIndex),
            payload: {router: [0, 'u32'], address: [1, 'string']},
            actions: [
                ...(rs.onChange || []),
                {target: routes, key: routerIndex,
                source: {$ref: 'address'}, type: 'Assign'} as AssignTransitionAction
        ]}) as Transition)

    const routerController = {
        type: 'Controller',
        name: '@routerController',
        rootState: {
            type: 'State',
            children: transitions
        }
    } as ControllerStatement

    const newStatements = routerStatements.flatMap((rs, routerIndex) => {
        const {onChange, name} = rs
        // TODO: complex routes
        return [
            {type: 'Slot', name, formula: F.get(F.object(...Object.entries(rs.routes).map(([k, v]) => F.pair(k, v))),
            F.get(routes, routerIndex))} as SlotStatement,
        ]
    })

    im.routes = routerStatements.map((rs, routerIndex) => ({[rs.name as string]: routerIndex})).reduce(assign, {})

    return bundle.flatMap((statement) => {
        if (statement.type === 'Router')
            return []

        return [statement]
    }).concat(newStatements, [routerController, routeTable])
}
