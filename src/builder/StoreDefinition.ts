import { Primitive } from './types'


type WithDebugInfoIndex = {debugInfoIndex?: DebugInfoIndex}
type Index = number
type OpIndex = Index
type TypeIndex = Index
type ArgsIndex = Index
export type TableIndex = Index
type DebugInfoIndex = Index
export type SlotIndex = Index
type FileIndex = Index
type TypeListIndex = Index
type CompoundType =  {keyType: TypeIndex, valueTypes: TypeListIndex} & WithDebugInfoIndex
export type Arg = {value: SlotIndex} & WithDebugInfoIndex
export type Slot = {$value: number|string, op: OpIndex, args: ArgsIndex} & WithDebugInfoIndex
type DebugLocation = {file: FileIndex, col: number, line: number}

/*
    typeIndex:  
    [native/compound]
    [nullable/not-nullable]
    index
*/

export type StoreDefinition = {
    nativeOps: string[]
    nativeTypes: string[]
    primitives: Primitive[]
    args: Arg[]
    argLists: Arg[][]
    slots: Slot[]
    tableTypes: TypeIndex[]
    typeLists: TypeIndex[][]
    compoundTypes: CompoundType[] 

    debugInfo?: {
        files: string[]
        locations: DebugLocation[]
    }

    locations: {
        nextWakeupTime: SlotIndex
        staging: SlotIndex
        outbox: SlotIndex
        inbox: TableIndex            
    }
}
