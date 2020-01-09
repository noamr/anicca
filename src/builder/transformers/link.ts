import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'
import { NativeType, TransformData, StoreSpec, RawFormula, Formula,
    FunctionFormula, RootType, Bundle, TableStatement } from '../types'

export default function link(bundle: Bundle, data: TransformData): StoreSpec {
    const indexCache = new WeakMap<Formula, number>()
    const hashIndices = new Map<string, number>()
    const slots: RawFormula[] = []
    console.log( bundle.filter(({type}) => type === 'Table'))

    const tableTypes: {[x: number]: NativeType} =
        bundle.filter(({type}) => type === 'Table')
            .map((s) => ({[data.tables[s.name as string]]: (s as TableStatement).valueType}))
            .reduce(assign)

    const hashFormula = (f: Formula): string => {
        if (typeof f !== 'object')
            return JSON.stringify(f)

        if (Reflect.has(f, '$primitive'))
            return JSON.stringify(Reflect.get(f, '$primitive'))

        const {op, args} = f as FunctionFormula
        return `${op}(${(args || []).map(a => `@${formulaToIndex(a)}`).join(',')})`
    }

    const toRawFormula = (f: Formula): RawFormula => {
        if (typeof f !== 'object')
            return {value: f}

        if (Reflect.has(f, '$primitive'))
            return {value: Reflect.get(f, '$primitive')} as RawFormula

        const {op, args} = f as FunctionFormula
        return {op, args: (args || []).map(formulaToIndex)}
    }

    const formulaToIndex = (f: Formula): number => {
        if (indexCache.has(f))
            return indexCache.get(f) as number

        const hash = hashFormula(f)
        if (hashIndices.has(hash))
            return hashIndices.get(hash) as number

        const index = slots.length
        const rf = toRawFormula(f)
        slots[index] = rf
        hashIndices.set(hash, index)
        if (typeof f === 'object')
            indexCache.set(f, index)
        return index
    }

    return {
        outputNames: data.outputNames,
        tableTypes,
        roots: Object.entries(data.roots).map(([key, value]) =>
            ({[key]: formulaToIndex(value as Formula)})).reduce(assign) as {[key in RootType]: number},
        slots,
    }
}
