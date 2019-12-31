/// </ reference "jest" />
import nearley from 'nearley'
const kalGrammar = require('../kal.ne')
import {
    Formula,
    FunctionFormula,
    PrimitiveFormula,
    ReferenceFormula,
    Bundle
} from '../types'

const parse = (str: string): Bundle => new nearley.Parser(kalGrammar).feed(str).finish()[0]
const removeTokens = (a: any): any =>
    a && Array.isArray(a) ? a.map(removeTokens) : Object.keys(a)
    .map(k => k === '$token' ? {} : {
        [k]: a[k]
    })
    .reduce((a, o) => Object.assign(a, o), {})

const parseRaw = (str: string) => removeTokens(parse(str))
describe('kal', () => {
    describe('formulas', () => {
        it('slot', () => {
            expect(parse(`
        slot s
            a + 1
        `)).toMatchSnapshot()
        })
        it('slot 2', () => {
            expect(parse(`
        slot Abc1
            (a + 1) ** (13 / 7 & X) |> sin()
        `)).toMatchSnapshot()
        })
        it('slot 3', () => {
            expect(parse(`
        slot pipe
            2 |> sin()
        `)).toMatchSnapshot()
        })
    })

    describe('main', () => {
        it('main', () => {
            expect(parse(`
            main
                use hello
                use view

    `)).toMatchSnapshot()
        })
    })

    describe('bus', () => {
        it('bus', () => {
            expect(parse(`
            bus myBus
    `)).toMatchSnapshot()

        })
    })
    describe('vars', () => {
        it('let', () => {
            expect(parse(`
            let abc = 1
    `)).toMatchSnapshot()

        })
        it('const', () => {
            expect(parse(`
            const hello = 1
            let abc = '123'
            let ahf = 'blabla'
    `)).toMatchSnapshot()

        })
        it('with refs', () => {
            expect(parse(`
            const hello = abc
            let abc = abc:a$0
    `)).toMatchSnapshot()

        })
    })

    describe('macro', () => {
        it('no args', () => {
            expect(parse(`
            macro abc()
                a + 1
    `)).toMatchSnapshot()
        })
        it('some args', () => {
            expect(parse(`
            macro abc(a)
                a + 1
    `)).toMatchSnapshot()
        })
        it('several args', () => {
            expect(parse(`
            macro abc(a, b)
                a + 13 * b
    `)).toMatchSnapshot()
        })
    })

    describe('files', () => {
        it('import', () => {
            expect(parse(`
            import 'hello.kal' as hello
            `)).toMatchSnapshot()
        })
    })

    describe('view', () => {
        it('all kinda stuff', () => {
            expect(parse(`
            view myView
                #someId
                    bind html to someText
                    on click
                        dispatch someEvent to someController
                
            `)).toMatchSnapshot()
        })
        it('strange selectors', () => {
            expect(parse(`
            view myView
                div
                    on click
                        prevent default
                div[ab=123]
                    on click
                        dispatch someEvent to someABC
                        prevent default
                *[yo]
                    bind html to 123
                
            `)).toMatchSnapshot()
        })
    })

    describe('controller', () => {
        it('long statechart', () => {
            expect(parse(`
            controller myController
                state someState
                    anotherState
                        on click
                            a+= 1
                    on someEvent
                        abc = 3
            `)).toMatchSnapshot()
        })
        it('actions', () => {
            expect(parse(`
            controller myController
                state someState
                    on event
                        a -= 1
                        dda:abcvb /= 4
                        foo:bar *= 2
            `)).toMatchSnapshot()
        })
        it('on when', () => {
            expect(parse(`
            controller myController
                state someState
                    on event
                        a -= 1
                    on event when condition
                        a += 1
                    on event when !bla
                        a += 1
            `)).toMatchSnapshot()
        })
        it('when without on', () => {
            expect(parse(`
            controller myController
                state someState
                    when condition
                        a -= 123
                    when func(something)
                        a += 1
                    on event when b |> max(a)
                        a = b
            `)).toMatchSnapshot()
        })
        it('goto', () => {
            expect(parse(`
            controller myController
                state someState
                    goto somewhere
                    when a <= 1
                        x:a = 0
                    goto otherState when something
                        a -= 123
                    goto otherState when a == 1
                        a -= 123
            `)).toMatchSnapshot()
        })
    })
    // when someCondition goto module.someState
    // when someCondition goto someOtherEvent2
    //     a = b
    // on event when condition goto state
    //     a *= sin(3)


})