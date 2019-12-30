import { Enqueue, StartStore } from '../shell/RuntimeTypes'
import { StoreDefinition, Slot } from '../../builder/StoreDefinition'

export default function createStore(def: StoreDefinition) : StartStore {
    return function initStore(dequeue: Enqueue): Enqueue {
        const tables = def.tableTypes.map(t => ({}))
        let memos: {[key: number]: any} = {}
        const slots = def.slots.map(resolveSlot)
        const nextID = (n => () => ++n)(0)
        const extractMathFunctions = (...keys: (keyof Math)[]) =>
            keys.map(k => ({k: (...args: Evaluator[]) => (ctx: Context) => (Math[k] as any).apply(null, args.map(a => a(ctx)))})).reduce((a, o) => Object.assign(a, o), {})

        const extractStringFunctions = <T extends keyof ''>(...keys: T[]) =>
            keys.map(k => ({k: (s: Evaluator, ...args: Evaluator[]) => (ctx: Context) => ((''[k]) as any).call(s(ctx), ...args.map(a => a(ctx)))})).reduce((a, o) => Object.assign(a, o), {})

        const tMap = (table: Evaluator, predicate: Evaluator) =>
                (ctx: Context|null) => Object.keys(tables[table(ctx)]).map((key: string|number) => predicate({key, source: table, aggregate: null}))
                    .reduce((a: any, b: any) => ({...a, ...b}), {})
    
        const tReduce = (table: Evaluator, predicate: Evaluator, initialValue: Evaluator) =>
            (ctx: Context|null) => Object.keys(table).reduce((aggregate: any, key: any) =>
                predicate({source: table(ctx), key, aggregate}), initialValue(ctx))
    
        type Context = {
            key: string | number
            source: any
            aggregate: any
        }

        type Evaluator = (context: Context | null) => any

        const resolvers : {[op: string]: (...args: Evaluator[]) => Evaluator} = {
            plus: (a, b) => c => a(c) + b(c),
            minus: (a, b) => c => a(c) - b(c),
            mult: (a, b) => c => a(c) * b(c),
            div: (a, b) => c => a(c) / b(c),
            mod: (a, b) => c => a(c) % b(c),
            cond: (a, b, c) => ctx => a(ctx) ? b(ctx) : c(ctx),
            isnil: a => ctx => (v => (v === null || typeof v === 'undefined'))(a(ctx)),
            array: (...args: Evaluator[]) => ctx => args.map(a => a(ctx)),
            not: a => ctx => !(a(ctx)),
            bwnot: a => ctx => ~(a(ctx)),
            negate: a => ctx => -(a(ctx)),
            pow: (a, b) => ctx => a(ctx) ** b(ctx),
            get: (a, b) => ctx => a(ctx)[b(ctx)],
            shl: (a, b) => ctx => a(ctx) << b(ctx),
            shr: (a, b) => ctx => a(ctx) >> b(ctx),
            ushr: (a, b) => ctx => a(ctx) >>> b(ctx),
            eq: (a, b) => ctx => a(ctx) === b(ctx),
            lt: (a, b) => ctx => a(ctx) < b(ctx),
            gt: (a, b) => ctx => a(ctx) > b(ctx),
            gte: (a, b) => ctx => a(ctx) >= b(ctx),
            lte: (a, b) => ctx => a(ctx) <= b(ctx),
            bwand: (a, b) => ctx => a(ctx) & b(ctx),
            bwor: (a, b) => ctx => a(ctx) | b(ctx),
            bwxor: (a, b) => ctx => a(ctx) ^ b(ctx),
            and: (a, b) => ctx => a(ctx) && b(ctx),
            or: (a, b) => ctx => a(ctx) || b(ctx),
            entry: (a, b) => ctx => ({[a(ctx)]: b(ctx)}),
            key: () => ctx => ctx && ctx.key,
            primitive: a => ctx => def.primitives[a(ctx)],
            table: (a) => ctx => tables[a(ctx)], 
            value: () => ctx => ctx && ctx.source[ctx.key],
            aggregate: () => ctx => ctx && ctx.aggregate,
            source: () => ctx => ctx && ctx.source,
            now: () => () => Date.now(),
            ref: (slot) => ctx => evaluateMemoized(slot(ctx), ctx),
            object: (...entries: Evaluator[]) => ctx => entries.reduce((a, e) => Object.assign(a, e(ctx)), {}),
            ...extractMathFunctions('sin', 'cos', 'max', 'log', 'random', 'log2', 'log10', 'tan', 'acos', 'asin', 'sqrt', 'floor', 'ceil', 'trunc'),
            ...extractStringFunctions('toLowerCase', 'toUpperCase', 'charAt', 'charCodeAt', 'concat', 'startsWith', 'endsWith', 'includes', 'match'),
            numberToString: (a, radix) => ctx => Number(a(ctx)).toString(radix(ctx)),
            tMap,
            tReduce
        }

        
        function resolveArgs(argListIndex: number) {
            return def.argLists[argListIndex].map(({value}) => 
                resolveSlot(def.slots[def.args[value].value]))
        }

        function resolveSlot(slot: Slot) : Evaluator {
            const args = resolveArgs(slot.args) 
            const op = resolvers[def.nativeOps[slot.op]]
            return op(...args)
        }

        function merge(table: number, value: any) {
            return {...tables[table], ...value}
        }

        function assign(table: number, value: any) {
            tables[table] = value
        }

        function evaluateMemoized(slot: number, ctx: Context | null = null) {
            if (ctx)
                return slots[slot](ctx)

            if (Reflect.has(memos, slot))
                return memos[slot]

            return (memos[slot] = slots[slot](null))
        }

        function enqueue(port: number, buffer: ArrayBuffer) {
            assign(def.locations.inbox, merge(def.locations.inbox, {[nextID()]: {port, buffer}}))
            cycle()
        }

        function cycle() {
            for (;;) {
                const assignments = evaluateMemoized(def.locations.staging) as {[table: number]: any}
                for (let table in assignments)
                    assign(+table, assignments[+table])

                memos = {}

                const nextWakeupTime = evaluateMemoized(def.locations.nextWakeupTime)
                const outbox = evaluateMemoized(def.locations.outbox)
                for (let port in outbox)
                    dequeue(+port, outbox[port])

                const now = Date.now()
                if (nextWakeupTime <= now) 
                    continue

                setTimeout(cycle, nextWakeupTime - now)
                break
            }
        }

        cycle()
        return enqueue
    }    
}
