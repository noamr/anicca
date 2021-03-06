import {parse} from '../../index'
import { ControllerStatement, FlatStatechart } from '../../types'
import {flattenState} from '../flattenStatechart'

function parseAndFlatten(s: string): FlatStatechart {
    return flattenState((parse(`
controller myController:
    ${s}
    `)[0] as ControllerStatement).rootState)
}

describe('flatten statechart', () => {
    it('basic', () => {
        expect(parseAndFlatten(`
        state root:
            initial:
                goto a
            a:
                on e:
                    goto b
            b:
                on e when condition:
                    goto a
        `)).toMatchSnapshot()
    })
})
