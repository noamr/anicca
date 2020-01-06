import useMacro from '../useMacro'
import {parse} from '../../index'
import { ControllerStatement, ReferenceFormula, PrimitiveFormula, TypedFormula, TypedRef, TypedPrimitive } from '../../types'
import { FlatStatechart } from '../flattenStatechart'
import {P, R, F} from '../postProcessHelpers'
import fs from 'fs'
import path from 'path'

const macro = fs.readFileSync(path.resolve(__dirname, '../statechartToFormula.macro.yaml'), 'utf8')
describe('statechart macro', () => {
    it('throw when no input', () => {
        expect(() => 
            useMacro(macro, {})).toThrow()
    })
    it('basic', () => {
        expect(useMacro(macro, {
                inbox: {$ref: '@inbox'} as ReferenceFormula,
                phases: {$ref: '@phases'} as ReferenceFormula,
                modi: {$ref: '@modi'} as ReferenceFormula,
                id: P(3),
                idle: {$ref: '@idle_3'} as ReferenceFormula,
                initialAssignments: F.array(
                    F.array({$ref: 'someVar'} as TypedRef<number>, 
                        F.plus({$ref: 'someValue'} as TypedRef<number>, P(9) as TypedFormula<number>))
                ),
                effectiveMap: F.object(
                    F.entry(P(3) as TypedPrimitive<number>, F.object(
                        F.entry(null, F.array(F.cond({$ref: 'someCondition'} as TypedRef<boolean>, P(8) as TypedFormula<number>, {$ref: 'abcdef'} as TypedRef<number>)))
                    ))
                ),
                assignmentMap: F.object(
                    F.entry(P(3) as TypedPrimitive<number>, F.object(
                        F.entry(null, F.array(F.array({$ref: 'someVar'} as TypedRef<number>, P(8) as TypedFormula<number>)))
                    ))
                ),

            })).toMatchSnapshot()
    })
})