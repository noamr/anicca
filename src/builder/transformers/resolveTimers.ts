import {Transition, State, TypedFormula} from '../types'
import {F} from './helpers'

const nextIndex = (v => () => ++v)(0)
const timers = {$ref: '@timers', $T: new Map<number, number>()}

export default function resolveTimers(s: State): State {
    const resolvedChildren = (s.children || []).map(c => c.type === 'Transition' ? c : resolveTimers(c))
    const timeouts = s.children.filter(t => t.type === 'Transition' && t.timeout) as Transition[]
    if (!timeouts.length)
        return {...s, children: resolvedChildren}

    const timeoutIndices = new WeakMap<Transition, number>()
    timeouts.forEach(t => timeoutIndices.set(t, nextIndex()))
    const indexFor = (t: Transition) => timeoutIndices.get(t)

    const clearTimer = (t: Transition) => ({type: 'Assign', target: F.get(timers, indexFor(t)),
                                            source: F.delete()})

    const onEntry = [...(s.onEntry || []),
        ...timeouts.map(t => ({type: 'Assign', target: F.get(timers, indexFor(t)),
                               source: F.plus(F.now(), t.timeout as TypedFormula<number>)}))]

    const onExit = [...(s.onExit || []), ...timeouts.map(clearTimer)]

    const children = resolvedChildren.flatMap(st => {
        const t = st as Transition

        if (st.type === 'State' || !t.timeout)
            return [st]

        const {condition, actions, timeout} = t
        const expired = F.gte(F.now(), F.get(timers, indexFor(t)))
        return [{type: 'Transition', condition: condition ? F.and(condition, expired) : expired, actions},
                {type: 'Transition', condition: expired, actions: [clearTimer(t)]}] as Transition[]
    })

    return {...s, children}
}