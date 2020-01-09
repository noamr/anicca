import { Bundle, LetStatement } from '../types'
import {F, S, R} from './helpers'

export default function transformLetToTable(bundle: Bundle) : Bundle {
    return bundle.flatMap(statement => {
        if (statement.type === 'Let') {
            const tableName = `@let_${statement.name}`
            return [
                S.Table(tableName, { valueType: (statement as LetStatement).valueType}),
                S.Slot(statement.name, { formula: F.get(R(tableName), 0)}),
            ]
        }

        return [statement]
    })
}