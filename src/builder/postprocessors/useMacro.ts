import YAML from 'yaml'
import { Formula, ReferenceFormula, FunctionFormula } from '../types'
import {F, S, R, fmap, removeUndefined} from './postProcessHelpers'
import * as _ from 'lodash'
import { parseFormula } from '../parser/index';

interface RawMacro {
    inputs: string[]
    output: string
    formulas: {[name: string]: string}
}
export default function useMacro(macroYaml: string, externalFormulas: {[key: string]: Formula}): Formula {
    const raw = YAML.parse(macroYaml) as RawMacro
    const internalFormulas = _.mapValues(raw.formulas, parseFormula)
    const resolvedFormulas = {...externalFormulas}
    const resolveFormula = (f: Formula): Formula => {
        const {$ref} = f as ReferenceFormula
        if ($ref)
            return resolvedFormulas[$ref] || (
                internalFormulas[$ref] ?
                (resolvedFormulas[$ref] = resolveFormula(internalFormulas[$ref])): (() => {
                    throw new Error(`Unknown formula: ${$ref}`)
                })())

        const {args} = f as FunctionFormula
        if (args && args.length)
            return {...f, args: args.map((a, i) => a ? resolveFormula(a) : (() => {
                throw new Error(`Null arg. Formula: ${JSON.stringify(f)}, arg: ${i}`)
            })())} as FunctionFormula
        return f        
    }

    return resolveFormula({$ref: raw.output} as ReferenceFormula)
}