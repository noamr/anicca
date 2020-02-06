import {NativeType, RawFormula, StoreSpec} from '../../builder/types'
import { Enqueue, Store } from '../shell/RuntimeTypes'
import {defaultEvaluators, Context, Evaluator} from './evaluators'
import {decode, encode} from '../common/transport'

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

    const evaluate = evaluateProd

    function cloneDeep(o: any): any {
        if (!o || typeof o !== 'object')
            return o

        if (Array.isArray(o))
            return o.map(cloneDeep)

        if (o instanceof Map)
            return new Map([...o.entries()].map(cloneDeep))
        if (o instanceof ArrayBuffer)
            return (o.slice(0, o.byteLength))
        return Object.entries(o).map(cloneDeep).reduce((a, o) => ({[o[0]]: o[1]}), {})
    }

    function update(table: number, key: any, value: any) {
        const ensure = () => (tables[table] || (tables[table] = new Map<any, any>())) as Map<any, any>
        switch (key) {
            case noopSymbol:
                return

            case replaceSymbol:
                tables[table] = cloneDeep(value)
                break

            case mergeSymbol:
                [...value].forEach(([k, v]) => ensure().set(k, v))
                break

            default:
                if (value === deleteSymbol)
                    ensure().delete(key)
                else
                    ensure().set(key, cloneDeep(value))
        }
    }

    function commitEntry([table, key, value]: [number, number, any]) {
        update(table as number, key, value)
    }

    function dequeue(emit: (header: number, payload: ArrayBuffer) => Promise<void>) {
        const outbox = evaluate<Map<number, ArrayBuffer>>(spec.roots.outbox)
        if (!outbox.size)
            return
        for (const commit of spec.onCommit)
            commitEntry(evaluate(commit))
        for (const [header, payload] of outbox)
            emit(header, payload)
    }

    return {
        enqueue: (header: number, payload: ArrayBuffer|null) =>
            update(evaluate(spec.roots.inbox), nextID(), [header, payload]),
        commit: async (emit: (target: number, payload: ArrayBuffer) => Promise<void>): Promise<void> => {
            do {
                dequeue(emit)
                const stagingData = evaluate<Map<number, [number, number, any]>>(spec.roots.staging)
                if (stagingData) {
                    for (const entry of stagingData.values())
                        commitEntry(entry)
                    dequeue(emit)
                }

            } while (!evaluate<boolean>(spec.roots.idle))
        }
    } as Store
}
