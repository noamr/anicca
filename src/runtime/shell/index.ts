

interface PublicSpec {
    staging: number
    idle: number
}

interface PrivateSpec {
    slots: Formula[]

}

interface ShellParams {
    spec: PublicSpec
    factory: StoreFactory
    outgoingPorts: MessagePort[]
    incomingPorts: MessagePort[]
}

export default function createShell(params: ShellParams) {
    const store = params.factory.initStore(([bus, payload]: [number, ArrayBuffer]) =>
                        params.outgoingPorts[bus].postMessage({payload}, [payload]))

    let running = false
    const run = async() => {
        running = true
        while (!(await store.readFlag(params.spec.idle)))
            store.commit(params.spec.staging)
        running = false
    }

    params.incomingPorts.forEach((port, i) => {
        port.addEventListener('message', ({data}) => {
            store.enqueue(data.type | (i << 16), data.payload)
            if (!running)
                run()
        })
        port.start()
    })

    run()
}