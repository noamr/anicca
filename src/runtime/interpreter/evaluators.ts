import { NativeType } from '../../builder/types'

export interface Context<K = any, V = any, A = any> {
    key: K
    source: Evaluator<V>
    aggregate?: A
}

export type Evaluator<T = any> = ((context: Context | null) => T) & {
    type?: NativeType
    token?: any
    originalFormula?: Formula
}

const u2n = (a: any) => typeof a === 'undefined' ? null : a

const extractMathFunctions = (...keys: Array<keyof Math>) =>
    keys.map(k => ({k: (...args: Evaluator[]) => (ctx: Context) =>
        (Math[k] as any).apply(null, args.map(a => a(ctx)))})).reduce((a, o) => Object.assign(a, o), {})

const extractStringFunctions = <T extends keyof ''>(...keys: T[]) =>
    keys.map(k => ({k: (s: Evaluator, ...args: Evaluator[]) => (ctx: Context) =>
        ((''[k]) as any).call(s(ctx), ...args.map(a => a(ctx)))})).reduce((a, o) => Object.assign(a, o), {})

const flatMap = <K, V, K2, V2>(source: Evaluator<Map<K, V>>, predicate: Evaluator<Map<number, Map<number, K2|V2>>>) =>
    (ctx: Context|null) => new Map(Array.from(source(ctx).keys()).flatMap(key => 
        Array.from(predicate({ source, key }))))

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

export const defaultEvaluators: {[op: string]: (...args: Evaluator[]) => Evaluator} = {
    // operators
    plus: (a, b) => c => a(c) + b(c),
    minus: (a, b) => c => a(c) - b(c),
    mult: (a, b) => c => a(c) * b(c),
    div: (a, b) => c => a(c) / b(c),
    mod: (a, b) => c => a(c) % b(c),
    pow: (a, b) => ctx => a(ctx) ** b(ctx),
    negate: a => ctx => -(a(ctx)),
    shl: (a, b) => ctx => a(ctx) << b(ctx),
    shr: (a, b) => ctx => a(ctx) >> b(ctx),
    ushr: (a, b) => ctx => a(ctx) >>> b(ctx),
    bwnot: a => ctx => ~(a(ctx)),
    bwand: (a, b) => ctx => a(ctx) & b(ctx),
    bwor: (a, b) => ctx => a(ctx) | b(ctx),
    bwxor: (a, b) => ctx => a(ctx) ^ b(ctx),

    // comparison
    eq: (a, b) => ctx => a(ctx) === b(ctx),
    neq: (a, b) => ctx => a(ctx) !== b(ctx),
    lt: (a, b) => ctx => a(ctx) < b(ctx),
    gt: (a, b) => ctx => a(ctx) > b(ctx),
    gte: (a, b) => ctx => a(ctx) >= b(ctx),
    lte: (a, b) => ctx => a(ctx) <= b(ctx),

    // Casting
    parseInt: (s, r) => ctx => parseInt(s(ctx), r(ctx)),
    parseFloat: (s) => ctx => parseFloat(s(ctx)),
    formatFloat: (n, f) => ctx => Number(n(ctx)).toFixed(f(ctx)),
    formatInt: (n, r) => ctx => Number(n(ctx)).toString(r(ctx)),

    // Math
    max: (a, b) => (ctx) => Math.max(a(ctx), b(ctx)),
    min: (a, b) => (ctx) => Math.min(a(ctx), b(ctx)),
    sin: a => ctx => Math.sin(a(ctx)),
    cos: a => ctx => Math.cos(a(ctx)),
    asin: a => ctx => Math.asin(a(ctx)),
    acos: a => ctx => Math.acos(a(ctx)),
    tan: a => ctx => Math.tan(a(ctx)),
    atan: a => ctx => Math.atan(a(ctx)),
    abs: a => ctx => Math.abs(a(ctx)),
    floor: a => ctx => Math.floor(a(ctx)),
    ceil: a => ctx => Math.ceil(a(ctx)),
    round: a => ctx => Math.round(a(ctx)),
    random: () => () => Math.random(),

    // String
    toLowerCase: a => ctx => (a(ctx) as string).toLowerCase(),
    toUpperCase: a => ctx => (a(ctx) as string).toUpperCase(),
    charAt: (a, b) => ctx => (a(ctx) as string).charAt(b(ctx)),
    startsWith: (a, b) => ctx => (a(ctx) as string).startsWith(a(ctx)),
    endsWith: (a, b) => ctx => (a(ctx) as string).endsWith(b(ctx)),
    stringIncludes: (a, b) => ctx => (a(ctx) as string).includes(b(ctx)),
    trim: (a) => ctx => (a(ctx) as string).trim(),
    match: (a, b) => ctx => (a(ctx) as string).match(b(ctx)),
    join: (args, separator) => ctx => [...args(ctx).values()].join(separator(ctx)),

    // Logical
    isNil: a => ctx => a(ctx) === null,
    cond: (a, b, c) => ctx => a(ctx) ? b(ctx) : c(ctx),
    not: a => ctx => !(a(ctx)),

    // Constructing
    tuple: <A, B>(...args: Array<Evaluator<A>>): Evaluator<A[]> => ctx => args.map(a => a(ctx)),
    array: <A>(...entries: Array<Evaluator<A>>): Evaluator<Map<number, A>> => ctx =>
        new Map(entries.map((a, i) => [i, a(ctx)] as [number, A])),
    object: <K, V>(...entries: Array<Evaluator<[K, V]>>): Evaluator<Map<K, V>> => ctx =>
        new Map(entries.map(e => e(ctx))),

    // Maps
    get: (a, b) => ctx => u2n((obj => obj && obj.get(b(ctx)))(a(ctx))),
    at: (a, b) => ctx => u2n((obj => obj && obj[b(ctx)])(a(ctx))),
    size: a => ctx => (a(ctx) || {size: 0}).size,
    head: a => ctx => u2n([...(a(ctx) as Map<any, any>).keys()][0]),
    tail: a => ctx => u2n([...(a(ctx) as Map<any, any>).keys()].slice(-1)[0]),
    first: a => ctx => a(ctx)[0],
    second: a => ctx => a(ctx)[1],
    flatMap,
    flatReduce,

    // contextual
    key: () => ctx => ctx && ctx.key,
    value: () => ctx => ctx && ctx.source(ctx).get(ctx.key),
    aggregate: () => ctx => ctx && ctx.aggregate,
    source: () => ctx => ctx && ctx.source(ctx),

    // other
    now: () => () => Date.now()
}
