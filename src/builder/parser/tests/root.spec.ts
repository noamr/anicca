/// </ reference "jest" />
import nearley from 'nearley'
const grammar = require('../root.ne')

const parse = (str: string) => new nearley.Parser(grammar).feed(str).finish()[0]

describe('Root', () => {
    it('rules', () => {
        expect(parse('controller abc')).toMatchSnapshot()
        expect(parse('view abc')).toMatchSnapshot()
        expect(parse('slot abcSlot')).toMatchSnapshot()
        expect(parse('bus myBus')).toMatchSnapshot()
    })
})
