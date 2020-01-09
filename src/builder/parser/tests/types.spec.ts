/// </ reference "jest" />
import nearley from 'nearley'
const typeGrammar = require('../types.ne')

const parse = (str: string) => new nearley.Parser(typeGrammar).feed(str).finish()[0]

describe('type grammar', () => {
    it('singular', () => {
        expect(parse('u32')).toMatchSnapshot()
        expect(parse('f64')).toMatchSnapshot()
        expect(parse('string')).toMatchSnapshot()
    })

    it('multi', () => {
        expect(parse('[u32, string]')).toMatchSnapshot()
        expect(parse('[string, bool]')).toMatchSnapshot()
        expect(parse('{string: u32}')).toMatchSnapshot()
    })

    it('compound', () => {
        expect(parse('[u32, [f32, [string, bool]]]')).toMatchSnapshot()
        expect(parse('[string, {bool: {string: [i8, bool]}}]')).toMatchSnapshot()

    })
})
