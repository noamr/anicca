import {flattenState} from '../flattenStatechart'
import transformLetToTable from '../resolveTables'
import transform from '../transform'
import {
    build
} from '../../index'

describe('build', () => {
    it('all', () => {
        build({src: `
view myView:
    '#output':
        content: value
    '#increment':
        on click:
            - dispatch increment to myController
            - prevent default

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
})
