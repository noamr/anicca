import * as fs from 'fs'
import {Bundle} from './types'
import YAML from 'yaml'
import { ParseOptions, parseKal } from './parser/index'
import nearley from 'nearley'
import { removeUndefined } from './postprocessors/postProcessHelpers'

type BuildOptions = {
    inputPath: string
    jsOutputPath?: string
    rsOutputPath?: string
    wasmOutputPath?: string
}


export function parse(yamlString: string, opt: ParseOptions = {internal: false}): Bundle {
    return removeUndefined(parseKal(YAML.parse(yamlString), opt))
}

export async function build({inputPath, jsOutputPath, rsOutputPath, wasmOutputPath}: BuildOptions) : Promise<void> {
//     jsOutputPath = jsOutputPath || `${inputPath}.mjs`
//     rsOutputPath = rsOutputPath || `${inputPath}.rs`
//     wasmOutputPath = wasmOutputPath || `${inputPath}.wasm`
//     const jsonIntermediatePath = `${inputPath}.json`
//     const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar))
//     parser.feed(fs.readFileSync(inputPath, 'utf8'))
//     const parsed = parser.results[0][0]
//     fs.writeFileSync(jsonIntermediatePath, JSON.stringify(parsed, null, 4))
//  //   const compiled = await jsCompiler(parsed as Bundle)

// //    fs.writeFileSync(jsOutputPath, compiled)
}