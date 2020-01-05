import { Formula, Statement, Bundle } from '../types'
export const F = new Proxy({}, {
    get: (t, op) => (...args: any[]) => ({
        op, args: args.map(a => typeof a === 'object' ? a : {$primitive: a})
    })
}) as {[any: string]: (...args: any[]) => Formula}

export const S = new Proxy({}, {
    get: (t, type) => (name: string, stuff: any) => ({
        type, name, ...stuff
    })
}) as {[any: string]: (name: any, stuff: any) => Statement}

export const R = ($ref: string) => ({$ref})

export const fmap = (b: Bundle, pred: (s: Statement) => Statement[]) => 
    b.map(pred).reduce((a: any, o: any) => [...a, ...o], [])

export const removeUndefined = (a: any) => JSON.parse(JSON.stringify(a))