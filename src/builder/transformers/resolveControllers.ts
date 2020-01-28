import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { AssignmentDirective, AssignTransitionAction, Bundle, ControllerStatement, DispatchAction, FlatStatechart,
         Formula, FunctionFormula, Juncture, LetStatement, ReferenceFormula, SlotStatement, State, Statement,
         StepResults, toFormula, TransformData, TransitionAction, tuple, Transition, TypedFormula, TypedRef } from '../types'
import { flattenState } from './flattenStatechart'
import {F, P, R, removeUndefined, S, withInfo} from './helpers'
import useMacro from './useMacro'
import resolveTimers from './resolveTimers'

interface Context {
    tables: {[name: string]: number}
}

const INIT_PHASE = 0
const AUTO_PHASE = 1
const INTERNAL_PHASE = 2
const EXTERNAL_PHASE = 3
const IDLE_PHASE = 4

type EventType = [number, ArrayBuffer]
type ChangeRequest = [number, string]

const INBOX_TABLE = '@inbox'
const MODI_TABLE = '@modi'
const PHASE_TABLE = '@phases'
const TIMER_TABLE = '@timers'

const modi = {$ref: MODI_TABLE, $T: new Map<number, number>()}
const phases = {$ref: PHASE_TABLE, $T: new Map<number, number>()}
const inbox = {$ref: INBOX_TABLE, $T: new Map<number, EventType>()}
const timers = {$ref: TIMER_TABLE, $T: new Map<number, number>()}

