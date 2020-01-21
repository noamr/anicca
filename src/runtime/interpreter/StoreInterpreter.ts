import {RawFormula, StoreSpec} from '../../builder/types'
import { Enqueue, Store } from '../shell/RuntimeTypes'
import {defaultEvaluators, Context, Evaluator} from './evaluators'

const noopSymbol = Symbol('noop')
const deleteSymbol = Symbol('delete')
const replaceSymbol = Symbol('replace')
const mergeSymbol = Symbol('merge')



export default function createStoreInterpreter(spec: StoreSpec) {
    const tables: {[index: number]: Map<any, any>} = {}
    const nextID = ((n: number) => () => ++n)(0)

    const ops: {[op: string]: (...args: Evaluator[]) => Evaluator} = {
        ...defaultEvaluators,
        table: (a) => ctx => tables[a(ctx)],
        uid: () => nextID,
        delete: (t, k) => (c) => new Map([[0, t(c)], [1, k(c)], [2, deleteSymbol]]),
        put: (t, k, v) => (c) => new Map([[0, t(c)], [1, k(c)], [2, v(c)]]),
        replace: () => () => replaceSymbol,
        merge: () => () => mergeSymbol,
        noop: () => () => noopSymbol
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

            default:
                if (value === deleteSymbol)
                    ensure().delete(key)
                else
                    ensure().set(key, value)
        }
    }

    function commitEntry(entry: Map<number, number>) {
        const [table, key, value] = [entry.get(0), entry.get(1), entry.get(2)]
        update(table as number, key, value)
    }

    return {
        enqueue: (header: number, payload: ArrayBuffer|null) =>
            update(evaluate(spec.roots.inbox), nextID(), [header, payload]),
        awaitIdle: async () => evaluate<boolean>(spec.roots.idle),
        commit: async () => {
            const stagingData = await evaluate<Map<number, Map<number, number>>>(spec.roots.staging)
            for (const entry of stagingData.values())
                commitEntry(entry)
        },
        dequeue: async (): Promise<Array<[number, ArrayBuffer]>> => {
            const outbox = evaluate<Map<number, ArrayBuffer>>(spec.roots.outbox)
            const commitDiff = await evaluate<Map<number, number>>(spec.roots.commitViewDiff)
            commitEntry(commitDiff)
            return [...outbox.entries()]
        }
    } as Store
}
