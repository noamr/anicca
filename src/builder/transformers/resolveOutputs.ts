import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import { Bundle, TransformData } from '../types'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'

export default function resolveOutputs(b: Bundle, im: TransformData): Bundle {
    const outputs = Object.entries(im.outputs).map(([name, buffer], i) => [name, F.pair(i, buffer)])
    im.roots.outbox = F.filter(outputs.map(([, buffer]) => buffer), F.not(F.isNil(F.tail(F.value()))))
    im.outputNames = outputs.map(([name], i) => ({[name as string]: i})).reduce(assign, {})
    im.roots = assign({}, im.outputs, mapValues(im.roots))
    return b
}
