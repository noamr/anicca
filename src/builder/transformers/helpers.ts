import { Formula, Statement, Bundle, PrimitiveFormula, FormulaBuilder } from '../types'
export const P = ($primitive: any) => ({$primitive}) as PrimitiveFormula

function fixArg(a: any) {
    if (typeof a === 'undefined')
        throw new Error('Unexpected undefined')
    if (typeof a !== 'object' || a === null)
        return {$primitive: a}

    if (a.$ref || a.$primitive)
        return a

    if (Array.isArray(a))
        return F.array(...a)

    if (!a.$T)
        return F.object(...Object.entries(a).map(([key, value]) => F.pair(key, value)))
    
}


export const F = new Proxy({}, {
    get: (t, op: string) => (...args: any[]) => ({
        op, args: args.map(fixArg)
    })
}) as FormulaBuilder

export const S = new Proxy({}, {
    get: (t, type) => (name: string, stuff?: any) => ({
        type, name, ...stuff
    })
}) as {[any: string]: (name: any, stuff?: any) => Statement}

export const R = ($ref: string) => ({$ref})

export const removeUndefined = (a: any) => JSON.parse(JSON.stringify(a))