import { Store, StartMessage } from './RuntimeTypes'
import { StoreSpec, ViewConfig } from '../../builder/types'
import initViews from './views'

interface MainConfig {
    views: ViewConfig
    rootElements: {[name: string]: HTMLElement}
    channels: {[name: string]: number}
    storeWorkerPath: string
    viewSpecPath: string
}

export default async function main({rootElements, views, storeWorkerPath, channels}: MainConfig) {
    // port1: ui
    // port2: store

    const worker = new Worker(storeWorkerPath)
    const messageChannels = Object.entries(channels).reduce((a, [name, index]) => {
            a[index] = new MessageChannel()
            return a
        }, [] as MessageChannel[])

    
    const viewPort = messageChannels[channels['@view_channel']]
    const storePorts = messageChannels.map(({port2}) => port2)
    initViews({config: views, rootElements, port: viewPort.port1})
    worker.postMessage({type: 'start', payload: {ports: storePorts}}, storePorts)
    return worker
}