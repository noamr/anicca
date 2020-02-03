import { Bundle, Formula, FormulaBuilder, PrimitiveFormula, Statement, WithToken, Token } from '../types'
export const P = ($primitive: any) => ({$primitive}) as PrimitiveFormula

function fixArg(a: any): any {
    if (typeof a === 'undefined') {
        throw new Error('Unexpected undefined')
    }

    if (typeof a !== 'object' || a === null)
        return {$primitive: a}

    if (a.$ref || Reflect.has(a, '$primitive') || Reflect.has(a, '$type'))
        return a

    if (Array.isArray(a)) {
        return {op: 'array', args: a.map(fixArg)}
    }

    if (a.op)
        return {...a, args: (a.args || []).map(fixArg)}

    return {op: 'object', args: Object.entries(a).map(([key, value]) => F.pair(key, value)), $token: a.$token}
}


export function assert<T>(value: T | null | undefined, message?: string): T {
    if (value)
        return value

    if (message)
        throw new Error(message)

    const error = new Error('assertion')
    if (error.stack) {
        const lines = error.stack.split('n')
        if (lines && lines.length > 2) {
            const relevantLine = lines[2]
            const match = relevantLine.match(/(?<=at )\w+ \([^$]+\)/)
            if (match)
                error.message = `Assertion failed at ${match[0]}`
        }
    }
    throw error
}

export function withInfo<T extends Formula = Formula>(f: T, info: string | null): T {
    if (!info)
        return f
    return {...f, $token: {...f.$token, info}}
}

function createToken(error: Error): Partial<Token> | null{
    return (((error.stack || '').split('\n')[2] || '')
    .match(/\((?<file>[^:]+):(?<line>\d+):(?<col>\d+)\)/i) || {groups: null}).groups || null
}

export const F = new Proxy({}, {
    get: (t, op: string) => (...args: any[]) => ({
        op, args: args.map(fixArg), $token: createToken(new Error())
    }),
}) as FormulaBuilder

export const S = new Proxy({}, {
    get: (t, type) => (name: string, stuff?: any) => ({
        type, name, ...stuff,
    }),
}) as {[x: string]: (name: any, stuff?: any) => Statement}

export const R = ($ref: string) => ({$ref})

export const removeUndefined = (a: any) => JSON.parse(JSON.stringify(a))
