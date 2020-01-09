import {F, P, S, R, removeUndefined} from './helpers'
import { flattenState } from './flattenStatechart'
import { State, FlatStatechart, Juncture, StepResults, tuple, Statement, toFormula, TransitionAction, AssignTransitionAction, DispatchAction, Formula, ReferenceFormula, LetStatement, TypedRef, SlotStatement, FunctionFormula, Bundle, ControllerStatement, AssignmentDirective, TypedFormula, TransformData } from '../types'
import {keys, forEach, values, flatten, pickBy, map, assign, mapValues, filter} from 'lodash'
import useMacro from './useMacro'
import fs from 'fs'
import path from 'path'

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

const getTargetFromEventHeader = F.shr(F.bwand(F.first(F.value<EventType>()), F.minus(F.shl(1, INTERNAL_BITS), 1)), TARGET_BITS)
const getInternalFromEventHeader = F.shr(F.first(F.value<EventType>()), INTERNAL_BITS)

const INBOX_TABLE = '@inbox'
const MODI_TABLE = '@modi'
const PHASE_TABLE = '@phases'

const modi = {$ref: MODI_TABLE, $T: [] as number[]}
const phases = {$ref: PHASE_TABLE, $T: [] as number[]}
const inbox = {$ref: INBOX_TABLE, $T: [] as EventType[]}

export default function resolveControllers(bundle: Bundle, im: TransformData): Bundle {
    im = im || {}
    const bundleWithControllerTables = [
        ...bundle,
        S.table(INBOX_TABLE, {type: ['u32', 'ByteArray']}),
        S.table(MODI_TABLE, {type: 'u32'}),
        S.table(PHASE_TABLE, {type: 'u32'}),
    ]
    im.flatControllers = mapValues(
        map(filter(bundleWithControllerTables, ({type}) => type === 'Controller'), 
            (v: Statement, i) => ({[v.name || '']: [i, (v as ControllerStatement).rootState] as [number, State]})).reduce(assign), 
        (([i, s]: [number, State]) => [i, flattenState(s)] as [number, FlatStatechart]))

    const tables = map(filter(bundleWithControllerTables, ({type}) => type === 'Table'), (v: Statement, i) => ({[v.name || '']: i})).reduce(assign)

    const context: Context = {tables}
    const stagingByController = Object.entries(im.flatControllers).map(([name, [index, rootState]], i, controllers) => convertControllerToFormulas([name, rootState], index, im.flatControllers, context))

    const activeControllers = F.filter(stagingByController, F.neq(F.get(phases, F.key()), IDLE_PHASE))
    const controllersWithMessages = F.map(inbox, [F.pair(getTargetFromEventHeader, true)])
    const currentControllerIndex = F.cond(F.size(activeControllers), F.head(activeControllers), F.cond(F.size(controllersWithMessages), F.head(controllersWithMessages), -1))
    const idle = F.eq(currentControllerIndex, -1)
    const staging = F.cond(idle, [] as AssignmentDirective[], F.get(stagingByController, currentControllerIndex))

    return [
        ...bundleWithControllerTables.filter(({type}) => type !== 'Controller'),
        S.Slot('@staging', {formula: staging}),
        S.Slot('@idle', {formula: idle})
    ]
}

