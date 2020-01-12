import createShell from '../common/Shell'
import { StoreSpec } from '../../builder/types'
import createStoreInterpreter from './StoreInterpreter'

export interface StartMessage {
    spec: StoreSpec
    outgoingPorts: {[name: string]: MessagePort}
    incomingPorts: MessagePort[]
}

onmessage = ev => {
    const p = ev.data as StartMessage
    const store = createStoreInterpreter(p.spec)
    const outgoingPorts = Object.entries(p.spec.outputNames)
        .reduce((a, [name, index]) => {a[index] = p.outgoingPorts[name]; return a}, [] as MessagePort[])
    
    createShell({...p, store, outgoingPorts})
}
