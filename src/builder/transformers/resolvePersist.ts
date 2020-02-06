import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {
  Bundle,
  ControllerStatement,
  PersistStatement,
  TransformData,
  Transition,
  TypedFormula
} from '../types'

import {F, S, withInfo, assert} from './helpers'
import useMacro from './useMacro'
import { RouterStatement, DispatchAction, TableStatement } from '../types'

export default function resolvePersist(bundle: Bundle, im: TransformData): Bundle {
    const persistStatements = bundle.filter(({type}) => type === 'Persist') as PersistStatement[]
    if (!persistStatements.length)
        return bundle

    const persistTable = S.Table('@persist', {valueType: {dictionary: ['u32', 'ByteArray']}}) as TableStatement
    const persist = {$ref: '@persist', $T: new Map<number, Map<number, ArrayBuffer>>()}

    im.tables[assert(persistTable.name)] = Object.keys(im.tables).length

    const transitions = persistStatements.map(({onLoad, table}, index) =>
        ({type: 'Transition', event: '@persistRead',
            condition: F.eq({$ref: 'tableIndex', $T: 0} as TypedFormula<number>, index),
            payload: {tableIndex: [0, 'u32'], data: [1, {dictionary: ['u32', 'ByteArray']}]},
            actions: [
                {type: 'Assign', target: {$ref: table}, source: F.map({$ref: 'data'},
                    F.decode(F.value(), {$type: im.getTableType(table)}))},
                {type: 'Assign', target: persist, key: index, source: {$ref: 'data'}},
                ...onLoad
        ]}) as Transition)

    const persistController = {
        type: 'Controller',
        name: '@persistController',
        rootState: {
            type: 'State',
            children: transitions
        }
    } as ControllerStatement

    const encoded = persistStatements.map(({table}, i) =>
        F.map({$ref: table}, withInfo(
            F.encode(F.value(), {$type: im.getTableType(table)}) as TypedFormula<ArrayBuffer>,
                `Encode table ${table} for persistence`)))

    const persistDiff =
        F.filter(
            F.array(...persistStatements.map(({table}, index) =>
                F.diff(encoded[index], F.get(persist, index)))), F.size(F.value()))

    im.persist = persistStatements.map(({store}) => store)
    im.outputs = {
        ...(im.outputs || {}),
        '@persist_channel': F.cond(F.size(persistDiff),
        withInfo(F.encode(persistDiff,
            {$type: {dictionary: ['u32', {dictionary: ['u32', 'ByteArray']}]}}), 'persist output'), null)
    }
    im.onCommit = [...im.onCommit, ...persistStatements.map(({table}, index) => 
        F.put(persist, index, encoded[index]))]

    return bundle.filter(s => s.type !== 'Persist').concat([persistTable, persistController])
}
