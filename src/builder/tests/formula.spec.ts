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
    describe('const', () => {
        it('float', () => {
            expect(parse('0.4425')).toMatchSnapshot()
        })
        it('string literal', () => {
            expect(parse('"abc"')).toMatchSnapshot()
        })
        it('string literal single quote', () => {
            expect(parse('\'abc\'')).toMatchSnapshot()
        })
    })
    describe('constant', () => {
        it('zero', () => {
            expect(parse('0')).toMatchSnapshot()
        })
    })
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

    describe('compare', () => {
        it('==', () => {
            expect(parseRaw('a == 0')).toEqual(parseRaw('eq(a, 0)'))
        })
        it('==', () => {
            expect(parseRaw('a != 0')).toEqual(parseRaw('neq(a, 0)'))
        })
        it('<=', () => {
            expect(parseRaw('a <= 0')).toEqual(parseRaw('lte(a, 0)'))
        })
        it('<', () => {
            expect(parseRaw('a < 0')).toEqual(parseRaw('lt(a, 0)'))
        })
        it('>', () => {
            expect(parseRaw('a > b')).toEqual(parseRaw('gt(a, b)'))
        })
        it('>=', () => {
            expect(parseRaw('a >= .3')).toEqual(parseRaw('gte(a, 0.3)'))
        })
        
    })

    describe('bitwise', () => {
        it('and', () => {
            expect(parseRaw('a & b')).toEqual(parseRaw('bwand(a, b)'))
        })
        it('or', () => {
            expect(parseRaw('a | b')).toEqual(parseRaw('bwor(a, b)'))
        })
        it('xor', () => {
            expect(parseRaw('a ^ b')).toEqual(parseRaw('bwxor(a, b)'))
        })
        it('shl', () => {
            expect(parseRaw('a << b')).toEqual(parseRaw('shl(a, b)'))
        })
        it('shr', () => {
            expect(parseRaw('a >> b')).toEqual(parseRaw('shr(a, b)'))
        })
        it('ushr', () => {
            expect(parseRaw('a >>> b')).toEqual(parseRaw('ushr(a, b)'))
        })

        it('precedence', () => {
            expect(parseRaw('a & b ^ c | d')).toEqual(parseRaw('bwor(bwxor(bwand(a, b), c), d)'))
            expect(parseRaw('a ^ b | c & 3')).toEqual(parseRaw('bwor(bwxor(a, b), bwand(c, 3))'))
        })

    })

    describe('logical', () => {
        it('cond', () => {
            expect(parseRaw('a ? b : c')).toEqual(parseRaw('cond(a, b, c)'))
        })
        
        it('nullish', () => {
            expect(parseRaw('a ?? 3')).toEqual(parseRaw('cond(isNil(a), a, 3)'))
        })
        it('and', () => {
            expect(parseRaw('a && b')).toEqual(parseRaw('and(a, b)'))
        })
        it('or', () => {
            expect(parseRaw('a || b')).toEqual(parseRaw('or(a, b)'))
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
        it('?.', () => {
            expect(parseRaw('a?.b')).toEqual(parseRaw('cond(isNil(a), a, a["b"])'))
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

    describe('indentation', () => {
        it('operands', () => {
            expect(parseRaw(`
                a
                    + 3
            `)).toEqual(parseRaw('a+3'))
        })
        it('functions', () => {
            expect(parseRaw(`
                a*
                sin(
                    4)
            `)).toEqual(parseRaw(' a * sin(4)'))
            expect(parseRaw(`
                8 **
                max(3, 4)
            `)).toEqual(parseRaw('pow(8, (3 |> max(?,  4)))'))
        })
    })

    describe('objects', () => {
        describe('array constructor', () => {
            it('empty', () => {
                expect(parseRaw('[]')).toEqual(parseRaw('array()'))
            })
            it('one arg', () => {
                expect(parseRaw('[3]')).toEqual(parseRaw('array(3)'))
            })
            it('multiple args', () => {
                expect(parseRaw("[.3, 'bla', done]")).toEqual(parseRaw('array(0.3, "bla", done)'))
            })
        })
        describe('object constructor', () => {
            it('empty', () => {
                expect(parseRaw('{}')).toEqual(parseRaw('object()'))
            })
            it('one arg', () => {
                expect(parseRaw('{a: 3}')).toEqual(parseRaw('object(entry("a", 3))'))
                expect(parseRaw('{2: 3}')).toEqual(parseRaw('object(entry(2, 3))'))
                expect(parseRaw('{["a"]: 3}')).toEqual(parseRaw('object(entry("a", 3))'))
                expect(parseRaw('{"a": 3}')).toEqual(parseRaw('object(entry("a", 3))'))
                expect(parseRaw('{[abc]: "def"}')).toEqual(parseRaw('object(entry(abc, "def"))'))
            })
            it('multiple args', () => {
                expect(parseRaw("[.3, 'bla', done]")).toEqual(parseRaw('array(0.3, "bla", done)'))
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
