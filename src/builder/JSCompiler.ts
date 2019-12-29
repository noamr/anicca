import { DOMEventDeclaration, DispatchAction, Statechart } from './types'
import { Bundle,
    ViewStatement,
    BindDeclaration,
    AppStatement,
    ConstStatement,
    ControllerStatement,
    ExportStatement
 } from './types'

export function buildStatechart(chart: Statechart) : string{
    return `({
        const eventQueue = []
        const configuration = ['${chart.root.name}']
        let currentEvent = null

        function run() {
            while (eventQueue.length) {
                currentEvent = eventQueue.pop()
                
            }
        }
        function dispatch(e) {
            eventQueue.push(e)
            if (!running) {
                run()
            }
        }
        return {dispatch}
    })()`
}

export default async function compile(bundle: Bundle) {
    const byName = bundle.map(s => s.name ? ({[s.name]: s}) : {}).reduce((a, o) => Object.assign(a, o), {})
    return bundle.map(statement => {
        switch (statement.type) {
            case "View": {
                const vs = statement as ViewStatement
                return `const ${vs.name} = ({rootElement}) => {
                    ${
                        vs.rules.map(r =>
                            `Array.from(root0Element.querySelectorAll('${r.selector}')).forEach(e => {
                                ${
                                    r.declarations.map(d => {
                                        switch (d.type) {
                                            case 'Bind':
                                                const bd = d as BindDeclaration
                                                switch (bd.target.type) {
                                                    case 'html':
                                                        return `e.innerHTML = ${bd.src.$ref}`
                                                }

                                                break;
                                            case 'DOMEvent': {
                                                const ed = d as DOMEventDeclaration
                                                return `e.addEventListener('${ed.eventType}', event => {
                                                    ${ed.actions.map(a => {
                                                        switch (a.type) {
                                                            case 'Dispatch':
                                                                const da = a as DispatchAction
                                                                return `${da.controller}.dispatch('${da.event}')`
                                                                break;
                                                            case 'PreventDefault':
                                                                return 'event.preventDefault()'
                                                        }
                                                    }).join('\n')}
                                                })`
                                                break;
                                            }
                                        }
                                    }).join("\n")
                                }
                            })`
                        ).join('\n')
                    }
                }`
            }

            case "Controller": {
                const cs = statement as ControllerStatement
                return `const ${cs.name} = ${buildStatechart(cs.statechart )}`
            }
            case "Const": {
                const cs = statement as ConstStatement
                return `const ${cs.name} = ${JSON.stringify(cs.value)}`
            }

            case "App": {
                const as = statement as AppStatement
                return `const ${as.name} = options => {
                    ${
                        as.declarations.map(d => {
                            const ref = byName[d.ref]
                            if (!ref) {
                                throw new TypeError(`No such ref, ${d.ref}`)
                            }
        
                            switch (ref.type) {
                                case 'View':
                                    return `${d.ref}({rootElement: options.rootElement})`                        
                            }
                        }).join('\n')        
                    }
                }`
            }
            case "Export":
                return `export {${(statement as ExportStatement).ref}}`
            }
    }).join("\n")
}
