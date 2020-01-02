/// </ reference "jest" />
import nearley from 'nearley'
const grammar = require('../eventActions.ne')

const parse = (str: string) => new nearley.Parser(grammar).feed(str).finish()[0]

describe('controllerActions', () => {
    it('actions', () => {
        expect(parse('dispatch someEvent to someController')).toMatchSnapshot()
        expect(parse('run script')).toMatchSnapshot()
    })
})