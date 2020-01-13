import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { Slot } from '../StoreDefinition'
import { Bundle, TransformData, Formula } from '../types'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'

export default function resolveOutputs(b: Bundle, im: TransformData): Bundle {
    const names = Object.entries(im.outputs).map(([name], i) => name)
    const buffers = Object.entries(im.outputs).map(([, buffer], i) => buffer) as Formula
    im.roots.outbox = F.filter(buffers, F.value())
    im.buses = names.map((name, i) => ({[name as string]: i})).reduce(assign, {})
    im.roots = assign({}, im.outputs, mapValues(im.roots))
    return b
}
