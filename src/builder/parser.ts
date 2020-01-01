import { Bundle, LetStatement, ControllerStatement, ViewStatement, ViewDeclaration, DOMEventDeclaration, BindDeclaration, DOMEventAction, DispatchAction, RunScriptAction } from './types'
import {execSync} from 'child_process'
import { Parser, Grammar} from 'nearley'
import {resolve} from 'path'

function buildParser(filename: string): Parser {
    const module = {exports: {}} as {exports: Grammar | {}}
    eval(execSync(`nearleyc ${resolve(__dirname, filename)}`).toString('utf8'))
    return new Parser(module.exports as Grammar)
}

const rootParser = buildParser('./root.ne')
const formulaParser = buildParser('./formula.ne')
const controllerParser = buildParser('./controller.ne')
const controllerActionsParser = buildParser('./controllerActions.ne')
const viewRulesParser = buildParser('./viewRules.ne')
const domEventActionParser = buildParser('./eventActions.ne')
const parseAtom = (p: Parser) => (s: string) => {
    const before = p.save()
    p.feed(s)
    const r = p.results[0]
    p.finish()
    p.restore(before)
    return r
}

const parseStateActions = (s: any) =>
    toArray(s).map(action =>parseAtom(controllerActionsParser)(action))

const parseStateChildren = (s: any): any =>
    Object.keys(s).map(key => {
        const value = s[key]
        const atom = parseAtom(controllerParser)(key)
        switch (atom.type) {
            case 'State':                
            case 'Parallel':
            case 'Initial':
            case 'Final':
            case 'History':
                return {...atom, children: parseStateChildren(value)}
            case 'Transition':
            case 'OnEntry':
            case 'OnExit':
                return {...atom, actions: parseStateActions(value)}
            default:
                throw new Error(`Unknown controller key: ${key}`)
        }         
    })

const parseDOMEventAction = (action: any, value: any): DOMEventAction => {
    if (typeof action === 'object' && action['run script']) {
        return {
            type: 'RunScript',
            source: action['run script']
        } as RunScriptAction
    }

    const a = parseAtom(domEventActionParser)(action)
    switch (a.type) {
        case 'Dispatch':
            return a as DispatchAction
        default:
            throw new Error(`Unknown action ${a.type}`)
    }    
}

const mapViewDeclaration = (key: any, value: any): ViewDeclaration => {
    const action = parseAtom(viewRulesParser)(key)
    switch (action.type) {
        case 'DomEvent':
            return {
                type: 'DOMEvent',
                eventType: key.eventType,
                actions: toArray(value).map(parseDOMEventAction)
            } as DOMEventDeclaration
        case 'BindAttribute':
            return {
                type: 'Bind',
                src: parseAtom(formulaParser)(value),
                target: key.attribute,
                targetType: "attribute"
            } as BindDeclaration
        case 'BindData':
            return {
                type: 'Bind',
                src: parseAtom(formulaParser)(value),
                target: key.attribute,
                targetType: "data"
            } as BindDeclaration
        case 'BindStyle':
            return {
                type: 'Bind',
                src: parseAtom(formulaParser)(value),
                target: key.style,
                targetType: "style"
            } as BindDeclaration
        case 'BindContent':
            return {
                type: 'Bind',
                src: parseAtom(formulaParser)(value),
                targetType: "content"
            } as BindDeclaration
        default:
            throw new Error(`Unknow view type ${key.type}`)
    }
}

const valueParser = {
    "Controller": (key: any, value: any) => ({
        type: "Controller",
        name: key.name,
        rootState: parseStateChildren(value)[0]
    } as ControllerStatement),
    "Let": (key: any, value: any) => ({
        type: "Let",
        name: key.name,
        value
    } as LetStatement),
    "View": (key: any, value: any) => ({
        type: "View",
        name: key.name,
        rules: Object.keys(value).map(selector => ({
            selector,
            declarations: Object.keys(value[selector]).map(dkey => mapViewDeclaration(dkey, value[selector][dkey]))
        }))
    } as ViewStatement),
}

const toArray = (a: any) => Array.isArray(a) ? a : [a]
module.exports = function parseKal(parsedYaml: {[k: string]: any}) : Bundle {
    return Object.keys(parsedYaml).map(key => {
        const rootKey = parseAtom(rootParser)(key) as ({type: keyof typeof valueParser})
        const value = parsedYaml[key]
        if (!rootKey) {
            throw new Error(`Unknown key: ${key}`)
        }

        return valueParser[rootKey.type](rootKey, value)
    })
}