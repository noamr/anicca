import fs from 'fs'
import path from 'path'
import nearley from 'nearley'
import { ParseOptions, parseKalDocument } from './parser/index'
import { removeUndefined, assert } from './transformers/helpers'
import { Bundle, Token, RawFormula, NativeType, NativeTupleType } from './types'
import transformBundle from './transformers/transform'
const {rollup} = require('rollup')
const rollupJson = require('rollup-plugin-json')
const rollupTypescript = require('rollup-plugin-typescript')
import sourcemaps from 'rollup-plugin-sourcemaps'
const beautify = require('js-beautify').js

interface BuildOptions {
    inputPath?: string
    src?: string
    outputDir: string
    rollupConfig?: any
}

export function parse(yamlString: string, filename: string, opt: ParseOptions = {internal: false}): Bundle {
    return removeUndefined(parseKalDocument(yamlString, filename, opt))
}

export async function build(config: BuildOptions): Promise<void> {
    const bundle = parse(config.src || fs.readFileSync(config.inputPath || '', 'utf8'), config.inputPath || '#')
    const {store, views, channels, routes, persist, headers} = transformBundle(bundle)
    const toOutputPath = (p: string) => path.resolve(config.outputDir, p)
    const resolveLib = (p: string) => path.relative(config.outputDir, path.resolve(__dirname, p))

    const bundleOutputPath = toOutputPath('bundle.json')
    const storeOutputPath = toOutputPath('store.json')
    const viewsDebugOutputPath = toOutputPath('views-debug.json')
    const viewsOutputPath = toOutputPath('views.js')
    const routesOutputPath = toOutputPath('routes.json')
    const persistOutputPath = toOutputPath('persist.json')
    const busOutputPath = toOutputPath('channels.json')
    const mainOutputPath = toOutputPath('main.js')
    const storeWorkerOutputPath = toOutputPath('store-worker.js')
    const persistWorkerOutputPath = toOutputPath('persist-worker.js')
    const mainWrapperOutputPath = toOutputPath('main-wrapper.js')
    const storeWorkerWrapperOutputPath = toOutputPath('store-worker-wrapper.js')
    const persistWorkerWrapperOutputPath = toOutputPath('persist-worker-wrapper.js')
    const headersOutputPath = toOutputPath('headers.json')


    const generateEncoder = (t: NativeType, values: string) => {
        assert(typeof t === 'object' && Reflect.has(t, 'tuple'))

        const {tuple} = t as NativeTupleType
        if (tuple.length === 0)
            return null

        assert(tuple.every(t => typeof t === 'string'))
        return `encodeTuple(${values}, ${JSON.stringify(tuple)})`
    }

    const generateFormula = (f: RawFormula): string => {
        if (Reflect.has(f, 'value'))
            return JSON.stringify(f.value)

        const resolvedArgs = (f.args || []).map(i => generateFormula(views.formulas[i]))
        switch (f.op) {
            case 'plus':
                return resolvedArgs.join('+')
            case 'minus':
                return resolvedArgs.join('-')
            case 'mult':
                return resolvedArgs.join('*')
            case 'div':
                return resolvedArgs.join('/')
            case 'eq':
                return resolvedArgs.join('==')
            case 'get':
                return `${resolvedArgs[0]}[${resolvedArgs[1]}]`
            case 'tuple':
                return `[${resolvedArgs.join(',')}]`
            case 'key':
                return '$$key'
            case 'source':
                return '$$event'
            default:
                throw new Error(`Operation ${f.op} is not supported in views`)
        }
    }

    const generatedFormulas = views.formulas.map(f => `(${generateFormula(f)})`)
    const typeEncoders = views.types.map(t => (value: string) => `(${generateEncoder(t, value)})`)

    fs.writeFileSync(busOutputPath, JSON.stringify(channels, null, 4))
    fs.writeFileSync(bundleOutputPath, JSON.stringify(bundle, null, 4))
    fs.writeFileSync(storeOutputPath, JSON.stringify(
        {...store, debugInfo: store.debugInfo.map((t: Token) => ({...t, file: t.file ?
            path.relative(config.outputDir, t.file) : null}))}, null, 4))
    fs.writeFileSync(viewsDebugOutputPath, JSON.stringify(views, null, 4))
    fs.writeFileSync(viewsOutputPath, beautify(`
        import {encodeTuple} from '${resolveLib('../runtime/common/encodeDecode.ts')}'
        export const views =  {
            bindings: ${JSON.stringify(views.bindings, null, 4)},
            events: [
            ${views.events.map((
                ev) => `{
                view: ${JSON.stringify(ev.view)},
                selector: ${JSON.stringify(ev.selector)},
                root: ${JSON.stringify(ev.root)},
                eventType: ${JSON.stringify(ev.eventType)},
                handler: ($$event, $$key, $$send) => {
                    ${ev.handlers.map(h => `
                        ${ev.condition === null ? '' : `if (!${generatedFormulas[ev.condition as number]}) return;\n`}
                        ${h.payloadFormula === null ? `$$send(${h.header}, null)` :
                                `$$send(${h.header}, ${typeEncoders[h.payloadType as number](
                                    generatedFormulas[h.payloadFormula as number])})`}
                        `).join(',')}
                    ${ev.preventDefault ? '$$event.preventDefault()' : ''}
                    ${ev.stopPropagation ? '$$event.stopPropagation()' : ''}
                }

            }`).join(',')} ]
        }
    `))
    fs.writeFileSync(routesOutputPath, JSON.stringify(routes, null, 4))
    fs.writeFileSync(persistOutputPath, JSON.stringify(persist, null, 4))
    fs.writeFileSync(headersOutputPath, JSON.stringify(headers, null, 4))

    const mainWrapper = `
        import main from '${resolveLib('../runtime/common/main')}'
        import {views} from './views.js'
        import channels from './channels.json'
        import routeConfig from './routes.json'
        import headers from './headers.json'

        export default function init({rootElements, routes, dbName}) {
            return main({
                rootElements, routes, views, channels,
                persistWorkerPath: '.kal/persist-worker.js', dbName,
                storeWorkerPath: '.kal/store-worker.js', routeConfig, headers})
        }
    `

    const interpreterWorkerWrapper = `
        import initStore from '${resolveLib('../runtime/interpreter/ShellWorker')}'
        import store from './store.json'

        initStore(store)
    `
    const persistWorkerWrapper = `
        import initPersistor from '${resolveLib('../runtime/common/PersistWorker')}'

        initPersistor(${headers.persist}, ${JSON.stringify(persist)})
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

    fs.writeFileSync(storeWorkerWrapperOutputPath, interpreterWorkerWrapper)
    fs.writeFileSync(persistWorkerWrapperOutputPath, persistWorkerWrapper)
    fs.writeFileSync(mainWrapperOutputPath, mainWrapper)

    for (const name of ['main', 'persist-worker', 'store-worker']) {
        const cfg = rollupConfig(name)
        const output = await rollup(cfg.inputOptions)
        await output.write(cfg.outputOptions)
    }
}
