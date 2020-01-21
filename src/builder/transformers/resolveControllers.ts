import fs from 'fs'
import {assign, filter, flatten, forEach, keys, map, mapValues, pickBy, values} from 'lodash'
import path from 'path'
import { AssignmentDirective, AssignTransitionAction, Bundle, ControllerStatement, DispatchAction, FlatStatechart,
         Formula, FunctionFormula, Juncture, LetStatement, ReferenceFormula, SlotStatement, State, Statement,
         StepResults, toFormula, TransformData, TransitionAction, tuple, TypedFormula, TypedRef } from '../types'
import { flattenState } from './flattenStatechart'
import {F, P, R, removeUndefined, S} from './helpers'
import useMacro from './useMacro'

interface Context {
    tables: {[name: string]: number}
}

const INIT_PHASE = 0
const AUTO_PHASE = 1
const INTERNAL_PHASE = 2
const EXTERNAL_PHASE = 3
const IDLE_PHASE = 4

const TARGET_BITS = 15
const MODUS_BITS = 16
const INTERNAL_BITS = 30

type EventType = [number, ArrayBuffer]
type ChangeRequest = [number, string]

const getTargetFromEventHeader = F.shr(F.bwand(F.first(F.value<EventType>()), (1 << INTERNAL_BITS) - 1), TARGET_BITS)
const getInternalFromEventHeader = F.shr(F.first(F.value<EventType>()), INTERNAL_BITS)

const INBOX_TABLE = '@inbox'
const MODI_TABLE = '@modi'
const PHASE_TABLE = '@phases'

const modi = {$ref: MODI_TABLE, $T: new Map<number, number>()}
const phases = {$ref: PHASE_TABLE, $T: new Map<number, number>()}
const inbox = {$ref: INBOX_TABLE, $T: new Map<number, EventType>()}

export default function resolveControllers(bundle: Bundle, im: TransformData): Bundle {
    im = im || {}
    const bundleWithControllerTables = [
        ...bundle,
        S.Table(INBOX_TABLE, {valueType: {tuple: ['u32', 'ByteArray']}}),
        S.Table(MODI_TABLE, {valueType: 'u32'}),
        S.Table(PHASE_TABLE, {valueType: 'u32'}),
    ]
    const flatControllers = mapValues(
        map(filter(bundleWithControllerTables, ({type}) => type === 'Controller'),
            (v: Statement, i) => ({[v.name || '']: [i, (v as ControllerStatement).rootState] as [number, State]}))
            .reduce(assign),
        (([i, s]: [number, State]) => [i, flattenState(s)] as [number, FlatStatechart]))

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

    const stagingByController = Object.entries(flatControllers).map(([name, [index, rootState]], i, controllers) =>
        convertControllerToFormulas([name, rootState], index, bundle, im))

    const activeControllers = F.filter(stagingByController, F.neq(F.get(phases, F.key()), IDLE_PHASE))
    const controllersWithMessages = F.map(inbox, [F.pair(getTargetFromEventHeader, true)])
    const currentControllerIndex = F.cond(F.size(activeControllers),
        F.head(activeControllers),
        F.cond(F.size(controllersWithMessages), F.head(controllersWithMessages), -1))
    const idle = F.eq(currentControllerIndex, -1)
    const staging = F.cond(idle, [] as AssignmentDirective[], F.get(stagingByController, currentControllerIndex))

    console.log({tables})
    im.roots = assign({}, im.roots, {
        idle: {$ref: '@idle'}, staging: {$ref: '@staging'}, inbox: tables['@inbox']
    })

    return [
        ...bundleWithControllerTables.filter(({type}) => type !== 'Controller'),
        S.Slot('@idle', {formula: idle}),
        S.Slot('@staging', {formula: staging})
    ]
}

function convertControllerToFormulas(
    current: [string, FlatStatechart],
    index: number,
    bundle: Bundle,
    {tables, getEventHeader}: TransformData):
        toFormula<Map<number, AssignmentDirective>> {
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
            throw new Error(`Invalid assignment target. op: ${asFunction.op}, arg: ${ref}`)

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
            case 'Goto':
                throw new Error(`Goto statements should already be resolved`)
        }
    }

    const toModusAssignment = (modus: number): AssignTransitionAction => ({
        type: 'Assign',
        target: F.get(modi, index),
        source: P(modus),
    })

    const resolveConditionalAssignment = <T>(a: AssignmentDirective, cond: T) =>
        [a[0], F.cond(cond, a[1], F.noop()), a[2]] as AssignmentDirective

    const flattenResult = (result: StepResults<number>): Array<AssignmentDirective | null> =>
        [...result.execution, toModusAssignment(result.modus)].map(a => resolveConditionalAssignment(
                resolveAssignment(a), result.condition))

    type AssignmentDirective = [number, any, any]
    interface JValue {condition: TypedFormula<boolean>, assignments: AssignmentDirective[]}

    const junctures = new Map([...fsc.junctures].map(
        ([juncture, results]) => tuple(juncture ? {
            event: juncture.event,
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
            const header = j ? (j.modus << MODUS_BITS | getEventIndex(fsc, j.event)) : 0
            const {condition, assignments} = junctures.get(j) as JValue
            return F.pair(header, F.pair(condition, F.array(...assignments.map(a => F.array(...a)))))
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
    const currentEventPayload = F.cond(F.isNil(currentEvent), null, F.get(currentEvent, 1))
    const juncture = F.cond(F.eq(currentPhase, INIT_PHASE), 0, F.bwor(F.shl(modus, MODUS_BITS), currentEventType))
    const currentJuncture = F.get(modusMap, juncture)
    const effective = F.first(currentJuncture)
    const nextPhase = F.cond(F.or(effective, F.eq(currentPhase, IDLE_PHASE)), AUTO_PHASE, F.plus(currentPhase, 1))
    const advance = F.put(parseTable(phases), index, nextPhase)
    const deleteCurrentEvent = F.delete(parseTable(inbox), currentEventKey) as TypedFormula<AssignmentDirective>
    const assignments = F.flatMap([0, 1],
        F.cond(F.key(), F.second(currentJuncture), F.cond(currentEventKey,
            F.object(F.pair(10000, advance), F.pair(10001, deleteCurrentEvent)), F.object(F.pair(10000, advance)))))

    // TODO:
    // PAYLOAD, finish history
    return assignments
}
