import fs from 'fs'
import path from 'path'
import nearley from 'nearley'
import YAML from 'yaml'
import { parseKal, ParseOptions } from './parser/index'
import { removeUndefined } from './transformers/helpers'
import {Bundle} from './types'
import transformBundle from './transformers/transform'
const {rollup} = require('rollup')
const rollupJson = require('rollup-plugin-json')
const rollupTypescript = require('rollup-plugin-typescript')
import sourcemaps from 'rollup-plugin-sourcemaps'

interface BuildOptions {
    inputPath?: string
    src?: string
    outputDir: string
    rollupConfig?: any
}

export function parse(yamlString: string, opt: ParseOptions = {internal: false}): Bundle {
    return removeUndefined(parseKal(YAML.parse(yamlString), opt))
}

export async function build(config: BuildOptions): Promise<void> {
    const bundle = parse(config.src || fs.readFileSync(config.inputPath || '', 'utf8'))
    const {store, views, buses} = transformBundle(bundle)
    const toOutputPath = (p: string) => path.resolve(config.outputDir, p)
    const resolveLib = (p: string) => path.relative(config.outputDir, path.resolve(__dirname, p))

    const storeOutputPath = toOutputPath('store.json')
    const viewsOutputPath = toOutputPath('views.json')
    const busOutputPath = toOutputPath('buses.json')
    const mainOutputPath = toOutputPath('main.js')
    const workerOutputPath = toOutputPath('worker.js')
    const mainWrapperOutputPath = toOutputPath('main-wrapper.js')
    const workerWrapperOutputPath = toOutputPath('worker-wrapper.js')

    fs.writeFileSync(busOutputPath, JSON.stringify(buses, null, 4))
    fs.writeFileSync(storeOutputPath, JSON.stringify(store, null, 4))
    fs.writeFileSync(viewsOutputPath, JSON.stringify(views, null, 4))

    const mainWrapper = `
        import main from '${resolveLib('../runtime/common/main')}'
        import views from './views.json'
        import buses from './buses.json'

        export default function init({rootElements}) {
            return main({rootElements, views, buses, storeWorkerPath: 'worker.js'})
        }
    `

    const interpreterWorkerWrapper = `
        import initStore from '${resolveLib('../runtime/interpreter/ShellWorker')}'
        import store from './store.json'

        initStore(store)
    `

    const rollupConfig = (name: string) => ({
        inputOptions: {
            input: `${toOutputPath(name)}-wrapper.js`,
            plugins: [
                rollupTypescript(),
                rollupJson({indent: '    ', preferConst: true, compact: true, namedExports: false}),
                sourcemaps()
            ]
        },
        outputOptions: {
            file: `${toOutputPath(name)}.js`,
            format: 'esm'
        },

    })

    fs.writeFileSync(workerWrapperOutputPath, interpreterWorkerWrapper)
    fs.writeFileSync(mainWrapperOutputPath, mainWrapper)

    const mainConfig = rollupConfig('main')
    const workerConfig = rollupConfig('worker')
    const b1 = await rollup(mainConfig.inputOptions)
    const b2 = await rollup(rollupConfig('worker').inputOptions)
    await b1.write(mainConfig.outputOptions)
    await b2.write(workerConfig.outputOptions)
}
