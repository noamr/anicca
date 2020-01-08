import { Formula, NativeType } from '../../builder/types'
export type Enqueue = (port: number, buffer: ArrayBuffer) => Promise<void> | void

export type StartStore = (outgoing: Enqueue) => Enqueue
export type StoreMessageData = {buffer: ArrayBuffer}

        
export interface Store {
    enqueue: (header: number, payload: ArrayBuffer|null) => Promise<void>
    dequeue: () => Promise<Array<[number, ArrayBuffer]>>
    awaitIdle: () => Promise<boolean>
    commit: () => Promise<void>
}

