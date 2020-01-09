import {parse} from '../../index'
import { ControllerStatement, ReferenceFormula } from '../../types'
import {F} from '../helpers'
import useMacro from '../useMacro'

describe('macros', () => {
    it('basic', () => {
        expect(useMacro(`
        inputs:
            - a
            - b
        output:
            result

        formulas:
            consty: 5.5
            internal: |
                pow(external, consty)
            result: |
                internal * a + b
        `, {
            a: {$primitive: 123},
            b: {$ref: 'bla'},
            external: F.ceil(3),
        })).toMatchSnapshot()
    })
})