export default function resolveControllers(bundle: Bundle, im: TransformData): Bundle {
    im = im || {}
    const bundleWithControllerTables = [
        ...bundle,
        S.Table(INBOX_TABLE, {valueType: {tuple: ['u32', 'ByteArray']}}),
        S.Table(MODI_TABLE, {valueType: 'u32'}),
        S.Table(PHASE_TABLE, {valueType: 'u32'}),
        S.Table(TIMER_TABLE, {valueType: 'u64'}),
    ]

    const nextWakeupTime = F.flatReduce(timers, F.pair(F.max(F.aggregate(), F.value()), true), 0)
    const flatControllers = mapValues(
        map(filter(bundleWithControllerTables, ({type}) => type === 'Controller'),
            (v: Statement, i) => ({[v.name || '']: [i, (v as ControllerStatement).rootState] as [number, State]}))
            .reduce(assign),
        (([i, s]: [number, State]) => [i, flattenState(resolveTimers(s) as State)] as [number, FlatStatechart]))

    const TARGET_BITS = Math.ceil(Math.log2(
        Math.max(...Object.values(flatControllers).map(f => f[1].events.length))) + 1)
    const MODUS_BITS =  Math.ceil(Math.log2(
        Math.max(...Object.values(flatControllers).map(f => f[1].junctures.size))) + 1)
    const INTERNAL_BITS = Math.ceil(Math.log2(Object.keys(flatControllers).length + 1) + TARGET_BITS)

    const getTargetFromEventHeader = F.shr(F.bwand(F.first(F.value<EventType>()), (1 << INTERNAL_BITS) - 1), TARGET_BITS)
    const getInternalFromEventHeader = F.shr(F.first(F.value<EventType>()), INTERNAL_BITS)

    im.getEventHeader = (event: string, target: string) => {
        const fc = flatControllers[target]
        if (!fc)
            throw new Error(`Unknown event target: ${target}`)
        const eventIndex = fc[1].events.indexOf(event)
        if (eventIndex < 0)
            throw new Error(`Unknown event: ${target}.${event}`)
        return (fc[0] << TARGET_BITS) | eventIndex
    }

    const tables = map(filter(bundleWithControllerTables, ({type}) => type === 'Table'), (v: Statement, i) =>
        ({[v.name || '']: i})).reduce(assign, {})
    im.tables = tables

    const byController = Object.entries(flatControllers).map(([name, [index, rootState]], i, controllers) =>
        convertControllerToFormulas([name, rootState], index, bundle, im))

    const stagingByController = F.object(
        ...Object.entries(mapValues(byController, 'assignments')).map(([k, v]) => F.pair(+k, v)))
    const payloadByController = F.object(
        ...Object.entries(mapValues(byController, 'payload')).map(([k, v]) => F.pair(+k, v)))
    const activeControllers = F.object(...Object.entries(
        mapValues(byController, (v, k) => F.neq(F.get(phases, +k), IDLE_PHASE))).map(([k, v]) => F.pair(+k, v)))

    const controllersWithMessages = F.map(inbox, [F.pair(getTargetFromEventHeader, true)])
    const currentControllerIndex = F.cond(F.size(activeControllers),
        F.head(activeControllers),
        F.cond(F.size(controllersWithMessages), F.head(controllersWithMessages), -1))
    const idle = F.eq(currentControllerIndex, -1)
    const staging = F.cond(idle, [] as AssignmentDirective[], F.get(stagingByController, currentControllerIndex))
    const payload = F.get(payloadByController, currentControllerIndex)

    im.roots = assign({}, im.roots, {idle: {$ref: '@idle'}, staging: {$ref: '@staging'}, inbox: tables['@inbox']})

    return [
        ...bundleWithControllerTables.filter(({type}) => type !== 'Controller'),
        S.Slot('@idle', {formula: idle}),
        S.Slot('@payload', {formula: payload}),
        S.Slot('@staging', {formula: staging}),
        S.Slot('@wakeup', {formula: nextWakeupTime})
    ]

    function convertControllerToFormulas(
        current: [string, FlatStatechart],
        index: number,
        bundle: Bundle,
        {tables, getEventHeader}: TransformData):
            {assignments: toFormula<Map<number, AssignmentDirective>>
            payload: Formula
            } {
        const hashToIndex: {[hash: string]: number} = {}

        const [, fsc] = current

        forEach([...fsc.junctures], ([juncture], i) => { hashToIndex[juncture ? juncture.modus : ''] = i})

        const getEventIndex = (s: FlatStatechart, e: string|null) => {
            const index = e ? s.events.indexOf(e) + 1 : 0
            if (index < 0)
                throw new Error(`Event not found: ${e}`)
            return index
        }

        const parseTable = ({$ref}: ReferenceFormula): number => {
            if (Reflect.has(tables, $ref))
                return tables[$ref]

            throw new Error(`Can only assign to tables. ${$ref} is not a table`)
        }
        const parseAssignment = (target: Formula, source: Formula): AssignmentDirective => {
            const asRef = target as ReferenceFormula
            const asFunction = target as FunctionFormula
            if (asRef.$ref) {
                const byName = bundle.find(s => s.name === asRef.$ref)
                if (!byName)
                    throw new Error(`Undefined ref: ${asRef.$ref}`)
                if(byName.type === 'Slot')
                    return parseAssignment((byName as SlotStatement).formula, source)
                if(byName.type === 'Table')
                    return [parseTable(asRef), F.replace(), source]
                throw new Error(`Ref pointing to ${byName.type} is not assignable`)
            }

            if (asFunction.op !== 'get' || !asFunction.args || asFunction.args.length !== 2)
                throw new Error(`Invalid assignment target. op: ${asFunction.op}`)

            const ref = asFunction.args && asFunction.args[0] as ReferenceFormula | undefined
            if (!ref || !ref.$ref)
                throw new Error(`Invalid assignment target. op: ${asFunction.op}, args: ${JSON.stringify(asFunction.args)}, source: ${JSON.stringify(source)}`)

            if (typeof source === 'undefined')
                throw new Error(`Undefined assignment: ${ref}`)

            return [parseTable(ref), asFunction.args[1], source]
        }

        const resolveAssignment = (a: TransitionAction): AssignmentDirective => {
            switch (a.type) {
                case 'Assign':
                    const {source, target} = a as AssignTransitionAction
                    return parseAssignment(target, source)
                case 'Dispatch': {
                    const {event, payload, target} = a as DispatchAction
                    const h = getEventHeader(event, target || current[0])
                    const header = h | ((target ? 0 : 1) << INTERNAL_BITS)
                    return resolveAssignment({type: 'Assign',
                        source: F.array(P(header), payload), target: F.get(inbox, F.uid())} as AssignTransitionAction)
                }
                default:
                    throw new Error(`${JSON.stringify(a)} statements should already be resolved`)
            }
        }

        const toModusAssignment = (modus: number): AssignTransitionAction => ({
            type: 'Assign',
            target: F.get(modi, index),
            source: P(modus),
        })

        const resolveConditionalAssignment = <T>(a: AssignmentDirective, cond: T) => {
            return [a[0], F.cond(cond, a[1], F.noop()), a[2]] as AssignmentDirective
        }

        const flattenResult = (result: StepResults<number>): Array<AssignmentDirective | null> =>
            [...result.execution, toModusAssignment(result.modus)].map(a => resolveConditionalAssignment(
                    resolveAssignment(a), result.condition))

        type AssignmentDirective = [number, any, any]
        interface JValue {condition: TypedFormula<boolean>, assignments: AssignmentDirective[], info: string}

        const junctures = new Map([...fsc.junctures].map(
            ([juncture, results]) => tuple(juncture ? {
                event: juncture.event,
                info: juncture.modus,
                modus: hashToIndex[juncture.modus],
            } : null,
                {
                    condition: F.not(F.not(F.or(...results.map(({condition}) => condition)))),
                    assignments: flatten(results.map(r => flattenResult((
                        {condition: r.condition, execution: r.execution, modus: hashToIndex[r.modus]}) as
                            StepResults<number>))),
                } as JValue)))

        const modusMap = F.object(...[...junctures.keys()]
            .map(j => {
                const info = j ? j.info : null
                const header = j ? (j.modus << MODUS_BITS | getEventIndex(fsc, j.event)) : 0
                const {condition, assignments} = junctures.get(j) as JValue
                return withInfo(
                    F.pair(header, F.pair(condition, F.array(...assignments.map(a => F.array(...a))))), info)
            }))

        const modus = F.cond(F.size(modi), F.get(modi, index), 0)
        const currentPhase = F.cond(F.size(phases), F.get(phases, index), INIT_PHASE)

        const currentEventKey = F.cond(F.or(F.eq(currentPhase, INTERNAL_PHASE),
                                            F.eq(currentPhase, EXTERNAL_PHASE)),
                                F.findFirst(inbox, F.and(
                                    F.eq(getTargetFromEventHeader, index),
                                    F.eq(getInternalFromEventHeader, F.cond(F.eq(currentPhase, INTERNAL_PHASE), 1, 0)),
                                )), null)

        const currentEvent = F.cond(F.eq(currentPhase, AUTO_PHASE), null, F.get(inbox, currentEventKey))
        const currentEventType = F.cond(F.isNil(currentEvent), 0,
            F.bwand(F.plus(F.first(currentEvent), 1), (1 << TARGET_BITS) - 1))
        const payload = F.cond(F.isNil(currentEvent), null, F.second(currentEvent))

        const juncture = F.cond(F.eq(currentPhase, INIT_PHASE), 0, F.bwor(F.shl(modus, MODUS_BITS), currentEventType))
        const currentJuncture = withInfo(F.get(modusMap, juncture), 'current juncture')
        const effective = F.first(currentJuncture)
        const nextPhase = withInfo(
            F.cond(F.or(effective, F.eq(currentPhase, IDLE_PHASE)), AUTO_PHASE, F.plus(currentPhase, 1)), 'next phase')
        const advance = withInfo(F.put(parseTable(phases), index, nextPhase), 'advance phase')
        const deleteCurrentEvent = F.put(parseTable(inbox), currentEventKey,
            F.delete()) as TypedFormula<AssignmentDirective>
        const assignments = withInfo(F.flatMap([0, 1],
            F.cond(F.key(), F.second(currentJuncture), F.cond(currentEventKey,
                withInfo(F.object(F.pair(10000, advance), F.pair(10001, deleteCurrentEvent)), 'delete current event'),
                withInfo(F.object(F.pair(10000, advance)), 'advance without event')))), 'assignments')

        return {assignments, payload}
    }
}