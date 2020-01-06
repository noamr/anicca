import {F, P, S, R, fmap, removeUndefined} from './postProcessHelpers'
import { FlatStatechart, Juncture, StepResults } from './flattenStatechart'
import { Statement, TypedFormula, TransitionAction, AssignTransitionAction, DispatchAction, Formula, PrimitiveFormula, LetStatement } from '../types'
import {keys, forEach, values, flatten, assign, pick, merge, mapValues} from 'lodash'

type EventHeader = {
    event?: string | null
    payload?: any
    target?: {$ref: string}
    internal?: boolean
}
export default function convertControllerToFormula(fsc: FlatStatechart, controllerName: string): Statement[] {
    const hashToIndex: {[hash: string]: number} = {}

    forEach([...fsc.junctures], ([juncture], i) => { hashToIndex[juncture ? juncture.modus: ''] = i})

    const convertActionToAssignment = (a: TransitionAction): AssignTransitionAction => {
        switch (a.type) {
            case 'Assign':
                return a as AssignTransitionAction
            case 'Dispatch': {
                const {event, payload, target} = a as DispatchAction
                return {type: 'Assign', source: 
                    F.object(F.entry('event', event),
                        F.entry('payload', payload),
                        F.entry('target', {$ref: target || controllerName}), 
                        F.entry('internal', !target)
                    ), 
                    target: {$ref: '@queue'}}
            }
            case 'Goto':
                throw new Error(`Goto statements should already be resolved`)
        }
    }

    `
    namespace @_${controllerName}_internals:
       let currentPhase: u8
       let modus: number
       const nonEvent: object(entry('event', null))

       slot internalQueue:
            @queue |> filter(value().internal && value().target == '${controllerName}') 
       slot @externalQueue:
            @queue |> filter(!value().internal && value().target == '${controllerName}') 
       slot internalEvent:
            internalQueue |> head
       slot externalEvent:
            externalQueue |> head
       slot currentEvent:
            currentPhase == 0 ? nonEvent :
            currentPhase == 1 ? internalEvent :
            currentPhase == 2 ? externalEvent :
            null
       slot dequeue:
            @queue |> without(currentEvent)
        
        
    `
    
    const queueRef = {$ref: '@queue'} as TypedFormula<Map<number, EventHeader>>
    const internalQueue = F.filter(queueRef, F.and(F.get(F.value<EventHeader>(), 'internal'), F.eq(F.get(F.value<EventHeader>(), 'target'), controllerName)))
    const externalQueue = F.filter(queueRef, F.and(F.not(F.get(F.value(), 'internal')), F.eq(F.get(F.value<EventHeader>(), 'target'), controllerName)))
    const internalEvent = F.head(internalQueue) as TypedFormula<EventHeader|null>
    const externalEvent = F.head(externalQueue) as TypedFormula<EventHeader|null>
    const nonEvent = F.object(F.entry('event', null)) as TypedFormula<EventHeader>
    const currentPhase = {$ref: '@phase'} as TypedFormula<number>

    const currentEvent = 
        F.cond(F.eq(currentPhase, 0), nonEvent, F.cond(F.eq(currentPhase, 1), internalEvent, F.cond(F.eq(currentPhase, 2), externalEvent, null))) as TypedFormula<number|null>

    const dequeue = F.without(queueRef, currentEvent)
    const phases = {
        auto: 0,
        internal: 1,
        external: 2,
        wait: 3,
        flush: 5
    }

    const effective = {}
    const hasPendingInboxMessages = F.not(F.not(F.size({$ref: '@inbox'})))
    const nextPhase = F.cond(
        F.eq(currentPhase, phases.auto), 
            F.cond(effective,
                phases.auto, 
                phases.internal
            ),
            F.cond(F.eq(currentPhase, phases.internal),
                F.cond(effective,
                    phases.auto,
                    phases.external,
                ),
                F.cond(F.eq(currentPhase, phases.external),
                    F.cond(effective, phases.auto, phases.wait),
                    F.cond(F.eq(currentPhase, phases.flush), phases.auto, 
                        F.cond(hasPendingInboxMessages, phases.flush, phases.wait)
                    )
                )
            )
        )


    const toModusAssignment = (modus: number): AssignTransitionAction => ({
        type: 'Assign',
        target: {$ref: '@modus'},
        source: P(modus)
    })

    const flattenResult = (result: StepResults<number>): AssignTransitionAction[] =>
        [...result.execution, toModusAssignment(result.modus)].map((a: TransitionAction) => {
            const {source, target} = convertActionToAssignment(a)
            return {
                type: 'Assign',
                target,
                source: F.cond(result.condition, source, target)    
            } as AssignTransitionAction
        })

    type JValue = {condition: Formula, assignments: AssignTransitionAction[]}
    type EValue = JValue & Juncture<number>

    const junctures = new Map([...fsc.junctures].map(
        ([juncture, results]) => [juncture ? {
            event: juncture.event,
            modus: hashToIndex[juncture.modus]
        } as Juncture<number> : null, 
            {condition: F.or(...results.map(({condition}) => condition)), 
             assignments: flatten(results.map(r => flattenResult(({condition: r.condition, execution: r.execution, modus: hashToIndex[r.modus]}) as StepResults<number>)))}
            ] as [Juncture<number>|null, JValue]))

    const entries = 
        [...junctures].filter(j => j).map(([juncture, jv]: [Juncture<number> | null, JValue]) => 
            juncture ? ({modus: juncture.modus, event: juncture.event, condition: jv.condition, assignments: jv.assignments}) : null)

    const assignmentsToFormula = (a: AssignTransitionAction[]) =>
        a.map(({target, source}) => [target, source] as [Formula, Formula])
    const eventlessEntries = entries.filter(e => e && !e.event) as EValue[]
    const eventEntries = entries.filter(e => e && e.event) as EValue[]

    const initialAssignments = (junctures.get(null) as JValue).assignments
    const modusMap = ([...junctures].filter(([j]) => j) as [Juncture<number>, JValue][]).
        map(([j, v]) => ({[j.modus]: [j.event, {effective: v.condition, assignments: assignmentsToFormula(v.assignments)}] as [string|null, {effective: Formula, assignments: Formula}]})).reduce(merge)

    const effectiveMap = Object.entries(mapValues(modusMap, e => 
        new Map(e.map(([event, ({effective})]) => [event, effective] as [string|null, Formula]))))
    return [
        modusVarStatement,
    ]

}
