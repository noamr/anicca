import { Enqueue } from './RuntimeTypes'
import { ViewSetup, BindTargetType, EventSetup } from '../../builder/types'
import { forEach } from 'lodash'
import { decodeBindings } from './encodeDecode'
import {assert} from '../../builder/transformers/helpers'
interface ViewParams {
    config: ViewSetup
    rootElements: {[name: string]: HTMLElement}
    port: MessagePort
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

interface View {
     select(rootSelector: string | null, selector: string, key: number|null): HTMLElement[]
     setIndex(e: HTMLElement, index: number): void
     commit(): void
}

interface CloneInfo {
    parent: HTMLElement
    template: HTMLElement
    next: Element | null
    mount: (element: HTMLElement, key: number) => void
    children: Map<number, HTMLElement>
}


function createView(root: HTMLElement, events: EventSetup[], bindings: Binding[],
                    port: MessagePort) {

    const matches = (e: HTMLElement, root: string, selector: string, key: number | null): boolean =>
        Array.from(select(root, selector, key)).includes(e)

    const emit = (header: number, payload: ArrayBuffer) =>
        port.postMessage({header, payload}, [payload])

    const cloneIds = new WeakMap<HTMLElement, number>()


    function doSelect(element: HTMLElement, selector: string): HTMLElement[] {
        if (selector === '&')
            return [element]
        return Array.from(element.querySelectorAll(selector))
    }

    function listen(rootElement: HTMLElement, {eventType, handler, selector}: EventSetup, key: number = 0) {
        doSelect(rootElement, selector).forEach(e => e.addEventListener(eventType, e => handler(e, key, emit)))
    }

    events.filter(s => !s.root).forEach(eventSetup => listen(root, eventSetup))

    const cloneRootMap = new Map<string, CloneInfo>()
    const cloneInfoMap = new WeakMap<HTMLElement, CloneInfo>()

    function createCloneInfo(selector: string): CloneInfo {
        const template = root.querySelector(selector) as HTMLElement
        assert(template)

        const parent = template.parentElement as HTMLElement

        const eventSetups = events.filter(s => s.root === selector)

        const mount = (element: HTMLElement, key: number) =>
            eventSetups.forEach(s => listen(element, s, key))

        const cloneInfo = {
            template,
            children: new Map<number, HTMLElement>(),
            next: template.nextElementSibling,
            mount,
            parent
        }

        parent.removeChild(template)
        cloneRootMap.set(selector, cloneInfo)
        return cloneInfo
    }

    function clone(cloneInfo: CloneInfo, key: number): HTMLElement {
        const {template, children, parent, next, mount} = cloneInfo
        const isDeepClone = true
        const child = template.cloneNode(isDeepClone) as HTMLElement
        cloneIds.set(child, key)
        children.set(key, child)
        parent.insertBefore(child, next)
        cloneInfoMap.set(child, cloneInfo)
        mount(child, key)
        return child
    }

    function select(rootSelector: string | null, selector: string, key: number|null): HTMLElement[] {
        if (!rootSelector)
            return doSelect(root, selector)

        const cloneInfo = cloneRootMap.get(rootSelector) || createCloneInfo(rootSelector)

        assert(key !== null)
        const {parent, template, children} = cloneInfo
        const child = children.get(key as number) || clone(cloneInfo, key as number)
        return doSelect(child, selector)
    }

    const clonesWithModifiedIndices = new Set<CloneInfo>()
    const indices = new Map<HTMLElement, number>()

    function setIndex(e: HTMLElement, index: number): void {
        clonesWithModifiedIndices.add(assert(cloneInfoMap.get(e)))
        indices.set(e, index)
    }

    function commit(): void {
        for (const cloneToSort of clonesWithModifiedIndices) {
            const reverseSortedChildren = [...indices.keys()].filter(k => k.parentElement === cloneToSort.parent)
            reverseSortedChildren.sort((a, b) => (indices.get(b) || 0) - (indices.get(a) || 0))
            let reference = cloneToSort.next
            for (const child of reverseSortedChildren)
                reference = cloneToSort.parent.insertBefore(child, reference)
        }
        clonesWithModifiedIndices.clear()
    }

    return {select, setIndex, commit}
}

const indices = new WeakMap<HTMLElement, number>()
const appliers: {[key in BindTargetType]: (e: HTMLElement, target: string, value: string|null, view?: View) => void} = {
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
    },
    index: (e, t, value, view) =>
        assert(view).setIndex(e, +(value || 0)),
    remove: (e, t, value) =>
        assert(e.parentElement).removeChild(e)

}

export default function createViews({config, rootElements, port}: ViewParams) {
    const views = {} as {[name: string]: View}
    Object.entries(rootElements).forEach(([viewName, rootElement]) => {
        views[viewName] = createView(rootElement, config.events, config.bindings, port)
    })

    port.addEventListener('message', (({data}) => {
        const {payload}: {payload: ArrayBuffer} = data
        const modifiedViews = new Set<View>()
        decodeBindings(payload, (binding, key, value) => {
            const {view, selector, target, type, root} = config.bindings[binding]
            const viewObject = views[view]
            modifiedViews.add(viewObject)
            const elements = views[view].select(root, selector, key)
            elements.forEach(e => {
                appliers[type](e, target || '', value, viewObject)
            })
        })

        for (const view of modifiedViews)
            view.commit()
    }))
}
