/// </ reference "jest" />
import nearley from 'nearley'
const controllerGrammar = require('../controller.ne')

const parse = (str: string) => new nearley.Parser(controllerGrammar).feed(str).finish()[0]

describe('controller grammar', () => {
    it('state', () => {
        expect(parse('state myState')).toMatchSnapshot()
        expect(parse('parallel myState')).toMatchSnapshot()
        expect(parse('history myState')).toMatchSnapshot()
        expect(parse('deep history myState')).toMatchSnapshot()
        expect(parse('shallow history myState')).toMatchSnapshot()
        expect(parse('final myState')).toMatchSnapshot()
        expect(parse('initial')).toMatchSnapshot()
    })

    it('transition', () => {
        expect(parse('on someEvent')).toMatchSnapshot()
        expect(parse('when someCondition + (a - 1) * grumpy()')).toMatchSnapshot()
        expect(parse('on someEvent when a == 1')).toMatchSnapshot()
        expect(parse('when true')).toMatchSnapshot()
    })
    it('upon', () => {
        expect(parse('entering')).toMatchSnapshot()
        expect(parse('leaving')).toMatchSnapshot()
    })
})