function convertControllerToFormulas(current: [string, FlatStatechart], index: number, allControllers: [string, [number, FlatStatechart]][], {tables}: Context): toFormula<AssignmentDirective[]> {
    const hashToIndex: {[hash: string]: number} = {}

    const [, fsc] = current

    forEach([...fsc.junctures], ([juncture], i) => { hashToIndex[juncture ? juncture.modus: ''] = i})

    const getEventIndex = (s: FlatStatechart, e: string|null) => {
        const index = e ? s.events.indexOf(e) + 1 : 0
        if (index < 0)
            throw new Error(`Event not found: ${e}`)
        return index
    }

    const parseAssignment = (target: Formula, source: Formula): AssignmentDirective => {
        const parseTable = ({$ref}: ReferenceFormula): number => {
            if (Reflect.has(tables, $ref))
                return tables[$ref]

            throw new Error(`Can only assign to tables. ${$ref} is not a table`)
        }

        const asRef = target as ReferenceFormula
        const asFunction = target as FunctionFormula
        if (asRef.$ref)
            return [parseTable(asRef), F.replace(), source]

        if (asFunction.op !== 'get' || !asFunction.args || asFunction.args.length !== 2)
            throw new Error(`Invalid assignment target. op: ${asFunction.op}`)
        
        const ref = asFunction.args && asFunction.args[0] as ReferenceFormula | undefined
        if (!ref || !ref.$ref)
            throw new Error(`Invalid assignment target. op: ${asFunction.op}, arg: ${ref}`)

        return [parseTable(ref), asFunction.args[1], source]
    }

    const resolveAssignment = (a: TransitionAction): AssignmentDirective => {
        switch (a.type) {
            case 'Assign':
                const {source, target} = a as AssignTransitionAction
                return parseAssignment(target, source)
            case 'Dispatch': {
                const {event, payload, target} = a as DispatchAction
                const targetIndex = target ? allControllers.findIndex(([name]) => name === target) : index
                if (targetIndex < 0)
                    throw new Error(`Target not found: ${target}`)

                const eventIndex = getEventIndex(allControllers[targetIndex][1][1], event)
                const internal = !target

                const header = 
                    eventIndex
                    | targetIndex << TARGET_BITS
                    | (internal ? 1 : 0) << INTERNAL_BITS

                
                return resolveAssignment({type: 'Assign', source: F.array(P(header), payload), target: F.get(inbox, F.uid())} as AssignTransitionAction)
            }
            case 'Goto':
                throw new Error(`Goto statements should already be resolved`)
        }
    }

    const toModusAssignment = (modus: number): AssignTransitionAction => ({
        type: 'Assign',
        target: F.get(modi, index),
        source: P(modus)
    })

    const resolveConditionalAssignment = <T>(a: AssignmentDirective, cond: T) =>
        [a[0], F.cond(cond, a[1], F.noop()), a[2]] as AssignmentDirective
    

    const flattenResult = (result: StepResults<number>): Array<AssignmentDirective | null> =>
        [...result.execution, toModusAssignment(result.modus)].map(a => resolveConditionalAssignment(resolveAssignment(a), result.condition))

    type AssignmentDirective = [number, any, any]
    type JValue = {condition: TypedFormula<boolean>, assignments: AssignmentDirective[]}

    const junctures = new Map([...fsc.junctures].map(
        ([juncture, results]) => tuple(juncture ? {
            event: juncture.event,
            modus: hashToIndex[juncture.modus]
        } : null, 
            {
                condition: F.not(F.not(F.or(...results.map(({condition}) => condition)))), 
                assignments: flatten(results.map(r => flattenResult(({condition: r.condition, execution: r.execution, modus: hashToIndex[r.modus]}) as StepResults<number>)))
            } as JValue)))

    const modusMap = ([...junctures].filter(([j]) => j) as [Juncture<number>, JValue][])
        .map(([j, v]) => tuple(j.modus << MODUS_BITS | getEventIndex(fsc, j.event), tuple(v.condition, v.assignments)))

    const effectiveMap = [...modusMap].map(([j, [e,]]) => ({[j]: e})).reduce(assign)
    const assignmentMap = {
        [0 as number]: (junctures.get(null) as JValue).assignments,
        ...[...modusMap].map(([j, [,a]]) => ({[j]: a})).reduce(assign)
    }
    
    const modus = F.cond(F.size(modi), F.get(modi, index), 0)
    const currentPhase = F.cond(F.size(phases), F.get(phases, index), INIT_PHASE)
    
    const currentEventKey = F.findFirst(inbox, F.and(
        F.eq(getTargetFromEventHeader, index),
        F.eq(getInternalFromEventHeader, F.cond(F.eq(currentPhase, INTERNAL_PHASE), 1, 0))
    ))

    const currentEvent = F.cond(F.eq(currentPhase, AUTO_PHASE), null, F.get(inbox, currentEventKey))
    const currentEventType = F.cond(F.isnil(currentEvent), 0, F.bwand(F.first(currentEvent), F.minus(F.shl(1, TARGET_BITS), 1)))
    const currentEventPayload = F.cond(F.isnil(currentEvent), null, F.second(currentEvent) as toFormula<ArrayBuffer>)
    const juncture = F.cond(F.eq(currentPhase, INIT_PHASE), 0, F.bwor(F.shl(modus, MODUS_BITS), currentEventType))
    const effective = F.get(effectiveMap, juncture)
    const nextPhase = F.cond(F.or(effective, F.eq(currentPhase, IDLE_PHASE)), AUTO_PHASE, F.plus(currentPhase, 1))
    const advance = F.put(phases, index, nextPhase)
    const deleteCurrentEvent = F.delete(inbox, currentEventKey) as TypedFormula<AssignmentDirective>
    const assignments = F.concat(F.get(assignmentMap, juncture), [advance, deleteCurrentEvent])

    // TODO:
    // PAYLOAD, finish history
    return assignments
}
