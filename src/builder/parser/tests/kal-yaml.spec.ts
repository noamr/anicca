import {parse} from 'yaml'
const {parseKal} = require('../index')

const kalYaml = `
view myView:
    '#output':
        content: value
    '#increment':
        on click:
            dispatch increment to myController

controller myController:
    state root:
        entering:
            value = 0

        on increment:
            value += 1

let value: u32
`

describe('kal yaml parsing', () => {
    it('should be valid yaml', () => {
        expect(parse(kalYaml)).toMatchSnapshot()
    })
    it('should be parsed to json', () => {
        expect(parseKal(parse(kalYaml))).toMatchSnapshot()
    })
    it('should fail on internals', () => {
        expect(() => parseKal(parse(`
            let @internal: u32
        `))).toThrow()
})
    it('should fail on internal in states', () => {
        expect(() => parseKal(parse(`
        controller myController:
            state @root:
                entering:
                    value = 0
            `))).toThrow()
    })
    it('should allow internal in states in internal mode', () => {
        expect(() => parseKal(parse(`
        controller myController:
            state @root:
                entering:
                    value = 0
            `), {internal: true})).not.toThrow()
    })
    it('should accept internals in internal mode', () => {
        expect(() => parseKal(parse(`
            let @internal: u32
        `), {internal: true})).not.toThrow()
    })
})
