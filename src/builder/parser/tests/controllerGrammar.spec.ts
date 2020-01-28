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
        expect(parse('after 10 s when a == 1')).toMatchSnapshot()
        expect(parse('after 30 minutes')).toMatchSnapshot()
    })
    it('payload', () => {
        expect(parse('on completed(payload as u32)')).toMatchSnapshot()
        expect(parse('on completed(a as string, b as bool)')).toMatchSnapshot()
        expect(parse('on done()')).toMatchSnapshot()
        expect(parse('on start(payload as SomeType) when a == 1')).toMatchSnapshot()
    })
    it('upon', () => {
        expect(parse('entering')).toMatchSnapshot()
        expect(parse('leaving')).toMatchSnapshot()
    })
})
