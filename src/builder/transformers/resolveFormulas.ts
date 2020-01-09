import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'
import { PrimitiveFormula } from '../types'
import { TypedFormula, Bundle, Formula, TransformData, NativeType,
         FunctionFormula, SlotStatement, ReferenceFormula, toFormula } from '../types'

const nativeFunctions = new Set([
    'gt', 'lt', 'lte', 'gte', 'eq', 'neq', 'plus', 'mult', 'div', 'pow', 'mod', 'bwand', 'bwor', 'bwxor', 'shl', 'shr', 'ushr', 'bwnot', 'negate', 'sin', 'cos', 'round', 'trunc', 'parseInt', 'parseFloat', 'formatNumber', 'get', 'now', 'uid', 'source', 'key', 'value', 'pair', 'first', 'last', 'toLowerCase', 'toUpperCase', 'substring', 'startsWith', 'endsWith', 'stringIncludes', 'encode', 'flatMap', 'flatReduce', 'head', 'tail', 'construct', 'table', 'noop', 'put', 'delete', 'merge', 'replace'
])
const functions: {[name: string]: (...args: any[]) => Formula} = {
    filter: <M, P>(m: M, predicate: P) => F.flatMap(m, P ? [[F.key(), F.value()]] : []),
    map: <M, P>(m: M, predicate: P) => F.flatMap(m, [F.key(), predicate]),
    every: <M, P>(m: M, predicate: P) =>
        F.flatReduce(F.map(m, F.not(F.not(predicate))), [F.and(F.value(), F.aggregate<boolean>()), !F.value()], true),
    some: <M, P>(m: M, predicate: P) =>
        F.flatReduce(F.map(m, F.not(F.not(predicate))), [F.or(F.value(), F.aggregate()), F.value()], false),
    findFirst: <M, P>(m: M, predicate: P) => F.head(F.filter(m, predicate)),
    cond: <P, C, A>(p: P, c: C, a: A) => F.get(F.object(F.pair(true, c as A|C),
        F.pair(false, a as A|C)), F.not(F.not(p))),
    or: <A>(...args: A[]) =>
        args.length === 0 ? {$primitive: false} as Formula :
        args.length === 1 ? args[0] :
        args.length === 2 ? F.cond(args[0], args[0], args[1]) :
        F.cond(F.some(args, F.value()), F.findFirst(args, F.value()), F.get(args, F.tail(args))),
    and: <A>(...args: A[]) =>
        args.length === 0 ? {$primitive: true} as Formula :
        args.length === 1 ? args[0] :
        args.length === 2 ? F.cond(args[0], args[1], args[0]) :
        F.cond(F.every(args, F.value()), F.tail(args), F.findFirst(args, F.not(F.value()))),
    diff: <T extends TypedFormula<Map<any, any>>>(a: T, b: T) =>
        F.flatMap(a, F.cond(F.eq(F.value(), F.get(b as toFormula<Map<any, any>>, F.key())),
            [] as Array<[any, any]>, [F.pair(F.key(), F.value())])),

}
export default function resolveFormulas(bundle: Bundle, im: TransformData): Bundle {
    const refs = {
        ...bundle.filter(s => s.type === 'Slot')
            .map(s => ({[s.name as string]: (s as SlotStatement).formula})).reduce(assign),
        ...mapValues(im.tables, n => F.table(n)),
    } as {[r: string]: Formula}

    const resolveFormula = (f: Formula): Formula => {
        if (Reflect.has(f, '$primitive'))
            return f

        if (Reflect.has(f, '$ref')) {
            const {$ref} = f as ReferenceFormula
            if (!Reflect.has(refs, $ref))
                throw new Error(`Unresolved ref: ${$ref}`)

            return refs[$ref]
        }

        const {op, args} = f as FunctionFormula

        if (functions[op])
            return resolveFormula(functions[op](...(args || [])) as FunctionFormula)

        if (!nativeFunctions.has(op))
            throw new Error(`Unknown function: ${op}`)

        return {op, args: args && args.map(resolveFormula)} as Formula
    }

    im.roots = mapValues(im.roots, resolveFormula)
    return bundle
}
