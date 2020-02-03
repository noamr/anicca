import {NativeType, RawFormula, StoreSpec} from '../../builder/types'
import { Enqueue, Store } from '../shell/RuntimeTypes'
import {defaultEvaluators, Context, Evaluator} from './evaluators'
import {decode, encode} from './transport'

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
        put: (t, k, v) => (c) => new Map([[0, t(c)], [1, k(c)], [2, v(c)]]),
        delete: () => () => deleteSymbol,
        replace: () => () => replaceSymbol,
        merge: () => () => mergeSymbol,
        noop: () => () => noopSymbol,
    }

    const typedOps: {[op: string]: (args: Evaluator[], getTypes: NativeType) => Evaluator} = {
        decode: ([a], type) => ctx => decode(a(ctx), type),
        encode: ([a], type) => ctx => encode(a(ctx), a.type as NativeType)
    }

    Object.keys(spec.tableTypes).forEach((tableIndex: string) => {
        tables[+tableIndex] = new Map()
    })

    const evaluators = new Map<number, Evaluator>()

    function resolveFormula(f: RawFormula): Evaluator {
        if (Reflect.has(f, 'value')) {
            const value = Reflect.get(f, 'value')
            return () => value
        }

        const {op, args} = f as {op: string, args: number[]}
        if (f.type >= 0) {
            if (Reflect.has(typedOps, op))
                return typedOps[op](args.map(resolveFormulaIndex), spec.types[f.type])
        }
        if (!Reflect.has(ops, op)) {
            throw new Error(`Missing op: ${op}`)
        }

        return ops[op](...args.map(resolveFormulaIndex))
    }

    function resolveFormulaIndex(n: number): Evaluator {
        if (!evaluators.has(n)) {
            const slot = spec.slots[n]
            const evaluator = resolveFormula(slot)
            evaluator.type = spec.types[slot.type]
            evaluator.token = spec.debugInfo[slot.token || 0]
            evaluator.originalFormula = slot
            evaluators.set(n, evaluator)
        }
        return evaluators.get(n) as Evaluator
    }

    Object.values(spec.roots).forEach(resolveFormulaIndex)
    spec.onCommit.forEach(resolveFormulaIndex)

    function evaluateProd<T = any>(index: number, ctx: Context|null = null): T {
        return (evaluators.get(index) as Evaluator)(ctx)
    }

    function evaluateDebug<T = any>(index: number, ctx: Context|null = null): T {
        const slot = spec.slots[index]
        const result = (evaluators.get(index) as Evaluator)(ctx)
        console.log(`Evaluating slot ${index}, ${slot.op}. Token:
            ${slot.token === null ? '' : JSON.stringify(spec.debugInfo[slot.token || 0])}`)
        return result
    }

    const evaluate = evaluateDebug

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

    function commitEntry([table, key, value]: [number, number, any]) {
        update(table as number, key, value)
    }

    return {
        enqueue: (header: number, payload: ArrayBuffer|null) =>
            update(evaluate(spec.roots.inbox), nextID(), [header, payload]),
        awaitIdle: async () => {
            const idle = evaluate<boolean>(spec.roots.idle)
            return idle && !evaluate<Map<number, ArrayBuffer>>(spec.roots.outbox).size
        },
        commit: async () => {
            const stagingData = await evaluate<Map<number, [number, number, any]>>(spec.roots.staging)
            if (stagingData)
                for (const entry of stagingData.values())
                    commitEntry(entry)
        },
        dequeue: async (): Promise<Array<[number, ArrayBuffer]>> => {
            const outbox = evaluate<Map<number, ArrayBuffer>>(spec.roots.outbox)
            for (const commit of spec.onCommit)
                commitEntry(await evaluate(commit))
            return [...outbox.entries()]
        }
    } as Store
}
