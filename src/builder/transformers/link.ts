import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'
import { TransformData, StoreSpec, RawFormula, Formula, FunctionFormula, RootType } from '../types'

export default function link(data: TransformData): StoreSpec {
    const indexCache = new WeakMap<Formula, number>()
    const hashIndices = new Map<string, number>()
    const slots: RawFormula[] = []

    const hashFormula = (f: Formula): string => {
        if (Reflect.has(f, '$primitive'))
            return JSON.stringify(Reflect.get(f, '$primitive'))

        const {op, args} = f as FunctionFormula
        return `${op}(${(args || [].map(a => `@${formulaToIndex(a)}`).join(','))})`
    }

    const toRawFormula = (f: Formula): RawFormula => {
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
        slots[index] = toRawFormula(f)
        return index
    }

    return {
        outputNames: data.outputNames,
        roots: Object.entries(data.roots).map(([key, value]) =>
            ({[key]: formulaToIndex(value as Formula)})).reduce(assign) as {[key in RootType]: number},
        slots,
    }
}
