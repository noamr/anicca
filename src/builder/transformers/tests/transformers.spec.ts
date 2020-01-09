import {flattenState} from '../flattenStatechart'
import transformLetToTable from '../resolveTables'

import {
    parse,
} from '../../index'

describe('transformers', () => {
    it('let to table', () => {
        expect(transformLetToTable(parse(`
        let variable: u32
    `))).toEqual(parse(`
        table @let_variable: u32

        slot variable:
            @let_variable[0]
        `, {
            internal: true,
        }))
    })

})
