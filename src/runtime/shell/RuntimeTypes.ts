export type Enqueue = (port: number, buffer: ArrayBuffer) => Promise<void> | void

export type StartStore = (outgoing: Enqueue) => Enqueue
export type StoreMessageData = {buffer: ArrayBuffer}
