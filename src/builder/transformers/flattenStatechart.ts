import * as _ from 'lodash-es'
import { Bundle, Configuration, ControllerStatement, DispatchAction, FlatStatechart, Formula,
    GotoAction, HistoryConfiguration, Juncture, Modus, State, Statechart, StepResults, Transition, TransitionAction,
 } from '../types'
import {F, R, removeUndefined, S} from './helpers'

const head = <T>(a: T[]) => a.length ? a[0] : null
const flatten = <T>(a: Iterable<Iterable<T>>): Iterable<T> => Array.from(a).reduce((a, b) => [...a, ...b], [])
type Predicate<Ret, Arg> = (a: Arg) => Ret
const some = <T>(a: Iterable<T>, p: Predicate<boolean, T>) => Array.from(a).some(p)
const intersectSets = <T>(a: Set<T>, b: Set<T>) => some(a, x => some(b, y => y === x))
const sort = <T>(a: Iterable<T>, p: (a: T, b: T) => number) => a ? Array.from(a).sort(p) : a

export function flattenState(rootState: State): FlatStatechart {
    const byName: {[name: string]: State} = {}
    const parentMap = new WeakMap<State, State|null>()
    const transitionSourceMap = new WeakMap<Transition, State>()
    const docIndex = new WeakMap<State, number>()
    const allEvents = new Set<string>()

    const getDefault = (state: State): State[] => (state.defaultTargets || []).map(id => byName[id])
    const isParallelState = (s: State) => s.type === 'Parallel'
    const documentIndex = (s: State): number => docIndex.get(s) || 0

    const entryOrder = (a: State, b: State) => documentIndex(a) - documentIndex(b)
    const exitOrder = (a: State, b: State) => documentIndex(b) - documentIndex(a)

    const isAtomicState = (s: State) => s.type === 'State' && !childStates(s).length
    const conditionFor = (t: Transition|null): Formula => (t && t.condition) || trueCondition
    const trueCondition = {$primitive: true} as Formula
    const falseCondition = {$primitive: true} as Formula

    const hashState = (s: State) => `${s.name || `#${documentIndex(s)}`}`
    const hashConfig = (c: Configuration) => sort(c, entryOrder).map(hashState).join(',')
    const hashHistory = (c: HistoryConfiguration) => [...c.keys()].sort(entryOrder).map((hs: State) => `${hashState(hs)}:${hashConfig(c.get(hs) || new Set<State>())}`).join('|')
    const hashModus = (m: Modus): string => `${hashConfig(m.configuration)};${hashHistory(m.history)}`
    const hashJuncture = (j: Juncture|null): string => j ? `${j.event || ''}:${hashModus(j.modus)}` : ''

    const junctures: {[hash: string]: {
        juncture: Juncture|null
        results: StepResults[],
    }} = {}

    const visitedModi = new Set<string>()
    const childStates = (s: State): State[] =>
        ((s.children || []).filter(({type}) => ['State', 'Parallel', 'Final'].includes(type)) as State[])

    const childTransitions = (s: State): Transition[] =>
        ((s.children || []).filter(({type}) => type === 'Transition') as Transition[])

    const getParent = (s: State) => parentMap.get(s) || rootState
    const getTransitionSource = (t: Transition) => transitionSourceMap.get(t) as State

    const nextDocIndex = (next => () => next++)(0)

    resolveState(rootState, null)

    function resolveJuncture(juncture: Juncture|null): void {
        const junctureHash = hashJuncture(juncture)
        if (junctures[junctureHash])
            return

        const results = step(juncture)
        junctures[junctureHash] = {juncture, results}
        for (const r of results) {
            const modusHash = hashModus(r.modus)
            if (visitedModi.has(modusHash))
                continue

            visitedModi.add(modusHash)
            resolveModus(r.modus)
        }
        return
    }

    const resolveModus = (modus: Modus) =>
        [null, ...allEvents].forEach(event => resolveJuncture({event, modus}))

    resolveJuncture(null)
    return {
        events: [...allEvents],
        junctures: new Map(Object.values(junctures).map(({juncture, results}) =>
        ([juncture ? {event: juncture.event, modus: hashModus(juncture.modus)} : null,
            results.map(({condition, execution, modus}) => ({
                condition, execution, modus: hashModus(modus),
            }))] as [Juncture<string>|null, Array<StepResults<string>>]))),
    }

    function resolveTransition(t: Transition, s: State) {
        transitionSourceMap.set(t, s)
        if (t.event)
            allEvents.add(t.event)
    }

    function resolveState(s: State, parent: State|null) {
        byName[s.name] = s
        parentMap.set(s, parent)
        docIndex.set(s, nextDocIndex())

        childStates(s).forEach(child => resolveState(child, s))
        childTransitions(s).forEach(child => resolveTransition(child, s))
    }

    function getAncestors(s1: State): State[] {
        if (!s1 || s1 === rootState)
            return []
        const parent = getParent(s1)
        return [parent, ...getAncestors(parent)].filter(a => a) as State[]
    }

    function getTransitionTargets(t: Transition): State[] {
        const e = (t.actions || []).filter((a: TransitionAction) => a.type === 'Goto')
        return e.map(g => byName[(g as GotoAction).target])
    }

    interface ConditionalTransitionSet {
        condition: Formula
        transitions: Transition[]
    }

    function step(juncture: Juncture|null): StepResults[] {
        if (!juncture) {
            const {modus, execution} = microstep(
                [{type: 'Transition', actions: [{type: 'Goto', target: rootState.name} as GotoAction]}],
                new Set<State>(), new Map())
            return [{
                modus,
                execution,
                condition: trueCondition,
            }]
        }

        const {event, modus: {configuration, history}} = juncture
        const transitionSets = selectTransitions()
        return transitionSets.map(
            t => ({condition: t.condition, ...microstep(t.transitions, configuration, history)}) as StepResults)

        function selectTransitions(): ConditionalTransitionSet[] {
            const atomicStates = [...configuration].filter(isAtomicState).sort(entryOrder)
            const atomicTransitionSets = atomicStates.map(state => {
                const transitions = new Set<Transition>()
                const states = [state, ...getProperAncestors(state, null)]
                for (const s of states)
                    for (const t of childTransitions(s).filter((t => event ? (event === t.event) : !t.event)))
                        transitions.add(t)
                const tlist = [...transitions]
                return tlist.map((t, i) => ({
                    ...t,
                    condition:
                        i === 0 ? conditionFor(t) :
                        i === 1 ? (F.and(F.not(conditionFor(tlist[0])), conditionFor(t))) :
                        F.and(F.not(conditionFor(tlist[0])), conditionFor(t)),
                }) as Transition)
            })

            const computePivot = (current?: Transition[], ...next: Transition[][]): Transition[][] => {
                if (!current)
                    return []
                if (!next.length)
                    return [current]

                return computePivot(...next).map(
                    (p: Transition[]) => [...flatten(current.map(t => ([t, ...p])))] as Transition[])
            }

            const pivot: Transition[][] = computePivot(...atomicTransitionSets)
            return pivot.map((transitions) => ({
                condition:
                    transitions.length === 1 ?
                    conditionFor(head(transitions)) :
                    F.and(...transitions.map(conditionFor)),
                transitions: filterConflicts(transitions),
            }))

            function filterConflicts(selected: Transition[]): Transition[] {
                const filteredTransitions = new Set<Transition>()
                selected.forEach((t1, i) => {
                    let t1Preempted = false
                    const transitionsToRemove = new Set<Transition>()
                    for (const t2 of selected.slice(i + 1)) {
                        if (intersectSets(computeExitSet([t1]), computeExitSet([t2]))) {
                            if (isDescendant(getTransitionSource(t1), getTransitionSource(t2)))
                                transitionsToRemove.add(t2)
                            else
                                t1Preempted = true
                        }
                    }
                    if (!t1Preempted) {
                        for (const t3 of transitionsToRemove)
                            filteredTransitions.delete(t3)
                        filteredTransitions.add(t1)
                    }
                })
                return [...filteredTransitions]
            }
        }

        function getEffectiveTargetStates(t: Transition): State[] {
            let targets: State[] = []
            for (const s of getTransitionTargets(t))
                if (s.type === 'History')
                    if (history.has(s))
                        targets = [...targets, ...(history.get(s) || [])]
                    else
                        targets = [...targets, ...getDefault(s)]
            return [...new Set(targets)]
        }

        function getTransitionDomain(t: Transition) {
            const targets = getEffectiveTargetStates(t)
            const source = getTransitionSource(t)
            if (!targets.length)
                return rootState
            if (isCompound(source) && targets.every(t => isDescendant(t, source)))
                return source
            return findLCCA([source, ...targets]) || rootState
        }

        function computeExitSet(transitions: Transition[]): Set<State> {
            if (!juncture)
                return new Set<State>()

            const statesToExit = new Set<State>()
            transitions
                .filter(t => getTransitionTargets(t).length)
                .forEach(t => {
                    const domain = getTransitionDomain(t)
                    for (const s of configuration)
                        if (!domain || isDescendant(s, domain))
                            statesToExit.add(s)
                })

            return statesToExit
        }

        function microstep( transitions: Transition[],
                            prevConfiguration: Configuration,
                            prevHistory: HistoryConfiguration): {
            modus: Modus,
            execution: TransitionAction[],
        } {
            const configuration = new Set([...prevConfiguration])
            const history = new Map([...prevHistory])
            const onExit = computeStateExit(transitions)
            const onEntry = computeStateEntry(transitions)
            const transitionExec = transitions.map(t => (t.actions || []).filter(a => a.type !== 'Goto'))
                .reduce((a, o) => a.concat(o), [])

            return {
                modus: {configuration, history},
                execution: [...onExit, ...transitionExec, ...onEntry],
            }

            function computeStateExit(transitions: Transition[]): TransitionAction[] {
                let execution: TransitionAction[] = []

                const statesToExit = [...computeExitSet(transitions)].sort(exitOrder)
                for (const s of statesToExit) {
                    for (const h of s.children.filter(c => c.type === 'History') as State[]) {
                        history.set(h, new Set([...configuration].filter(
                            s0 => h.deep
                                ? (isAtomicState(s0) && isDescendant(s0, s))
                                : getParent(s0) === s)))
                    }
                    execution = [...execution, ...(s.onExit || [])]
                    configuration.delete(s)
                }

                return execution
            }

            function computeStateEntry(transitions: Transition[]): TransitionAction[] {
                const statesToEnter = new Set<State>()
                const defaultHistoryContent = new Map<State, TransitionAction[]>()
                const statesForDefaultEntry = new Set<State>()
                let execution: TransitionAction[] = []

                for (const t of transitions) {
                    const targets = getTransitionTargets(t)
                    for (const s of targets)
                        addDescendantStatesToEnter(s)
                    const ancestor = getTransitionDomain(t)
                    for (const s of getEffectiveTargetStates(t))
                        addAncestorStatesToEnter(s, ancestor)
                }

                for (const state of [...statesToEnter].sort(entryOrder)) {
                    configuration.add(state)
                    const onEntry = (state.onEntry || []) as TransitionAction[]
                    const defaultActions = (state.defaultActions || []) as TransitionAction[]
                    execution = [...execution, ...onEntry, ...(statesForDefaultEntry.has(state) ? defaultActions : [])]
                }

                return execution

                function addDescendantStatesToEnter(state: State) {
                    if (state.type === 'History') {
                        const hs = history.get(state)
                        if (hs) {
                            for (const s of hs)
                                addDescendantStatesToEnter(s)
                            for (const s of hs)
                                addAncestorStatesToEnter(s, getParent(s))
                        } else {
                            defaultHistoryContent.set(getParent(state), state.defaultActions || [])
                            for (const s of getDefault(state)) {
                                addDescendantStatesToEnter(s)
                                addAncestorStatesToEnter(s, getParent(state))
                            }
                        }
                        return
                    }
                    statesToEnter.add(state)
                    if (isCompound(state)) {
                        statesForDefaultEntry.add(state)
                        for (const s of getDefault(state)) {
                            addDescendantStatesToEnter(s)
                            addAncestorStatesToEnter(s, state)
                        }
                    } else if (isParallelState(state)) {
                        for (const child of childStates(state))
                            if (!some(statesToEnter, s => isDescendant(s, child)))
                                addDescendantStatesToEnter(child)
                    }
                }

                function addAncestorStatesToEnter(state: State, ancestor: State) {
                    for (const anc of getProperAncestors(state, ancestor)) {
                        statesToEnter.add(anc)
                        if (isParallelState(anc))
                            for (const child of childStates(anc))
                                if (!some(statesToEnter, s => isDescendant(s, child)))
                                    addDescendantStatesToEnter(child)
                    }
                }
            }
        }

        function isCompound(state: State): boolean {
            return state.type === 'State' && !!childStates(state).length
        }

        function isCompoundOrRoot(state: State): boolean {
            return state === rootState || isCompound(state)
        }

        function findLCCA(states: State[]): State {
            if (!states.length)
                return rootState

            for (const anc of getProperAncestors(states[0], null).filter(isCompoundOrRoot)) {
                if (states.slice(1).every(s => isDescendant(s, anc)))
                    return anc
            }

            return rootState
        }

        function isDescendant(s1: State, s2: State) {
            return getAncestors(s1).includes(s2)
        }

        function getProperAncestors(s1: State, s2: State | null) {
            if (s1 === s2)
                return []
            const a = getAncestors(s1)
            if (!s2)
                return a

            const b = getAncestors(s2)
            if (b.indexOf(s1))
                return []

            const s2Index = a.indexOf(s2)
            if (s2Index < 0)
                return a

            return a.slice(0, s2Index)
        }
    }
}
