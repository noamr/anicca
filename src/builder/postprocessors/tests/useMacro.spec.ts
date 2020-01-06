import useMacro from '../useMacro'
import {parse} from '../../index'
import { ControllerStatement, ReferenceFormula } from '../../types'
import { FlatStatechart } from '../flattenStatechart'
import {P, R, F} from '../postProcessHelpers'

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
            a: P(123),
            b: {$ref: 'bla'} as ReferenceFormula,
            external: F.ceil(P(3))
        })).toMatchSnapshot()
    })
})