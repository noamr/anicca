import { Enqueue } from './RuntimeTypes'
import { ViewConfig, BindTargetType } from '../../builder/types'
import { forEach } from 'lodash'

interface ViewParams {
    config: ViewConfig
    rootElements: {[name: string]: HTMLElement}
    ports: {
        in: MessagePort
        out: MessagePort
    }
}

interface EventHandler {
    selector: string
    headers: number[]
    preventDefault: boolean
    stopPropagation: boolean
}

interface Binding {
    selector: string
    target?: string
    type: BindTargetType
}

function ancestors(e: HTMLElement, a: HTMLElement|null): HTMLElement[] {
    return (e === a) || !e || !e.parentElement || e === e.ownerDocument.documentElement ? [] :
        [e, ...ancestors(e.parentElement, a)]
}

function createView(root: HTMLElement, eventHandlers: {string: EventHandler[]}, bindings: Binding[],
                    ports: {in: MessagePort, out: MessagePort}) {
    const matches = (e: HTMLElement, {selector}: {selector: string}): boolean => 
        Array.from(root.querySelectorAll(selector)).includes(e)
    const $ = ({selector}: {selector: string}) => Array.from(root.querySelectorAll(selector))
    Object.keys(eventHandlers).forEach(e => {
        root.addEventListener(e, event => {
            const handlers = eventHandlers[e as keyof typeof eventHandlers]
            let preventDefault = false
            let stopPropagation = false
            const ancs = ancestors(event.target as HTMLElement, root)
            const headers = new Set<number>()
            for (const target of ancs) {
                const handler = handlers.find(h => matches(target, h))
                if (!handler)
                    continue

                if (handler) {
                    stopPropagation = stopPropagation || handler.stopPropagation
                    preventDefault = preventDefault || handler.preventDefault
                }

                handler.headers.forEach(h => headers.add(h))
                if (stopPropagation) {
                    event.stopPropagation()
                    break
                }
            }

            if (preventDefault)
                event.preventDefault()

            if (headers.size) {
                const payload = encodeMessage(event)
                ports.out.postMessage({payload, headers}, [payload])
            }

        }, {capture: true})
    })
}

const TARGET_BITS = 16
const TARGET_MASK = (1 << TARGET_BITS) - 1

function select(e: HTMLElement|null|undefined, selector: string, key: number|null): HTMLElement[] {
    if (!e)
        return []

    selector = (key === null) ? selector : selector.replace('@key@', '' + key)
    return Array.from(e.querySelectorAll(selector))
}

const appliers: {[key in BindTargetType]: (e: HTMLElement, target: string, value: string|null) => void} = {
    content: (e, target, value) => e.innerHTML = value || '',
    style: (e, target, value) => {
        if (value === null)
            e.style.removeProperty(target)
        else
            e.style.setProperty(target, value)
    },
    data: (e, target, value) => {
        if (value === null)
            delete e.dataset[target]
        else
            e.dataset[target] = value
    },
    attribute: (e, target, value) => {
        if (value === null)
            e.removeAttribute(target)
        else
            e.setAttribute(target, value)
    }
}

type Setter = {
    binding: number
    key: number|null
    value: any
}

const decoder = new TextDecoder()
function decodeMessage(buffer: ArrayBuffer): Setter[] {
    const view = new DataView(buffer, 0)
    const location = 0
    const setters = [] as Setter[]
    for (let offset = 0; offset < buffer.byteLength;) {
        const header = view.getUint32(offset)
        offset += 4
        const binding = header & 0xFFFF
        const key = header >> 16
        const length = view.getUint32(offset)
        offset += 4
        const value = decoder.decode(new DataView(buffer, offset, length))
        setters.push({key: key === 0xFFFF ? null : key, binding, value})
        offset += length
    }

    return setters
}

export default function createViews({config, rootElements, ports}: ViewParams): Enqueue {
    Object.entries(rootElements).forEach(([viewName, rootElement]) => {
        const events = config.events.map((event, index) =>
            [index, event] as [number, typeof event]).filter(([, {view}]) => view === viewName)

        const bindings = new Map(config.bindings.map((binding, index) =>
            [index, binding] as [number, typeof binding]).filter(([, {view}]) => view === viewName))

    })


    ports.in.addEventListener('message', (({data}) => {
        const {payload}: {payload: ArrayBuffer} = data
        const setters = decodeMessage(payload)
        setters.forEach(({binding, key, value}) => {
            const {view, selector, target, type} = config.bindings[binding]
            const elements = select(rootElements[view], selector, key)
            elements.forEach(e =>appliers[type](e, target || '', value))
        })
    }))
}
