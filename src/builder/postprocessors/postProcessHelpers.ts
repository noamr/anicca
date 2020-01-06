import { Formula, Statement, Bundle, PrimitiveFormula, FormulaBuilder } from '../types'
export const P = ($primitive: any) => ({$primitive}) as PrimitiveFormula
export const F = new Proxy({}, {
    get: (t, op: string) => (...args: any[]) => ({
        op, args: args.map(a => typeof a === 'object' ? a : {$primitive: a})
    })
}) as FormulaBuilder

export const S = new Proxy({}, {
    get: (t, type) => (name: string, stuff: any) => ({
        type, name, ...stuff
    })
}) as {[any: string]: (name: any, stuff: any) => Statement}

export const R = ($ref: string) => ({$ref})

export const fmap = (b: Bundle, pred: (s: Statement) => Statement[]) => 
    b.map(pred).reduce((a: any, o: any) => [...a, ...o], [])

export const removeUndefined = (a: any) => JSON.parse(JSON.stringify(a))