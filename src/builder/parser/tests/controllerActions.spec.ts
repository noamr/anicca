/// </ reference "jest" />
import nearley from 'nearley'
const grammar = require('../controllerActions.ne')

const parse = (str: string) => new nearley.Parser(grammar).feed(str).finish()[0]

describe('controllerActions', () => {
    it('actions', () => {
        expect(parse('goto someState')).toMatchSnapshot()
        expect(parse('dispatch someEvent')).toMatchSnapshot()
        expect(parse('dispatch someEvent to someController')).toMatchSnapshot()
        expect(parse('abc += bla')).toMatchSnapshot()
        expect(parse('tag *= 1.3')).toMatchSnapshot()
        expect(parse('hello /= (1 + ABC)')).toMatchSnapshot()
    })
})