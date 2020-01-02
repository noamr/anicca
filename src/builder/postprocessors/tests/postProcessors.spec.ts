import letToTable from '../letToTable'
import {
    parse
} from '../../index'

describe('post-processors', () => {
    it('let to table', () => {
        expect(letToTable(parse(`
        let variable: u32
    `))).toEqual(parse(`
        table @let_variable: u32

        slot variable:
            @let_variable[0]
        `, {
            internal: true
        }))
    })
})