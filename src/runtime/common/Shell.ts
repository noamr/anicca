import { Store } from './RuntimeTypes'
import { StoreSpec } from '../../builder/types'

interface ShellParams {
    store: Store
    outgoingPorts: MessagePort[]
    incomingPorts: MessagePort[]
}

export default function createShell({store, outgoingPorts, incomingPorts}: ShellParams) {
    let running = false
    const run = async () => {
        if (running)
            return

        running = true
        do {
            store.commit()
            const outbox = await store.dequeue()
            outbox.forEach(([target, payload]) => {
                outgoingPorts[target].postMessage({payload}, [payload])
            })
        } while (!(await store.awaitIdle()))
        running = false
    }

    incomingPorts.forEach((port, i) => {
        port.addEventListener('message', ({data}) => {
            const {payload, headers} = data
            for (const header of headers)
                store.enqueue(header, payload)
            run()
        })
        port.start()
    })

    run()
}
