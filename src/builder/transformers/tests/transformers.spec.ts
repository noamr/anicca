import {flattenState} from '../flattenStatechart'
import transformLetToTable from '../resolveTables'
import transform from '../transform'
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

    describe('all', () => {
        expect(transform(parse(`
view myView:
    '#output':
        content: value
    '#increment':
        on click:
            dispatch increment to myController

controller myController:
    state root:
        entering:
            value = 0

        on increment:
            value += 1

let value: u32

        `))).toMatchSnapshot()
    })
})
