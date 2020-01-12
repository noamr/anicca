import { Store } from './RuntimeTypes'
import { StoreSpec, ViewConfig } from '../../builder/types'
import initViews from './views'
import ShellWorker from 'web-worker:../interpreter/ShellWorker';
import { StartMessage } from '../interpreter/ShellWorker'

interface MainConfig {
    views: ViewConfig
    rootElements: {[name: string]: HTMLElement}
    spec: StoreSpec
}

export default function main({views, rootElements, spec}: MainConfig) {
    // port1: ui -> store
    // port2: store -> ui
    const {port1, port2} = new MessageChannel()
    initViews({config: views, rootElements, ports: {in: port2, out: port1}})
    const worker = new ShellWorker() as Worker
    worker.postMessage(
        {incomingPorts: [port1], outgoingPorts: [port2], spec} as StartMessage, [port1, port2])
}