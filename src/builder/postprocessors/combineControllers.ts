import { Bundle, GotoAction, ControllerStatement, State, Transition, DispatchAction } from '../types'
import {F, S, R, fmap, removeUndefined} from './postProcessHelpers'

export default function combineControllers(bundle: Bundle) : Bundle {
    const controllers: State[] = []
    const qualifyStateOrTransition = (sot: State | Transition, controllerName: string): State|Transition => {
        const q = (s: string|undefined) => s && `${controllerName}_${s}`
        if (sot.type === 'Transition') {
            return {
                ...sot, 
                event: q(sot.event),
                actions: sot.actions && sot.actions.map(
                    a => ({...a, ...(
                    a.type === 'Dispatch') ? ((d: DispatchAction) => (
                        d.target ? {
                            event:`@e_${d.target}_${d.event}`,
                            target: '@mainController'
                        } : {event: `@e_${controllerName}_${d.event}`}
                    ) as DispatchAction)(a as DispatchAction) :                 
                    a.type === 'Goto' ? {
                        target: q((a as GotoAction).target)
                     }:                 
                        {}}))
            }
        }

        const state = sot as State
        return {
            type: state.type,
            children: state.children && state.children.map(c => qualifyStateOrTransition(c, controllerName)),
            name: q(state.name) as string
        }
    }
    const qualify = (controller: ControllerStatement): State => ({
        name: `@controller_${controller.name}`,
        type: 'State',
        children: [qualifyStateOrTransition(controller.rootState, controller.name)]
    })
    const withoutControllers = fmap(bundle, statement => {
        if (statement.type === 'Controller') {
            controllers.push(removeUndefined(qualify(statement as ControllerStatement)))
            return []
        }

        return [statement]
    })

    return [...withoutControllers, S.Controller('@mainController', {
        rootState: {
            type: 'State', name: '@rootState', children: [
                {type: 'Initial', default: [{type: 'Goto', target: '@initialState'}]},
                {type: 'State', name: '@initialState', children:
                    [{type: 'Transition', event: '@startController', 
                    actions: [{type: 'Goto', target: '@container'}]}]},
                {type: 'Parallel', name: '@container', children: controllers},                
            ]
        }
    }) as ControllerStatement]
}