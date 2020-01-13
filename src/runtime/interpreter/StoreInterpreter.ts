import {RawFormula, StoreSpec} from '../../builder/types'
import { Enqueue, Store } from '../shell/RuntimeTypes'

const noopSymbol = Symbol('noop')
const deleteSymbol = Symbol('delete')
const replaceSymbol = Symbol('replace')
const mergeSymbol = Symbol('merge')

interface Context {
    key: any
    source: any
    aggregate?: any
}

type Evaluator<T = any> = (context: Context | null) => T

const extractMathFunctions = (...keys: Array<keyof Math>) =>
    keys.map(k => ({k: (...args: Evaluator[]) => (ctx: Context) =>
        (Math[k] as any).apply(null, args.map(a => a(ctx)))})).reduce((a, o) => Object.assign(a, o), {})

const extractStringFunctions = <T extends keyof ''>(...keys: T[]) =>
    keys.map(k => ({k: (s: Evaluator, ...args: Evaluator[]) => (ctx: Context) =>
        ((''[k]) as any).call(s(ctx), ...args.map(a => a(ctx)))})).reduce((a, o) => Object.assign(a, o), {})

const flatMap = <K, V>(source: Evaluator<Map<K, V>>, predicate: Evaluator<Map<number, Map<any, any>>>) =>
    (ctx: Context|null) => {
        const src = source(ctx)
        const values = [...src.keys()].flatMap(key => [...predicate({ source, key }).entries()])
        return new Map(values)
    }

const flatReduce = (src: Evaluator, predicate: Evaluator, initialValue: Evaluator) => (ctx: Context|null) => {
    const source = src(ctx)
    const keys = [...source.keys()]
    let aggregate = initialValue(ctx)
    for (const key of keys) {
        const [result, final] = predicate({source, key, aggregate})
        if (final)
            return result

        aggregate = result
    }

    return aggregate
}

const encode = (src: Evaluator) => (ctx: Context|null) => {
    const value = src(ctx) as Map<number, Uint8Array>
    for (const k of value.keys())
        value.set(k, new TextEncoder().encode('' + value.get(k)))

    const buffer = new ArrayBuffer(Array.from(value.values()).map(b => b.length + 8).reduce((s, p) => s + p, 0))
    const dv = new DataView(buffer)
    let offset = 0
    for (const [header, payload] of value.entries()) {
        const length = payload.length
        dv.setUint32(offset, header)
        dv.setUint32(offset + 4, payload.length)
        new Uint8Array(buffer, offset + 8).set(payload)
        offset += length + 8
    }
    return buffer
}

