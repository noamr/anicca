import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'
import { PrimitiveFormula, toArgType, TypedPrimitive, ResolveType, 
        TypedFormula, Bundle, Formula, TransformData, NativeType,
         FunctionFormula, SlotStatement, ReferenceFormula, toFormula } from '../types'

const nativeFunctions = new Set([
    'gt', 'lt', 'lte', 'gte', 'eq', 'neq', 'plus', 'minus', 'mult', 'div', 'pow', 'mod',
    'bwand', 'bwor', 'bwxor', 'shl', 'shr', 'ushr', 'bwnot', 'not', 'size', 'cond', 'isNil',
    'negate', 'sin', 'cos', 'round', 'trunc', 'parseInt', 'parseFloat', 'formatInt', 'formatFloat',
    'get', 'now', 'uid', 'source', 'key', 'value', 'pair', 'first', 'last', 'object', 'array',
    'toLowerCase', 'toUpperCase', 'substring', 'startsWith', 'endsWith', 'stringIncludes', 'encode',
    'flatMap', 'flatReduce', 'head', 'tail', 'first', 'second', 'table', 'noop', 'put', 'delete', 'merge', 'replace', 'concat'
])
const functions: {[name: string]: (...args: any[]) => Formula} = {
    filter: <M, P>(m: M, predicate: P) =>
        F.flatMap(m, F.cond(predicate,
            F.object(F.pair(F.key() as any, F.value() as any)),
            F.object<M>())),
    map: <M, P>(m: M, predicate: P) => F.flatMap(m, F.array(F.pair(F.key(), predicate))),
    every: <M, P>(m: M, predicate: P) =>
        F.flatReduce(F.map(m, F.not(F.not(predicate))),
            [F.and(F.value(), F.aggregate<boolean>()), F.not(F.value())], true),
    some: <M, P>(m: M, predicate: P) =>
        F.flatReduce(F.map(m, F.not(F.not(predicate))), [F.or(F.value(), F.aggregate()), F.value()], false),
    findFirst: <M, P>(m: M, predicate: P) => F.head(F.filter(m, predicate)),
    put: (...args: any[]) => F.array(...args),
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
    diff: <K, V, T = Map<K, V>>(a: toArgType<T>, b: toArgType<T>) =>
        F.filter(a, F.neq(F.value(), F.get(b, F.key())))

}

function formulaToString(f: Formula): string {
    if (!f)
        return ''
    const rf = f as ReferenceFormula
    const pf = f as PrimitiveFormula
    const ff = f as FunctionFormula
    if (rf.$ref)
        return `ref(${rf.$ref})`

    if (Reflect.has(pf, '$primitive'))
        return '' + pf.$primitive

    if (ff.op) {
        const args = ff.args || []
        const T = (tsa: TemplateStringsArray, ...A: number[]) =>
            tsa.map((str, i) => `${str}${formulaToString(args[A[i]])}`).join('')

        switch (ff.op) {
            case 'not':
                return T`!${0}`
            case 'get':
                return T`${0}[${1}]`
            case 'bwand':
                return T`(${0} & ${1})`
            case 'eq':
                return T`(${0} === ${1})`
            case 'neq':
                return T`(${0} !== ${1})`
            case 'plus':
                return T`(${0} + ${1})`
            case 'minus':
                return T`(${0} - ${1})`
            case 'mult':
                return T`(${0} * ${1})`
            case 'div':
                return T`(${0} / ${1})`
            case 'pow':
                return T`(${0} ** ${1})`
            case 'lte':
                return T`(${0} <= ${1})`
            case 'gte':
                return T`(${0} >= ${1})`
            case 'shr':
                return T`(${0} >> ${1})`
            case 'shl':
                return T`(${0} << ${1})`
            case 'bwor':
                return T`(${0} | ${1})`
            case 'cond':
                return T`(${0} ? ${1} : ${2})`
            case 'or':
                return args.map(formulaToString).join(' || ')
            case 'and':
                return args.map(formulaToString).join(' && ')
            case 'array':
            case 'pair':
                return `[${args.map(formulaToString).join(', ')}]`
            case 'head':
            case 'tail':
            case 'size':
                return `${formulaToString(args[0])}.${ff.op}()`
            case 'object':
                return `{${args.map(
                    a => ((a as FunctionFormula).args || []).map(formulaToString).join(':')
                ).join(',')}}`
            case 'cond':
                return T`(${0} ? ${1} : ${2})`
            case 'flatMap':
                return `flatMap(${formulaToString(args[0])}, (value, key) => (${formulaToString(args[1])}))`
            case 'value':
            case 'aggregate':
            case 'index':
            case 'key':
                return ff.op
        }
        return `${ff.op}(${(args || []).map(formulaToString).join(',')})`
    }

    return JSON.stringify(ff)
}

