import { Formula, NativeType } from '../../builder/types'
export type Enqueue = (port: number, buffer: ArrayBuffer) => Promise<void> | void

export type StartStore = (outgoing: Enqueue) => Enqueue
export interface StoreMessageData {buffer: ArrayBuffer}

export interface Store {
    enqueue: (header: number, payload: ArrayBuffer|null) => void | Promise<void>
    commit: (emit: (header: number, payload: ArrayBuffer | null) => void | Promise<void>) => void | Promise<void>
}

export interface StartMessage {
    ports: MessagePort[]
}

export default {}