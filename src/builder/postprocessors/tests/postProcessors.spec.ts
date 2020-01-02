import letToTable from '../letToTable'
import {
    parse
} from '../../index'

describe('post-processors', () => {
    it('let to table', () => {
        expect(letToTable(parse(`
        Let variable: u32
    `))).toEqual(parse(`
        Table @let_variable: u32

        Slot variable:
            @let_variable[0]
        `, {
            internal: true
        }))
    })
})