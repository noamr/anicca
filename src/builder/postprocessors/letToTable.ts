import { Bundle, LetStatement } from '../types'
import {F, S, R, fmap} from './postProcessHelpers'

export default function processLetToTable(bundle: Bundle) : Bundle {
    return fmap(bundle, statement => {
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