import {parse} from 'yaml'
const parseKal = require('../parser.ts')

const kalYaml = `
View myView:
    '#output':
        content: value
    '#increment':
        on click:
        - dispatch increment to myController
        - run script:
            e => e.preventDefault()
Controller myController:
    state root:
        entering:
            value = 0

        on increment:
            value += 1

Let value: u32
`

describe('kal yaml parsing', () => {
    it('should be valid yaml', () => {
        expect(parse(kalYaml)).toMatchSnapshot()
    })
    it('should be parsed to json', () => {
        expect(parseKal(parse(kalYaml))).toMatchSnapshot()
    })
})