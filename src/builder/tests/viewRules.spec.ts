/// </ reference "jest" />
import nearley from 'nearley'
const grammar = require('../viewRules.ne')

const parse = (str: string) => new nearley.Parser(grammar).feed(str).finish()[0]

describe('ViewRules', () => {
    it('rules', () => {
        expect(parse('on click')).toMatchSnapshot()
        expect(parse('attribute src')).toMatchSnapshot()
        expect(parse('content')).toMatchSnapshot()
        expect(parse('data custom')).toMatchSnapshot()
        expect(parse('style border-width')).toMatchSnapshot()
        expect(parse('style --yoyo')).toMatchSnapshot()
    })
})