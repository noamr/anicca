import { Store } from './RuntimeTypes'
import { StoreSpec } from '../../builder/types'

interface ShellParams {
    spec: {
        outputNames: {[name: string]: number}
    }
    store: Store
    outgoingPorts: {[key: string]: MessagePort}
    incomingPorts: MessagePort[]
}

export default function createShell({spec, store, outgoingPorts, incomingPorts}: ShellParams) {
    let running = false
    const outPorts = Object.keys(spec.outputNames).map(name => ({[spec.outputNames[name]]: outgoingPorts[name]}))
    const run = async () => {
        if (running)
            return
        running = true
        while (!(await store.awaitIdle())) {
            store.commit()
            const outbox = await store.dequeue()
            outbox.forEach(([target, payload]) => {
                outgoingPorts[target].postMessage({payload}, [payload])
            })
        }

        running = false
    }
    incomingPorts.forEach((port, i) => {
        port.addEventListener('message', ({data}) => {
            store.enqueue(data.type | (i << 16), data.payload)
            run()
        })
        port.start()
    })

    run()
}