export default function createStoreInterpreter(spec: StoreSpec) {
    const tables: {[index: number]: Map<any, any>} = {}
    const nextID = ((n: number) => () => ++n)(0)

    const ops: {[op: string]: (...args: Evaluator[]) => Evaluator} = {
        plus: (a, b) => c => a(c) + b(c),
        minus: (a, b) => c => a(c) - b(c),
        mult: (a, b) => c => a(c) * b(c),
        div: (a, b) => c => a(c) / b(c),
        mod: (a, b) => c => a(c) % b(c),
        not: a => ctx => !(a(ctx)),
        bwnot: a => ctx => ~(a(ctx)),
        negate: a => ctx => -(a(ctx)),
        pow: (a, b) => ctx => a(ctx) ** b(ctx),
        get: (a, b) => ctx => a(ctx).get(b(ctx)),
        shl: (a, b) => ctx => a(ctx) << b(ctx),
        shr: (a, b) => ctx => a(ctx) >> b(ctx),
        ushr: (a, b) => ctx => a(ctx) >>> b(ctx),
        eq: (a, b) => ctx => a(ctx) === b(ctx),
        neq: (a, b) => ctx => a(ctx) !== b(ctx),
        lt: (a, b) => ctx => a(ctx) < b(ctx),
        gt: (a, b) => ctx => a(ctx) > b(ctx),
        gte: (a, b) => ctx => a(ctx) >= b(ctx),
        lte: (a, b) => ctx => a(ctx) <= b(ctx),
        bwand: (a, b) => ctx => a(ctx) & b(ctx),
        bwor: (a, b) => ctx => a(ctx) | b(ctx),
        bwxor: (a, b) => ctx => a(ctx) ^ b(ctx),

        table: (a) => ctx => tables[a(ctx)],

        key: () => ctx => ctx && ctx.key,
        value: () => ctx => ctx && ctx.source(ctx).get(ctx.key),
        aggregate: () => ctx => ctx && ctx.aggregate,
        source: () => ctx => ctx && ctx.source(ctx),

        now: () => () => Date.now(),
        uid: () => nextID,

        parseInt: (s, r) => ctx => parseInt(s(ctx), r(ctx)),
        parseFloat: (s) => ctx => parseFloat(s(ctx)),
        formatNumber: (n, r) => ctx => Number(n(ctx)).toString(r(ctx)),
        ...extractMathFunctions('sin', 'cos', 'max', 'log', 'random', 'log2', 'log10', 'tan', 'acos', 'asin', 'sqrt', 'floor', 'ceil', 'trunc'),
        ...extractStringFunctions('toLowerCase', 'toUpperCase', 'charAt', 'charCodeAt', 'concat', 'startsWith', 'endsWith', 'includes', 'match'),

        delete: (t, k) => (c) => new Map([[0, t(c)], [1, k(c)], [2, deleteSymbol]]),
        put: (t, k, v) => (c) => new Map([[0, t(c)], [1, k(c)], [2, v(c)]]),
        replace: () => () => replaceSymbol,
        merge: () => () => mergeSymbol,
        noop: () => () => noopSymbol,

        cond: (a, b, c) => ctx => a(ctx) ? b(ctx) : c(ctx),
        concat: <A>(a: Evaluator<Map<number, A>>, b: Evaluator<Map<number, A>>): Evaluator<Map<number, A>> => 
            ctx => new Map([...a(ctx).entries()]
                .concat([...b(ctx).entries()].map(([k, v]) => [k + a(ctx).size, v] as [number, A]))),

        pair: <A, B>(a: Evaluator<A>, b: Evaluator<B>): Evaluator<Map<number, A|B>> => ctx =>
            new Map([[0, a(ctx)] as [number, A|B], [1, b(ctx)] as [number, A|B]]),
        array: <A>(...entries: Array<Evaluator<A>>): Evaluator<Map<number, A>> =>
            ctx => new Map(entries.map((e, i) => ([i, e(ctx)] as [number, A]))),
        object: <K, V>(...entries: Array<Evaluator<Map<number, K|V>>>): Evaluator<Map<K, V>> => ctx =>
            new Map(entries.map(e => [e(ctx).get(0), e(ctx).get(1)] as [K, V])),

        size: a => ctx => a(ctx).size,
        head: a => ctx => [...(a(ctx) as Map<any, any>).keys()][0],
        tail: a => ctx => [...(a(ctx) as Map<any, any>).keys()].slice(-1)[0],
        encode,
        flatMap,
        flatReduce,
    }

    Object.keys(spec.tableTypes).forEach((tableIndex: string) => {
        tables[+tableIndex] = new Map()
    })

    const evaluators = spec.slots.map(s => (c: Context|null = null) => evaluateFormula(s, c))
    function evaluateFormula(f: RawFormula, c: Context|null): any {
        if (Reflect.has(f, 'value'))
            return (f as {value: any}).value

        const {op, args} = f as {op: string, args: number[]}
        return ops[op](...args.map(n => (ctx: Context|null) => evaluate(n, ctx)))(c)
    }

    function evaluate<T = any>(index: number, ctx: Context|null = null): T {
        return evaluators[index](ctx)
    }

    function update(table: number, key: any, value: any) {
        const ensure = () => (tables[table] || (tables[table] = new Map<any, any>())) as Map<any, any>
        switch (key) {
            case noopSymbol:
                return

            case replaceSymbol:
                tables[table] = new Map(value as Map<any, any>)
                break

            case mergeSymbol:
                [...value].forEach(([k, v]) => ensure().set(k, v))
                break

            case deleteSymbol:
                if (tables[table])
                    tables[table].delete(key)
                break

            default:
                ensure().set(key, value)
        }
    }

    return {
        enqueue: (header: number, payload: ArrayBuffer|null) => update(spec.roots.inbox, nextID(), [header, payload]),
        awaitIdle: async () => evaluate<boolean>(spec.roots.idle),
        commit: async () => {
            const stagingData = await evaluate<Map<number, Map<number, number>>>(spec.roots.staging)
            for (const entry of stagingData.values()) {
                const [table, key, value] = [entry.get(0), entry.get(1), entry.get(2)]
                update(table as number, key, value)
            }
        },
        dequeue: async (): Promise<Array<[number, ArrayBuffer]>> => {
            const outbox = evaluate<Map<number, Map<0|1, ArrayBuffer|number>>>(spec.roots.outbox)
            return [...outbox.entries()].map(([index, message]) => 
                [message.get(0) as number, message.get(1)] as [number, ArrayBuffer])
        }
    } as Store
}
