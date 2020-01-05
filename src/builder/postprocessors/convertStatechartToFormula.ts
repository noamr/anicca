import {F, S, R, fmap, removeUndefined} from './postProcessHelpers'
import { FlatStatechart } from './flattenStatechart'
import { Statement, TableStatement } from '../types'


export default function convertToFormula(fsc: FlatStatechart, name: string): Statement[] {
    const makeName = (n: string) => `@${name}_$_${n}`
    const internalQueue = makeName('internalQueue')
    const externalQueue = makeName('externalQueue')
    const internalQueueStatement: TableStatement = {type: 'Table', name: internalQueue, valueType: 'any'}
    const externalQueueStatement: TableStatement = {type: 'Table', name: externalQueue, valueType: 'any'}
    const hashToIndex: {[hash: string]: number} = {}
    Array.from(fsc.keys()).forEach(j)


    return [
        internalQueueStatement,
        externalQueueStatement
    ]

}
