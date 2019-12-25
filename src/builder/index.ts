import * as fs from 'fs'
import {Bundle} from './types'
import jsCompiler from './JSCompiler'

const grammar = require('./kal.ne.cjs')
const nearley = require("nearley")
type BuildOptions = {
    inputPath: string
    jsOutputPath?: string
    rsOutputPath?: string
    wasmOutputPath?: string
}

export async function build({inputPath, jsOutputPath, rsOutputPath, wasmOutputPath}: BuildOptions) : Promise<void> {
    jsOutputPath = jsOutputPath || `${inputPath}.mjs`
    rsOutputPath = rsOutputPath || `${inputPath}.rs`
    wasmOutputPath = wasmOutputPath || `${inputPath}.wasm`
    const jsonIntermediatePath = `${inputPath}.json`
    const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar))
    parser.feed(fs.readFileSync(inputPath, 'utf8'))
    const parsed = parser.results[0][0]
    fs.writeFileSync(jsonIntermediatePath, JSON.stringify(parsed, null, 4))
    const compiled = await jsCompiler(parsed as Bundle)

    fs.writeFileSync(jsOutputPath, compiled)
}