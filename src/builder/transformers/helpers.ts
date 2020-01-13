import { Bundle, Formula, FormulaBuilder, PrimitiveFormula, Statement } from '../types'
export const P = ($primitive: any) => ({$primitive}) as PrimitiveFormula

function fixArg(a: any): any {
    if (typeof a === 'undefined') {
        debugger
        throw new Error('Unexpected undefined')
    }

    if (typeof a !== 'object' || a === null)
        return {$primitive: a}

    if (a.$ref || Reflect.has(a, '$primitive'))
        return a

    if (Array.isArray(a))
        return {op: a.length === 2 ? 'pair' : 'array', args: a.map(fixArg)}

    if (a.op)
        return {op: a.op, args: (a.args || []).map(fixArg)}

    console.log(a)
    return {op: 'object', args: Object.entries(a).map(([key, value]) => F.pair(key, value))}
}

export const F = new Proxy({}, {
    get: (t, op: string) => (...args: any[]) => ({
        op, args: args.map(fixArg),
    }),
}) as FormulaBuilder

export const S = new Proxy({}, {
    get: (t, type) => (name: string, stuff?: any) => ({
        type, name, ...stuff,
    }),
}) as {[x: string]: (name: any, stuff?: any) => Statement}

export const R = ($ref: string) => ({$ref})

export const removeUndefined = (a: any) => JSON.parse(JSON.stringify(a))
