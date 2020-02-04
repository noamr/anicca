import { Enqueue } from './RuntimeTypes'
import { BindTargetType } from '../../builder/types'
import { forEach } from 'lodash'

interface RouteParams {
    routes: {[prefix: string]: number}
    header: number
    port: MessagePort
}

function encode_RouteChange(route: number, url: string): ArrayBuffer {
    const payload = new TextEncoder().encode(url)
    const dv = new DataView(new ArrayBuffer(payload.byteLength + 8))
    dv.setUint32(0, route)
    dv.setUint32(4, payload.length)
    new Uint8Array(dv.buffer).set(payload, 8)
    return dv.buffer
}

function decode_RouteChange(buffer: ArrayBuffer): [number, string] {
    const dv = new DataView(buffer)
    return [dv.getUint32(0), new TextDecoder().decode(buffer.slice(4))]
}

export default function createRoutes({routes, port, header}: RouteParams) {
    function update() {
        Object.entries(routes).forEach(([prefix, routerIndex]) => {
            if (prefix.startsWith('#')) {
                const {hash} = location
                if (!hash.startsWith(prefix))
                    return

                const url = hash.substr(prefix.length)
                const payload = encode_RouteChange(routerIndex, url)
                port.postMessage({header, payload}, [payload])
            }
        })
    }

    window.addEventListener('hashchange', update)
    update()
}
