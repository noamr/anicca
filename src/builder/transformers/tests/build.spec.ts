import {flattenState} from '../flattenStatechart'
import transformLetToTable from '../resolveTables'
import transform from '../transform'
import fs from 'fs'
import PATH from 'path'
import {
    build
} from '../../index'

describe('build', () => {
    it.skip('all', () => {
        build({src: `
view myView:
    '#output':
        content: value
    '#increment':
        on click:
            - dispatch increment to myController
            - prevent default

    '#child':
        for id of myList:

controller myController:
    state root:
        entering:
            value = 0

        on increment:
            value += 1

let value: u32

        `, outputDir: '.tmp'
        })
    })

    it('todos', async () => {
        await build(
            {src: fs.readFileSync(PATH.resolve(__dirname, '../../../../examples/todo-mvc/todos.kal.yaml'), 'utf8'),
                outputDir: PATH.resolve(__dirname, '../../../../examples/todo-mvc/.kal')})
    })
})
