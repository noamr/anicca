import letToTable from '../letToTable'
import combineControllers from '../combineControllers'
import flatten from '../flattenStatechart'

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

    describe('controllers', () => {
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
            it('atomize transitions', () => {
                expect(flatten(parse(`
                controller myController:
                    state root:
                        state a:
                            exiting:
                                value0 /= 2
                            initial:
                                goto a1
                            a1:
                                on e1:
                                    goto b
                        state b:
                            entering:
                                value *= 3
                            initial:
                                - goto b1
                                - value1 = 1
                            b1:
                                initial:
                                    goto b1a
                                b1a:                                    
                                b1b:
0               `))).toEqual(parse(`
                    state root:
                        a1:
                            on e1:
                                - goto b1a
                                - value0 /= 2
                                - value1 = 1
                        b1a:
                        b1b:
                `, {internal: true}))
            
        })
    })
})