import { Bundle, LetStatement, TransformData } from '../types'
import {F, R, S} from './helpers'

export default function transformLetToTable(bundle: Bundle): Bundle {
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