const unknownSymbol = Symbol('unknown')

export default function resolveFormulas(bundle: Bundle, im: TransformData): Bundle {
    debugger
    const isTruthy = (f: Formula): boolean|symbol => {
        if (Reflect.has(f, '$primitive'))
            return !!Reflect.get(f, '$primitive')
        const {op, args} = f as FunctionFormula
        if (new Set(['array', 'object', 'pair']).has(op))
            return true

        if (op === 'not') {
            const v = isTruthy((args || [])[0])
            if (v !== unknownSymbol)
                return !v
        }

        return unknownSymbol
    }

    const rewrite = (f: Formula): Formula => {
        const op = Reflect.get(f, 'op')
        if (!op)
            return f

        const args = ((f as FunctionFormula).args || []).map(resolveFormula).map(f => rewrite(f))
        switch (op) {
            case 'cond': {
                const truthy = isTruthy(args[0])
                if (truthy !== unknownSymbol)
                    return truthy ? args[1] : args[2]

                break
            }

            case 'not': {
                const truthy = isTruthy(args[0])
                if (truthy !== unknownSymbol)
                    return {$primitive: !truthy} as Formula
                break
            }
            case 'object': {
                args.forEach(a => {
                    const args = (a as FunctionFormula).args
                    if (!args || args.length !== 2)
                        throw new Error(`Bad args for object: ${args && args.map(formulaToString)}`)
                })
            }
        }

        if (args.every((v: any, i: number) => ((f as FunctionFormula).args || [])[i] === v))
            return f

        return {op, args, $token: Reflect.get(f, '$token')} as Formula
    }

    const refs = {
        ...bundle.filter(s => s.type === 'Slot')
            .map(s => ({[s.name as string]: (s as SlotStatement).formula})).reduce(assign, {}),
        ...mapValues(im.tables, n => F.table(n)),
    } as {[r: string]: Formula}

    const resolveFormula = (f: Formula): Formula => {
        if (typeof f !== 'object')
            return {$primitive: f} as Formula

        if (Reflect.has(f, '$primitive'))
            return f

        if (Reflect.has(f, '$ref')) {
            const {$ref} = f as ReferenceFormula
            if (!Reflect.has(refs, $ref))
                throw new Error(`Unresolved ref: ${$ref}`)

            return resolveFormula(refs[$ref])
        }

        if (Array.isArray(f))
            return resolveFormula(
                {op: f.length === 2 ? 'pair' : 'array', args: (f as any[]).map((a => resolveFormula(a)))} as Formula)

        const {op, args} = f as FunctionFormula

        if (functions[op])
            return resolveFormula(functions[op](...(args || [])) as FunctionFormula)

        if (!nativeFunctions.has(op))
            throw new Error(`Unknown function: ${op}`)

        return {op, args: args && args.map(resolveFormula), $token: Reflect.get(f, '$token')} as Formula
    }

    im.roots = mapValues(im.roots, (f: Formula) => rewrite(resolveFormula(f)))
    im.debugInfo = {
        roots: mapValues(im.roots, formulaToString)
    }

//    console.log(im.debugInfo)

    return bundle
}
