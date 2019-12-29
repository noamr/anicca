/// </ reference "jest" />
import nearley from 'nearley'
const formulaGrammar = require('../formula.ne')
import { Formula, FunctionFormula, PrimitiveFormula, ReferenceFormula } from '../types'

const parse = (str: string) : Formula => new nearley.Parser(formulaGrammar).feed(str).finish()[0]
const removeTokens = (a: any): Formula => 
    a && Object.assign({},
        a.args && {args: a.args.map(removeTokens)},
        a.op && {op: a.op},
        a.$primitive && {$primitive: a.$primitive},
        a.$ref && {$ref: a.$ref})
        
const parseRaw = (str: string) => removeTokens(parse(str))
describe('formulas', () => {
    describe('single', () => {
        it('plus', () => {
            expect(parse('a + 1')).toMatchSnapshot()
        })
        it('minus', () => {
            expect(parse('a - 1')).toMatchSnapshot()
        })
        it('mult', () => {
            expect(parse('a * 1')).toMatchSnapshot()
        })
    })

    describe('multi', () => {
        it('plus', () => {
            expect(parse('a + 1 + b')).toMatchSnapshot()
        })
    })

    describe('unary', () => {
        it('negate', () => {
            expect(parse('-a')).toMatchSnapshot()
        })

        it('not', () => {
            expect(parse('!abc')).toMatchSnapshot()
        })
        it('notnot', () => {
            expect(parse('!!abc')).toMatchSnapshot()
        })
    })

    describe('parantheses', () => {
        it('single', () => {
            expect(parseRaw('(a)')).toEqual(parseRaw('a'))
        })
        it('ope', () => {
            expect(parseRaw('(a + 1)')).toEqual(parseRaw('a + 1'))
        })
        it('mult', () => {
            expect(parseRaw('(a * 1)')).toEqual(parseRaw('a * 1'))
        })
    })

    describe('get', () => {
        it('.', () => {
            expect(parse('a.b')).toMatchSnapshot()
        })
        it('[nubmer]', () => {
            expect(parse('a[0]')).toMatchSnapshot()
        })
        it('[value]', () => {
            expect(parse('a[b]')).toMatchSnapshot()
        })
        it('[str]', () => {
            expect(parse('a["str"]')).toMatchSnapshot()
        })
        it('[singleQuote]', () => {
            expect(parse("a['str']")).toMatchSnapshot()
            expect(parse("a['str']")).toEqual(parse('a["str"]'))
        })
        it('[match]', () => {
            expect(parseRaw('a["b"]')).toEqual(parseRaw('a.b'))
            expect(parseRaw('a[b]')).not.toEqual(parseRaw('a.b'))
        })
    })

    describe('functions', () => {
        it('no args', () => {
            expect(parse('now()')).toMatchSnapshot()
        })
        it('single arg', () => {
            expect(parse('sin(123)')).toMatchSnapshot()
        })
        it('multiple args', () => {
            expect(parse('max(abc, 123)')).toMatchSnapshot()
        })
        describe('pipe', () => {
            it('no args', () => {
                expect(parseRaw('1 |> sin()')).toEqual(parseRaw('sin(1)'))
            })
            it('one arg', () => {
                expect(parseRaw('1 |> max(2)')).toEqual(parseRaw('max(1, 2)'))
            })    
            it('placeholder', () => {
                expect(parseRaw('1 |> max(2, ?)')).toEqual(parseRaw('max(2, 1)'))
            })    
            it('mid placeholder', () => {
                expect(parseRaw('abc |> func(2, ?, now())')).toEqual(parseRaw('func(2, abc, now())'))
            })    
        })
    })

    describe('order of operations', () => {
        it('plus mult', () => {
            expect(parseRaw('a + b * c')).toEqual(parseRaw('a+(b * c)'))
            expect(parseRaw('a * b + c')).toEqual(parseRaw('(a * b) + c'))
            expect(parseRaw('a * b + c')).not.toEqual(parseRaw('a *  (b+c)'))
            expect(parseRaw('a * 2 + b')).toEqual(parseRaw('(a * 2) + b'))
            expect(parseRaw('a[0].c * (2 + b)')).toEqual(parseRaw('((a[0])["c"]) * (2 + b)'))
            expect(parseRaw(`a * 2 + 
                b`)).toEqual(parseRaw('(a * 2) + (b)'))
            
        })
    })
})