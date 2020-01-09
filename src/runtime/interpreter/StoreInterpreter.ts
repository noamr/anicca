import { Enqueue, Store } from '../shell/RuntimeTypes'
import {StoreSpec, RawFormula} from '../../builder/types'

const noopSymbol = Symbol('noop')
const deleteSymbol = Symbol('delete')
const replaceSymbol = Symbol('replace')
const mergeSymbol = Symbol('merge')

type Context = {
    key: any
    source: any
    aggregate: any
}
type Evaluator<T = any> = (context: Context | null) => T

const extractMathFunctions = (...keys: (keyof Math)[]) =>
    keys.map(k => ({k: (...args: Evaluator[]) => (ctx: Context) => (Math[k] as any).apply(null, args.map(a => a(ctx)))})).reduce((a, o) => Object.assign(a, o), {})

const extractStringFunctions = <T extends keyof ''>(...keys: T[]) =>
    keys.map(k => ({k: (s: Evaluator, ...args: Evaluator[]) => (ctx: Context) => ((''[k]) as any).call(s(ctx), ...args.map(a => a(ctx)))})).reduce((a, o) => Object.assign(a, o), {})

const flatMap = <K, V>(source: Evaluator<Map<K, V>>, predicate: Evaluator<[any, any][]>) =>
    (ctx: Context|null) => [...source(ctx).keys()].flatMap((key) => predicate({source, key, aggregate: null}))

const flatReduce = (src: Evaluator, predicate: Evaluator, initialValue: Evaluator) => (ctx: Context|null) => {
    const source = src(ctx)
    const keys = [...source.keys()]
    let aggregate = initialValue(ctx)
    for (let key of keys) {
        const [result, final] = predicate({source, key, aggregate})
        if (final)
            return result

        aggregate = result
    }

    return aggregate
}
    
export default function createStoreInterpreter(spec: StoreSpec) {
    const tables: {[index: number]: Map<any, any>} = {}
    const nextID = ((n: number) => () => ++n)(0)

    const ops : {[op: string]: (...args: Evaluator[]) => Evaluator} = {
        plus: (a, b) => c => a(c) + b(c),
        minus: (a, b) => c => a(c) - b(c),
        mult: (a, b) => c => a(c) * b(c),
        div: (a, b) => c => a(c) / b(c),
        mod: (a, b) => c => a(c) % b(c),
        and: (a, b) => ctx => a(ctx) && b(ctx),
        or: (a, b) => ctx => a(ctx) || b(ctx),
        cond: (a, b, c) => ctx => a(ctx) ? b(ctx) : c(ctx),
        isnil: a => ctx => a(ctx) === null,
        not: a => ctx => !(a(ctx)),
        bwnot: a => ctx => ~(a(ctx)),
        negate: a => ctx => -(a(ctx)),
        pow: (a, b) => ctx => a(ctx) ** b(ctx),
        get: (a, b) => ctx => a(ctx)[b(ctx)],
        shl: (a, b) => ctx => a(ctx) << b(ctx),
        shr: (a, b) => ctx => a(ctx) >> b(ctx),
        ushr: (a, b) => ctx => a(ctx) >>> b(ctx),
        eq: (a, b) => ctx => a(ctx) === b(ctx),
        neq: (a, b) => ctx => a(ctx) != b(ctx),
        lt: (a, b) => ctx => a(ctx) < b(ctx),
        gt: (a, b) => ctx => a(ctx) > b(ctx),
        gte: (a, b) => ctx => a(ctx) >= b(ctx),
        lte: (a, b) => ctx => a(ctx) <= b(ctx),
        bwand: (a, b) => ctx => a(ctx) & b(ctx),
        bwor: (a, b) => ctx => a(ctx) | b(ctx),
        bwxor: (a, b) => ctx => a(ctx) ^ b(ctx),
        pair: (a, b) => ctx => [a(ctx), b(ctx)],
        key: () => ctx => ctx && ctx.key,
        table: (a) => ctx => tables[a(ctx)], 
        value: () => ctx => ctx && ctx.source[ctx.key],
        aggregate: () => ctx => ctx && ctx.aggregate,
        source: () => ctx => ctx && ctx.source,
        now: () => () => Date.now(),
        delete: () => () => deleteSymbol,
        replace: () => () => replaceSymbol,
        merge: () => () => mergeSymbol,
        noop: () => () => noopSymbol,
        uid: () => nextID,
        parseInt: (s, r) => ctx => parseInt(s(ctx), r(ctx)),
        parseFloat: (s) => ctx => parseFloat(s(ctx)),
        formatNumber: (n, r) => ctx => Number(n(ctx)).toString(r(ctx)),
        array: (...entries: Evaluator[]) => ctx => new Map(entries.map((e, i) => ([i, e(ctx)] as [number, any]))),
        object: (...entries: Evaluator[]) => ctx => new Map(entries.map(e => e(ctx))),
        ...extractMathFunctions('sin', 'cos', 'max', 'log', 'random', 'log2', 'log10', 'tan', 'acos', 'asin', 'sqrt', 'floor', 'ceil', 'trunc'),
        ...extractStringFunctions('toLowerCase', 'toUpperCase', 'charAt', 'charCodeAt', 'concat', 'startsWith', 'endsWith', 'includes', 'match'),
        map: flatMap,
        reduce: flatReduce
    }
    
    const evaluators = spec.slots.map(s => (c: Context|null = null) => evaluateFormula(s, c))
    function evaluateFormula(f: RawFormula, c: Context|null): any {
        if (Reflect.has(f, 'value'))
            return (f as {value: any}).value

        const {op, args} = f as {op: string, args: number[]}
        return ops[op](...args.map(n => evaluate(n, c)))
    }

    function evaluate<T = any>(index: number, ctx: Context|null = null) {
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
                tables[table] && tables[table].delete(key)
                break


            default:
                ensure().set(key, value)
        }
    }

    return {
        enqueue: (header: number, payload: ArrayBuffer|null) => update(spec.roots.inbox, nextID(), [header, payload]),
        awaitIdle: async () => evaluate<boolean>(spec.roots.idle),
        commit: async () => {
            const stagingData = await evaluate<Array<[number, number, number]>>(spec.roots.staging)
            for (let [table, key, value] of stagingData) {
                const ekey = await evaluate(key)
                const evalue = await evaluate(value)
                update(table, ekey, evalue)
            }
        },
        dequeue: async () => evaluate<Array<[number, ArrayBuffer]>>(spec.roots.idle)
    } as Store
}