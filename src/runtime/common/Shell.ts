import { Store } from './RuntimeTypes'
import { StoreSpec } from '../../builder/types'

interface ShellParams {
    store: Store
    ports: MessagePort[]
}

export default function createShell({store, ports}: ShellParams) {
    let running = false
    const run = async () => {
        if (running)
            return

        running = true
        await store.commit((target, payload) => {
            ports[target].postMessage({payload}, [payload])
        })
        running = false
    }

    ports.forEach((port, i) => {
        port.addEventListener('message', ({data}) => {
            const {payload, header} = data
            debugger
            store.enqueue(header, payload)
            run()
        })
        port.start()
    })

    run()
}
