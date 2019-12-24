import * as fs from 'fs'
type BuildOptions = {
    inputPath: string
    jsOutputPath?: string
    rsOutputPath?: string
    wasmOutputPath?: string
}

export async function build({inputPath, jsOutputPath, rsOutputPath, wasmOutputPath}: BuildOptions) : Promise<void> {
    jsOutputPath = jsOutputPath || `${inputPath}.mjs`
    rsOutputPath = rsOutputPath || `${rsOutputPath}.rs`
    wasmOutputPath = wasmOutputPath || `${wasmOutputPath}.wasm`
    fs.writeFileSync(jsOutputPath, `
        export function myApp({rootElement}) {
            rootElement.querySelector("#myText").innerHTML = "Hello World"
        }`)
}