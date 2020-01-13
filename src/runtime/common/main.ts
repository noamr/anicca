import { Store, StartMessage } from './RuntimeTypes'
import { StoreSpec, ViewConfig } from '../../builder/types'
import initViews from './views'

interface MainConfig {
    views: ViewConfig
    rootElements: {[name: string]: HTMLElement}
    buses: {[name: string]: number}
    incomingPorts: MessagePort[]
    outgoingPorts: MessagePort[]
    storeWorkerPath: string
    viewSpecPath: string
}

export default async function main({rootElements, views, storeWorkerPath, buses}: MainConfig) {
    // port1: ui -> store
    // port2: store -> ui
    const channelsByName: {[name: string]: MessageChannel} = {}
    const channels = Object.entries(buses).reduce((a, [name, index]) => {
        const channel = new MessageChannel()
        a[index] = channel
        channelsByName[name] = channel
        return a
    }, [] as MessageChannel[])

    const {port1, port2} = channelsByName['@view_bus']
    initViews({config: views, rootElements, ports: {in: port2, out: port1}})
    const worker = new Worker(storeWorkerPath)
    const outgoingPorts = channels.map(({port2}) => port2)
    const incomingPorts = channels.map(({port1}) => port1)
    worker.postMessage({type: 'start', payload: {incomingPorts, outgoingPorts}}, [...incomingPorts, ...outgoingPorts])
    return worker
}