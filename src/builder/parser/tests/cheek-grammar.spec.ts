/// </ reference "jest" />
import nearley from 'nearley'
const grammar = require('../cheek.ne')

const parse = (str: string) => new nearley.Parser(grammar).feed(str).finish()[0]

describe('Root', () => {
    it('cheeky', () => {
        expect(parse('nothing')).toMatchSnapshot()
        expect(parse('nothing { hello }')).toMatchSnapshot()
        expect(parse(`
# comment
view { 
    #hello {123}
}
        `)).toMatchSnapshot()
        expect(parse('enum {hello;goodbye;c4}')).toMatchSnapshot()
        expect(parse('a { b { C } }')).toMatchSnapshot()
    })
})
