import { Store, StartMessage } from './RuntimeTypes'
import { StoreSpec, ViewConfig } from '../../builder/types'
import initViews from './views'
import initRoutes from './routes'

interface MainConfig {
    views: ViewConfig
    routeConfig: {[name: string]: number}
    headers: {[name: string]: number}
    rootElements: {[name: string]: HTMLElement}
    routes: {[name: string]: string}
    channels: {[name: string]: number}
    storeWorkerPath: string
    viewSpecPath: string
}

export default async function main(cfg: MainConfig) {
    const {rootElements, routes, views, storeWorkerPath, channels, headers, routeConfig} = cfg

    const worker = new Worker(storeWorkerPath)
    const messageChannels = Object.entries(channels).reduce((a, [name, index]) => {
            a[index] = new MessageChannel()
            return a
        }, [] as MessageChannel[])

    const viewPort = messageChannels[channels['@view_channel']]
    const storePorts = messageChannels.map(({port2}) => port2)
    initViews({config: views, rootElements, port: viewPort.port1})
    initRoutes({port: viewPort.port1, header: headers.route,
        routes: Object.entries(routes).map(([key, name]) =>
            ({[key]: routeConfig[name]})).reduce((a, o) => Object.assign(a, o), {})})
    worker.postMessage({type: 'start', payload: {ports: storePorts}}, storePorts)

    viewPort.port1.start()
    return worker
}