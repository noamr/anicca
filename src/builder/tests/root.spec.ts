/// </ reference "jest" />
import nearley from 'nearley'
const grammar = require('../root.ne')

const parse = (str: string) => new nearley.Parser(grammar).feed(str).finish()[0]

describe('Root', () => {
    it('rules', () => {
        expect(parse('Controller abc')).toMatchSnapshot()
        expect(parse('View abc')).toMatchSnapshot()
        expect(parse('Main')).toMatchSnapshot()
        expect(parse('Slot abcSlot')).toMatchSnapshot()
        expect(parse('Bus bus')).toMatchSnapshot()
    })
})