import {parse} from 'yaml'
const {parseKal} = require('../index')

describe('kitchen sink', () => {
    it('views with clones', () => {
        expect(parseKal(parse(`
view someView:
    '#some-id':
        content: someValue & hello
        on mousedown:
            - dispatch someEvent to someController
            - prevent default
            - stop propagation
        on click:
            dispatch hello to someOtherController

    '#some-clone':
        for [id, value] in myMap:
            .something:
                content: value
                attribute class: \`\${id}-class\`

`))).toMatchSnapshot()
    })
    it('timers', () => {
        expect(parseKal(parse(`
controller someController:
    root:
        a:
            on someEvent:
                goto b
        b:
            after 30 seconds:
                goto a
        c:
            after a+5 minutes when condition==0:
                goto a
`))).toMatchSnapshot()
    })
})
