import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'
import { NativeTypeFormula, ReferenceFormula } from '../types'
import { NativeType, TransformData, StoreSpec, RawFormula, Formula,
    FunctionFormula, RootType, Bundle, TableStatement, Token } from '../types'

import createFormulaContext from './packFormulas'

export default function link(bundle: Bundle, data: TransformData): StoreSpec {
    const {indexOfFormula, tokens, formulas, indexOfType, typeMap} = createFormulaContext()
    const roots = Object.entries(data.roots).map(([key, value]) =>
            ({[key]: indexOfFormula(value as Formula)})).reduce(assign) as {[key in RootType]: number}

    const tableTypes = mapValues(data.tableTypes, indexOfType)
    const onCommit = data.onCommit.map(indexOfFormula)
    data.types = [...typeMap.values()]
    console.log(data.tables)

    return {
        channels: data.channels,
        debugInfo: tokens,
        tableTypes,
        onCommit,
        types: data.types,
        roots,
        slots: formulas,
    }
}
