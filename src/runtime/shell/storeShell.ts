import { StartStore } from './RuntimeTypes'

export default function storeShell({start, inPorts, outPorts}: 
    {inPorts: MessagePort[], outPorts: MessagePort[], start: StartStore}) {
    const enqueue = start((port, buffer) => outPorts[port].postMessage({buffer}, [buffer]))
    inPorts.forEach((p, i) => {
        p.addEventListener('message', e => enqueue(i, e.data.buffer))
        p.start()
    })
}