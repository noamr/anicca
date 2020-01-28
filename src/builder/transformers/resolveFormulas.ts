import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {F, P, R, removeUndefined, S} from './helpers'
import {isEqual} from 'lodash'
import useMacro from './useMacro'
import { EnumStatement, NativeDictionaryType, NativeTupleType, TableStatement, tuple } from '../types'
import { PrimitiveFormula, toArgType, TypedPrimitive, ResolveType, 
        TypedFormula, Bundle, Formula, TransformData, NativeType,
         FunctionFormula, SlotStatement, ReferenceFormula, toFormula } from '../types'

const functions: {[name: string]: (...args: any[]) => Formula} = {
    filter: <M, P>(m: M, predicate: P) =>
        F.flatMap(m, F.cond(predicate,
            F.object(F.pair(F.key() as any, F.value() as any)),
            F.object<M>())),
    map: <M, P>(m: M, predicate: P) => F.flatMap(m, F.object(F.pair(F.key(), predicate))),
    first: <M>(m: M) => F.at(m, 0),
    second: <M>(m: M) => F.at(m, 1),
    pair: <A, B>(a: A, b: B) => F.tuple(a, b),
    value: () => F.get(F.source(), F.key()),
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
        F.filter(a, F.neq(F.value(), F.get(b, F.key()))),

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
const numericTypes = new Set<NativeType>(['u8', 'u16', 'u32', 'u64', 'u128', 'i8', 'i16', 'i32', 'i64', 'i128', 'f32', 'f64', 'number'])
function expect(value: any) {
    return {
        toEqual: (other: any) => {
            if (!isEqual(value, other))
                throw new Error(`Expected ${value} to equal ${other}`)
        },
        toMatchType: (other: any) => {
            if (isEqual(value, other))
                return

            if (other === 'ANY')
                return

            if (numericTypes.has(other) && numericTypes.has(value))
                return

            throw new Error(`Expected ${value} to match type ${JSON.stringify(other)}`)
        },
        toBeADictionary: () => {
            if (typeof value !== 'object' || !Reflect.has(value, 'dictionary'))
                throw new Error(`Expected ${JSON.stringify(value)} to be a dictionary`)
        }
    }
}

function assert(value: any, message?: string) {
    if (!value)
        throw new Error(message || `Expected ${value} to be truthy`)
}

const bestNumber = (n: NativeType[]) => {
    const s = new Set(n)
    if (s.has('number'))
        return 'number'
    if (s.has('f64') || (s.has('f32') && (s.has('u64') || s.has('i64'))))
        return 'f64'

    if (s.has('f32'))
        return 'f32'

    if (s.has('i64'))
        return 'i64'

    const hasSigned = s.has('i8') || s.has('i16') || s.has('i32')
    const has32 = s.has('i32') || s.has('u32')
    const has16 = s.has('i16') || s.has('u16')
    if (hasSigned)
        return has32 ? 'i32' : has16 ? 'i16' : 'i8'
    return has32 ? 'u32' : has16 ? 'u18' : 'u8'
}

export default function resolveFormulas(bundle: Bundle, im: TransformData): Bundle {

    const strictTypeCheck = (def: [NativeType | 'number' | 'ANY', Array<NativeType | 'number' | 'ANY'>]) => {
        return (args: Formula[]) => {
            expect(args.length).toEqual(def[1].length)
            const types = args.map(resolveTypes).map((t, i) => {
                const expectedType = def[1][i]
                expect(t.type).toMatchType(expectedType)
            })

            if (def[0] === 'number' && def[1].every(d => d === 'number'))
                return bestNumber(args.map(a => a.type as NativeType))

            return def[0]
        }
    }

    let currentMap: Formula | null = null
    let currentAggregate: Formula | null = null

    const isNullish = (t: NativeType) => {
        if (t === 'null')
            return true

        const dt = t as NativeDictionaryType
        if (dt.dictionary)
            return dt.dictionary[1] === 'null'
        return false
    }

    const arbitrate = (types: NativeType[]): NativeType => {
        const t = [...types].filter(a => !isNullish(a))
        if (t.length === 0)
            return 'null'

        return t[0]
    }

    const typeChecks = {
        gt: strictTypeCheck(['bool', ['number', 'number']]),
        lt: strictTypeCheck(['bool', ['number', 'number']]),
        gte: strictTypeCheck(['bool', ['number', 'number']]),
        lte: strictTypeCheck(['bool', ['number', 'number']]),
        plus: strictTypeCheck(['number', ['number', 'number']]),
        minus: strictTypeCheck(['number', ['number', 'number']]),
        mult: strictTypeCheck(['number', ['number', 'number']]),
        div: strictTypeCheck(['f64', ['number', 'number']]),
        mod: strictTypeCheck(['number', ['number', 'number']]),
        pow: strictTypeCheck(['number', ['number', 'number']]),
        bwand: strictTypeCheck(['number', ['number', 'number']]),
        bwor: strictTypeCheck(['number', ['number', 'number']]),
        bwxor: strictTypeCheck(['number', ['number', 'number']]),
        shl: strictTypeCheck(['number', ['number', 'number']]),
        shr: strictTypeCheck(['number', ['number', 'number']]),
        ushr: strictTypeCheck(['number', ['number', 'number']]),
        bwnot: strictTypeCheck(['number', ['number']]),
        negate: strictTypeCheck(['number', ['number']]),
        sin: strictTypeCheck(['number', ['number']]),
        cos: strictTypeCheck(['number', ['number']]),
        trunc: strictTypeCheck(['number', ['number']]),
        round: strictTypeCheck(['number', ['number']]),
        floor: strictTypeCheck(['number', ['number']]),
        ceil: strictTypeCheck(['number', ['number']]),
        uid: strictTypeCheck(['u64', []]),
        now: strictTypeCheck(['u64', []]),
        toLowerCase: strictTypeCheck(['string', ['string']]),
        toUpperCase: strictTypeCheck(['string', ['string']]),
        substring: strictTypeCheck(['string', ['number', 'number']]),
        startsWith: strictTypeCheck(['bool', ['string', 'string']]),
        endsWith: strictTypeCheck(['bool', ['string', 'string']]),
        stringIncludes: strictTypeCheck(['bool', ['string', 'string']]),
        parseInt: strictTypeCheck(['i64', ['string', 'number']]),
        parseFloat: strictTypeCheck(['f64', ['string', 'number']]),
        formatInt: strictTypeCheck(['string', ['number', 'number']]),
        formatFloat: strictTypeCheck(['string', ['number', 'number']]),
        size: (args: Formula[]) => {
            expect(args.length).toEqual(1)
            args.forEach(resolveTypes)
            expect(args[0].type).toBeADictionary()
            return 'u32'
        },
        not: (args: Formula[]) => {
            args.forEach(resolveTypes)
            expect(args.length).toEqual(1)
            return 'bool'
        },
        isNil: (args: Formula[]) => {
            args.forEach(resolveTypes)
            expect(args.length).toEqual(1)
            return 'bool'
        },
        neq: (args: Formula[]) => {
            args.forEach(resolveTypes)
            expect(args.length).toEqual(2)
            return 'bool'
        },
        eq: (args: Formula[]) => {
            args.forEach(resolveTypes)
            expect(args.length).toEqual(2)
            return 'bool'
        },
        cond: (args: Formula[]) => {
            expect(args.length).toEqual(3)
            resolveTypes(args[0])
            return arbitrate(args.slice(1).map(resolveTypes).map(f => f.type as NativeType))
        },
        get: (args: Formula[]) => {
            expect(args.length).toEqual(2)
            const [map, key] = args.map(resolveTypes)
            if (typeof map.type === 'object' && (map.type as NativeTupleType).tuple) {
                const t = map.type as NativeTupleType
                assert(Reflect.has(t, 'getters'), `Attempting to get an item from tuple ${JSON.stringify(t)} without getters`)
                assert(Reflect.has(key, '$primitive'))
                const getter = Reflect.get(key, '$primitive')
                expect(typeof getter).toEqual('string')
                const index = (t.getters as string[]).indexOf(getter)
                assert(index >= 0, `Struct does ${t.getters} not have a property ${getter}`)
                return t.tuple[index]
            } else {
                expect(map.type).toBeADictionary()
                const [k, v] = Reflect.get(map.type as object, 'dictionary')
                expect(k).toMatchType(key.type)
                return v
            }
        },
        at: (args: Formula[]) => {
            expect(args.length).toEqual(2)
            const [map, key] = args.map(resolveTypes)
            const mapType = map.type
            expect(typeof mapType).toEqual('object')
            expect(Reflect.has(key as object, '$primitive')).toEqual(true)
            expect(Reflect.has(mapType as object, 'tuple')).toEqual(true)
            const v = Reflect.get(mapType as object, 'tuple')
            return v[Reflect.get(key as object, '$primitive') as number]
        },
        tuple: (args: Formula[]) => {
            return {tuple: args.map(resolveTypes).map(t => t.type)}
        },
        key: (args: Formula[]) => {
            assert(args.length === 0)
            assert(currentMap)
            if (currentMap) {
                const [k, v] = (currentMap.type as NativeDictionaryType).dictionary
                return k
            }
        },
        source: (args: Formula[]) => {
            expect(args.length).toEqual(0)
            assert(currentMap)
            if (currentMap)
                return currentMap.type
        },
        object: (args: Formula[]) => {
            if (!args.length)
                return {dictionary: ['string', 'null']}
            assert(args.length > 0)
            args.forEach(resolveTypes)
            expect(args.every(a => (resolveTypes(a).type as NativeTupleType<any>).tuple.length === 2))
            const entryTypes = args.map(a => a.type)
            const keyTypes = entryTypes.map(e => (e as NativeTupleType<NativeType>).tuple[0])
            const valueTypes = entryTypes.map(e => (e as NativeTupleType<NativeType>).tuple[1])
            return {dictionary: [keyTypes[0], valueTypes[0]]} as NativeDictionaryType
        },
        array: (args: Formula[]) => {
            if (!args.length)
                return {dictionary: ['u32', 'null']}
            const entryTypes = args.map(a => resolveTypes(a).type)
            return {dictionary: ['u32', entryTypes[0]]} as NativeDictionaryType
        },
        concat: (args: Formula[]) => {
            assert(args.length > 1)
            args.forEach(resolveTypes)
            args.slice(1).forEach(a => expect(a).toMatchType(args[0].type))
        },
        flatMap: (args: Formula[]) => {
            expect(args.length).toEqual(2)
            const prevMap = currentMap
            currentMap = resolveTypes(args[0])
            expect(args[0].type).toBeADictionary()
            resolveTypes(args[1])
            currentMap = prevMap
            expect(args[1].type).toBeADictionary()
            const pred = resolveTypes(args[1])
            const [k, v] = Reflect.get(pred.type as object, 'dictionary')
            return pred.type
        },
        flatReduce: (args: Formula[]) => {
            expect(args.length).toEqual(3)
            const prevMap = currentMap
            const prevAggregate = currentAggregate
            currentMap = resolveTypes(args[0])
            currentAggregate = resolveTypes(args[2])
            resolveTypes(args[1])
            currentMap = prevMap
            currentAggregate = prevAggregate
            return args[2].type
        },
        encode: (args: Formula[]) => {
            expect(args.length).toEqual(2)
            assert(Reflect.has(args[1], '$type'))
            resolveTypes(args[0])
            return 'ByteArray'
        },
        decode: (args: Formula[]) => {
            expect(args.length).toEqual(2)
            resolveTypes(args[0])
            return Reflect.get(args[1], '$type')
        },
        join: (args: Formula[]) => {
            expect(args.length).toEqual(2)
            args.forEach(resolveTypes)
            return 'string'
        },
        head: (args: Formula[]) => {
            expect(args.length).toEqual(1)
            args.forEach(resolveTypes)
            expect(args[0].type).toBeADictionary()
            const [k, v] = Reflect.get(args[0].type as object, 'dictionary')
            return k
        },
        tail: (args: Formula[]) => {
            expect(args.length).toEqual(1)
            args.forEach(resolveTypes)
            expect(args[0].type).toBeADictionary()
            const [k, v] = Reflect.get(args[0].type as object, 'dictionary')
            return k
        },
        table: (args: Formula[]) => {
            expect(args.length).toEqual(1)
            const tableIndex = Reflect.get(resolveTypes(args[0]), '$primitive') as number
            expect(Reflect.has(im.tableTypes, tableIndex)).toEqual(true)
            return {dictionary: ['u32', im.tableTypes[tableIndex]]}
        },
        noop: (args: Formula[]) => {
            expect(args.length).toEqual(0)
            return 'noop'
        },
        delete: (args: Formula[]) => {
            expect(args.length).toEqual(0)
            return 'delete'
        },
        merge: (args: Formula[]) => {
            expect(args.length).toEqual(0)
            return 'merge'
        },
        replace: (args: Formula[]) => {
            expect(args.length).toEqual(0)
            return 'replace'
        },
    }

    const nativeFunctions = new Set(Object.keys(typeChecks))

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
        const {op} = f as FunctionFormula
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

        return {...f, op, args} as Formula
    }

    const enums = bundle.filter(s => s.type === 'Enum').map(s => {
        const {values, name} = s as EnumStatement
        const v = Object.values(values)
        const enumType = v.some(v => Math.floor(v) !== v) ? 'f64' : 'i32'
        const type = {
            getters: Object.keys(values),
            tuple: v.map(() => enumType)
        } as NativeTupleType
        return {
            [name as string]: {
                op: 'tuple',
                type,
                args: v.map(n => ({$primitive: n, type: enumType}))
            } as FunctionFormula
        }
    }).reduce(assign, {}) as {[key: string]: FunctionFormula }

    const resolveNamedTypes = (t: NativeType | string): NativeType => {
        if (typeof t === 'string' && enums[t])
            return 'i32'

        if (typeof t !== 'object')
            return t as NativeType

        if (Reflect.has(t, 'tuple'))
            return {...t, tuple: ((t as NativeTupleType).tuple || []).map(resolveNamedTypes)}
        if (Reflect.has(t, 'dictionary'))
            return {...t, dictionary: ((t as NativeDictionaryType).dictionary || [])
                .map(resolveNamedTypes) as [NativeType, NativeType]}
        return t as NativeType
    }

    im.tableTypes =
        bundle.filter(({type}) => type === 'Table')
            .map((s) => ({[im.tables[s.name as string]]: resolveNamedTypes((s as TableStatement).valueType)}))
            .reduce(assign)

    const refs = {
        ...enums,
        ...bundle.filter(s => s.type === 'Slot')
            .map(s => ({[s.name as string]: (s as SlotStatement).formula})).reduce(assign, {}),
        ...mapValues(im.tables, n => F.table(n)),
    } as {[r: string]: Formula}

    const visited = new WeakSet<Formula>()
    const resolved = new WeakMap<Formula, Formula>()

    const resolveFormula = (f: Formula): Formula => {
        if (typeof f !== 'object')
            return {$primitive: f} as Formula

        if (resolved.has(f))
            return resolved.get(f) as Formula

        if (visited.has(f))
            throw new Error(`Circular formula ${formulaToString(f)}`)

        visited.add(f)

        const resolvedFormula = ((): Formula => {
            if (Reflect.has(f, '$type'))
                return {...f, $type: resolveNamedTypes(Reflect.get(f, '$type'))} as Formula
            if (Reflect.has(f, '$primitive'))
                return f

            if (Reflect.has(f, '$ref')) {
                const {$ref} = f as ReferenceFormula
                if (!Reflect.has(refs, $ref))
                    throw new Error(`Unresolved ref: ${$ref} (${formulaToString(f)})`)

                return {...f, ...resolveFormula(refs[$ref])}
            }

            if (Array.isArray(f))
                return resolveFormula(
                    {op: f.length === 2 ? 'pair' : 'array',
                     args: (f as any[]).map((resolveFormula))} as Formula)

            const {op, args, $token} = f as FunctionFormula

            if (functions[op])
                return {...resolveFormula(functions[op](...(args || [])) as FunctionFormula), $token}

            if (!nativeFunctions.has(op))
                throw new Error(`Unknown function: ${op}: ${JSON.stringify(f)}`)

            return {...f, op, args: args && args.map(resolveFormula)} as Formula
        })()

        resolved.set(f, resolvedFormula)
        return resolvedFormula
    }

    const primitiveToNativeType = (p: any) => {
        if (typeof p === 'string')
            return 'string'
        if (typeof p === 'number') {
            const hasFrac = p !== Math.floor(p)
            if (hasFrac) {
                if (new Float32Array([p])[0] === new Float64Array([p])[0])
                    return 'f32'
                else
                    return 'f64'
            }

            if (p < -0x8000000)
                return 'i64'
            if (p > 0x8000000)
                return 'u64'
            if (p < 0)
                return 'i32'
            return 'u32'
        }
        if (typeof p === 'boolean')
            return 'bool'
        if (p === null)
            return 'null'
        throw new Error(`Unrecognized primitive: ${p}`)
    }

    const resolveTypes = (formula: Formula): Formula => {
        formula.type = formula.type || (() => {
            assert(!Reflect.has(formula, '$type'))
            if (Reflect.has(formula, '$primitive'))
                return primitiveToNativeType(Reflect.get(formula, '$primitive')) as NativeType

            const {op, args, type} = formula as FunctionFormula
            return resolveNamedTypes((typeChecks as any)[op](args) as NativeType)
        })()
        return formula
    }

    const resolveTypedGetters = (formula: Formula): Formula => {
        if (!Reflect.has(formula, 'args'))
            return formula

        const ff = formula as FunctionFormula
        const args = ff.args as Formula[]
        if (ff.op === 'get') {
            const [object, key] = args
            if (Reflect.has(object.type as object, 'tuple')) {
                const tt = object.type as NativeTupleType
                return {...ff, op: 'at', args: [args[0], {$primitive: (tt.getters as string[]).indexOf(Reflect.get(key, '$primitive')),
                    type: 'u32'}]} as FunctionFormula
            }
        }

        return {...ff, args: (ff.args as Formula[]).map(resolveTypedGetters)} as FunctionFormula
    }

    const getConstant = (f: Formula) =>
        Reflect.has(f, '$primitive') ? Reflect.get(f, '$primitive') : unknownSymbol

    const resolveConstants = (formula: Formula): Formula => {
        if (Reflect.has(formula, '$primitive'))
            return formula

        const ff = formula as FunctionFormula
        const args = (ff.args || []).map(resolveConstants)
        switch (ff.op) {
            case 'at': {
                const constant = getConstant(args[1]) as number
                const t = args[0] as FunctionFormula
                if (t.op === 'tuple')
                    return (t.args as Formula[])[constant]
            }
        }
        return {...formula, args} as Formula
    }

    const resolveContext = (formula: Formula): Formula => {
        if (!Reflect.has(formula, 'op'))
            return formula

        const {op, args} = formula as FunctionFormula
        const a = args || []
        let prevMap = null
        if (op === 'flatMap' || op === 'flatReduce') {
            const m = currentMap = resolveContext(a[0])
            prevMap = currentMap
            const pred = resolveContext(a[1])
            currentMap = prevMap
            const additional = a.slice(2).map(resolveContext)
            return {...formula, args: [m, pred, ...additional]} as FunctionFormula
        }

        if (op === 'source')
            return currentMap as Formula

        return {...formula, args: a.map(resolveContext)} as Formula
    }

    const transformFormula = (formula: Formula): Formula =>
        [resolveFormula, rewrite, resolveTypes, resolveTypedGetters, resolveConstants, resolveContext]
            .reduce((a, f) => f(a), formula)

    im.roots = mapValues(im.roots, transformFormula)
    im.debugInfo = {
        roots: mapValues(im.roots, formulaToString)
    }

    return bundle
}
