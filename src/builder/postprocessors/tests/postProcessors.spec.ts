import letToTable from '../letToTable'
import combineControllers from '../combineControllers'

import {
    parse
} from '../../index'

describe('post-processors', () => {
    it('let to table', () => {
        expect(letToTable(parse(`
        let variable: u32
    `))).toEqual(parse(`
        table @let_variable: u32

        slot variable:
            @let_variable[0]
        `, {
            internal: true
        }))
    })

    it('combine controllers', () => {
        expect(combineControllers(parse(`
        controller a:
            state root:
                when cond:
                    x  = 0        
        controller b:
            state root:
                s1:
                    when cond:
                        goto s2
                s2:
        `))).toEqual(parse(`
            controller @mainController:
                state @rootState:
                    initial:
                        goto @initialState
                    state @initialState:
                        on @startController:
                            goto @container

                    parallel @container:
                        state @controller_a:
                            state a_root:
                                when cond:
                                    x = 0
                        state @controller_b:
                            b_root:
                                state b_s1:
                                    when cond:
                                        goto b_s2
                                b_s2:
        `, {internal: true}))
    })
})