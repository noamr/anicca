import { Bundle, EnumStatement, LetStatement, FunctionFormula,
         TableStatement, TransformData, TypedFormula, NativeDictionaryType, NativeType, NativeTupleType } from '../types'
import { F, R, S, assert } from './helpers'
import {assign} from 'lodash'


export default function transformTables(bundle: Bundle, im: TransformData): Bundle {

    const enums = bundle.filter(s => s.type === 'Enum').map(s => {
        const {values, name} = s as EnumStatement
        const v = Object.values(values)
        const enumType = v.some(v => Math.floor(v) !== v) ? 'f64' : 'i32'
        const type = {
            getters: Object.keys(values),
            tuple: v.map(() => enumType)
        } as NativeTupleType
        return {
            [name as string]: {
                op: 'tuple',
                type,
                args: v.map(n => ({$primitive: n, type: enumType}))
            } as FunctionFormula
        }
    }).reduce(assign, {}) as {[key: string]: FunctionFormula }

    const resolveNamedTypes = (t: NativeType | string): NativeType => {
        if (typeof t === 'string' && enums[t])
            return 'i32'

        if (typeof t !== 'object')
            return t as NativeType

        if (Reflect.has(t, 'tuple'))
            return {...t, tuple: ((t as NativeTupleType).tuple || []).map(resolveNamedTypes)}
        if (Reflect.has(t, 'dictionary'))
            return {...t, dictionary: ((t as NativeDictionaryType).dictionary || [])
                .map(resolveNamedTypes) as [NativeType, NativeType]}
        return t as NativeType
    }

    im.enums = enums
    im.resolveNamedTypes = resolveNamedTypes

    im.getTableType = (tableName: string) =>
        resolveNamedTypes((assert(bundle.find(({type, name}) =>
            type === 'Table' && name === tableName)) as TableStatement).valueType)

    return bundle.flatMap(statement => {
        if (statement.type === 'Let') {
            const tableName = `@let_${statement.name}`
            return [
                S.Table(tableName, { valueType: (statement as LetStatement).valueType}),
                S.Slot(statement.name, { formula: F.get({$ref: tableName}, 0)}),
            ]
        }

        return [statement]
    })
}
