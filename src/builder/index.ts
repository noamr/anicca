import * as fs from 'fs'

const grammar = require('./kal.ne.cjs')
const nearley = require("nearley")
const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar))

type BuildOptions = {
    inputPath: string
    jsOutputPath?: string
    rsOutputPath?: string
    wasmOutputPath?: string
}

type Primitive = string | number | boolean | null

type StatementType = "Const" | "View" | "App" | "Export"
type Statement = {
    name?: string
    type: StatementType
}
interface ConstStatement extends Statement {
    type: "Const"
    value: Primitive
}

interface ExportStatement extends Statement {
    type: "Export"
    ref: Reference
}

interface ViewDeclaration {
    type: "Bind"

}

type BindTarget = "innerHTML"

type Reference = {
    type: "Formula" | "Const"
    ref: string
}

interface BindDeclaration extends ViewDeclaration{
    type: "Bind"
    src: Reference
    target: BindTarget
}

type ViewRule = {
    type: "ViewRule"
    selector: string
    declarations: Array<ViewDeclaration>
}

type AppDeclaration = {
    type: "Use"
    ref: string
}

type AppStatement = {
    type: "App"
    name: string
    declarations: Array<AppDeclaration>
}
type ViewStatement = {
    type: "View"
    name: "string"
    rules: Array<ViewRule>
}



type ParsedKal = Array<Statement>

async function compile(bundle: ParsedKal) {
    const byName = bundle.map(s => s.name ? ({[s.name]: s}) : {}).reduce((a, o) => Object.assign(a, o), {})
    return bundle.map(statement => {
        switch (statement.type) {
            case "View": {
                const vs = statement as ViewStatement
                return `const ${vs.name} = ({rootElement}) => {
                    ${
                        vs.rules.map(r =>
                            `[...rootElement.querySelectorAll('${r.selector}')].forEach(e => {
                                ${
                                    r.declarations.map(d => {
                                        const bd = d as BindDeclaration
                                        return `e.${bd.target} = ${bd.src.ref}`
                                    }).join("\n")
                                }
                            })`
                        ).join('\n')
                    }
                }`
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
export async function build({inputPath, jsOutputPath, rsOutputPath, wasmOutputPath}: BuildOptions) : Promise<void> {
    jsOutputPath = jsOutputPath || `${inputPath}.mjs`
    rsOutputPath = rsOutputPath || `${inputPath}.rs`
    wasmOutputPath = wasmOutputPath || `${inputPath}.wasm`
    const jsonIntermediatePath = `${inputPath}.json`

    parser.feed(fs.readFileSync(inputPath, 'utf8'))
    const parsed = parser.results[0][0]
    fs.writeFileSync(jsonIntermediatePath, JSON.stringify(parsed, null, 4))
    const compiled = await compile(parsed)

    fs.writeFileSync(jsOutputPath, compiled)
}