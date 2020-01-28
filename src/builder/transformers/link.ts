import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'
import { NativeTypeFormula, ReferenceFormula } from '../types'
import { NativeType, TransformData, StoreSpec, RawFormula, Formula,
    FunctionFormula, RootType, Bundle, TableStatement, Token } from '../types'

export default function link(bundle: Bundle, data: TransformData): StoreSpec {
    const indexCache = new WeakMap<Formula, number>()
    const hashIndices = new Map<string, number>()
    const slots: RawFormula[] = []

    const typeMap = new Map<string, NativeType>()
    const debugInfo = {
        tokens: [] as Token[],
        slots: [] as Array<Set<number>>
    }

    const hashFormula = (f: Formula): string => {
        if (typeof f !== 'object')
            return JSON.stringify(f)

        if (Reflect.has(f, '$primitive'))
            return JSON.stringify(Reflect.get(f, '$primitive'))

        if (Reflect.has(f, '$type'))
            return `$type:${JSON.stringify(Reflect.get(f, '$type'))}`

        const {op, args} = f as FunctionFormula
        if ((args || []).some(t => typeof t === 'undefined'))
            throw new Error(`Unexpected undefined: ${args}`)
        return `${op}(${(args || []).map(a => `@${formulaToIndex(a)}`).join(',')})`
    }

    const indexOfType = (type: NativeType): number => {
        const hash = JSON.stringify(type)
        typeMap.set(hash, type)
        return [...typeMap.keys()].indexOf(hash)
    }
    const hashToToken = new Map<string, number>()

    const tokenIndex = (t: Token): number => {
        const hash = JSON.stringify(t)
        if (hashToToken.has(hash))
            return hashToToken.get(hash) as number

        const index = debugInfo.tokens.length
        debugInfo.tokens[index] = t
        hashToToken.set(hash, index)
        return index
    }

    const toRawFormula = (f: Formula): RawFormula => {
        if (typeof f !== 'object')
            throw new Error(`Unexpected formula: ${f}`)

        if (Reflect.has(f, '$type')) {
            const type = Reflect.get(f, '$type')
            return {value: indexOfType(type), type: indexOfType('u32')}
        }

        if (!f.type)
            throw new Error(`Missing type for ${JSON.stringify(f)}`)
    
        if (Reflect.has(f, '$primitive'))
            return {type: indexOfType(f.type as NativeType), value: Reflect.get(f, '$primitive')} as RawFormula

        const {op, args, type, $token} = f as FunctionFormula
        return {type: indexOfType(type as NativeType), token: $token ? tokenIndex($token) : null, op, args: (args || []).map(formulaToIndex)}
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

    const roots = Object.entries(data.roots).map(([key, value]) =>
            ({[key]: formulaToIndex(value as Formula)})).reduce(assign) as {[key in RootType]: number}

    data.types = [...typeMap.values()]
    const tableTypes = mapValues(data.tableTypes, indexOfType)

    return {
        channels: data.channels,
        debugInfo: debugInfo.tokens,
        tableTypes,
        types: data.types,
        roots,
        slots,
    }
}
