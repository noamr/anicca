import chalk from 'chalk'
import {execSync} from 'child_process'
import { Grammar, Parser} from 'nearley'
import {resolve} from 'path'
import {ast, cst, parseDocument} from 'yaml'
import { NativeType, DatabaseStatement, NativeTupleType, Statement } from '../types'
import {
  BindDeclaration,
  Bundle,
  CloneDeclaration,
  ControllerStatement,
  DispatchAction,
  DOMEventAction,
  DOMEventDeclaration,
  EnumStatement,
  Formula,
  FunctionFormula,
  GotoAction,
  LetStatement,
  RouterStatement,
  SlotStatement,
  TableStatement,
  Transition,
  TransitionAction,
  ViewDeclaration,
  ViewStatement
} from '../types'

function buildParser(filename: string): () => Parser {
    const module = {exports: {}} as {exports: Grammar | {}}
    // tslint:disable-next-line
    eval(execSync(`nearleyc ${resolve(__dirname, filename)}`).toString('utf8'))
    return () => {
        const p = new Parser(module.exports as Grammar)
        Reflect.set(p, 'reportError', (token: any) => {
            throw {token}
        })
        return p
    }
}

function colorize(s: string, token: {offset: number, text: string}) {
   return s.substr(0, token.offset) + chalk.white.bgRed.bold(s.substr(token.offset, token.text.length)) +
    s.substr(token.offset + token.text.length)
}

const rootParser = buildParser('./root.ne')
const formulaParser = buildParser('./formula.ne')
const typeParser = buildParser('./types.ne')
const controllerParser = buildParser('./controller.ne')
const controllerActionsParser = buildParser('./controllerActions.ne')
const viewRulesParser = buildParser('./viewRules.ne')
const domEventActionParser = buildParser('./eventActions.ne')
const toArray = (a: any) => Array.isArray(a) ? a : [a]
const parseAtom = (b: () => Parser) => (s: string) => {
    const p = b()
    try {
        p.feed(s)
        p.finish()        
    } catch (e) {
        if (e.token)
            throw new Error(`Parse error: ${colorize(s, e.token)}`)
        else
            throw e
    }
    const r = p.results[0]
    return r
}

const parseStateActions = (s: any): TransitionAction[] =>
    toArray(s).map((action: any) => parseAtom(controllerActionsParser)(action))

const parseDefaults = (actions: TransitionAction[]) => ({
    defaultActions: actions.filter(a => a.type !== 'Goto'),
    defaultTargets: actions.filter(a => a.type === 'Goto').map(a => (a as GotoAction).target),
})

const withDefaults = (state: any) => {
    const {children} = state
    if (!children || !children.length)
        return state

    const initial = children.find((s: any) => s.type === 'Initial')
    if (!initial)
        return {...state, children, default: children[0].name}
    return {...state, children: children.filter((c: any) => c !== initial),
        ...parseDefaults(initial.default)}
}

const withActions = (children: any[]) => {
    const onEntryChildren = children.filter(({type}) => type === 'OnEntry')
    const onExitChildren = children.filter(({type}) => type === 'OnExit')
    const timeoutTransitions = children.filter(({type, timeout}) => type === 'Transition' && timeout) as Transition[]
    const without = children.filter(({type}) => type !== 'OnEntry' && type !== 'OnExit')
    const onEntry = onEntryChildren.flatMap(({actions}) => actions)

    const onExit = onExitChildren.flatMap(({actions}) => actions)
    return {children: without, onEntry, onExit}
}

const resolveChildren = (children: any[]) => withDefaults(withActions(children))

const parseStateChildren = (s: any): any =>
    s && Object.keys(s).map(key => {
        const value = s[key]
        const atom = parseAtom(controllerParser)(key)
        switch (atom.type) {
            case 'State':
            case 'Parallel':
            case 'Final':
            case 'History':
                return {...atom, ...resolveChildren(parseStateChildren(value))}
            case 'Initial':
                return {...atom, default: parseStateActions(value)}
            case 'OnEntry':
            case 'OnExit':
                return {...atom, actions: parseStateActions(value)}
            case 'Transition':
                return {...atom, actions: value && parseStateActions(value)}
            default:
                throw new Error(`Unknown controller key: ${key}, ${JSON.stringify(atom)}`)
        }
    })

const parseDOMEventAction = (action: any, value: any): DOMEventAction => {
    if (action === 'prevent default') {
        return {
            type: 'PreventDefault'
        } as DOMEventAction
    }

    if (action === 'stop propagation') {
        return {
            type: 'StopPropagation'
        } as DOMEventAction
    }

    const a = parseAtom(domEventActionParser)(action)
    switch (a.type) {
        case 'Dispatch':
            return a as DispatchAction
        default:
            throw new Error(`Unknown action ${a.type}`)
    }
}

export function parseFormula(str: string| {[key: string]: string}): Formula {
    if (typeof str === 'string')
        return parseAtom(formulaParser)(`(${str})`) as Formula
    return {op: 'object', args: Object.entries(str).map(([k, v]) =>
        ({ op: 'tuple',
          args: [parseFormula(k), parseFormula(v)]}))} as FunctionFormula
}

const parseViewDeclarations = (value: {[key: string]: string}): ViewDeclaration[] =>
    Object.keys(value).map(dkey => mapViewDeclaration(dkey, value[dkey]))

const mapViewDeclaration = (key: any, value: any): ViewDeclaration => {
    try {
        const action = parseAtom(viewRulesParser)(key)
        switch (action.type) {
            case 'DomEvent':
                return {
                    actions: toArray(value).map(parseDOMEventAction),
                    eventType: action.eventType,
                    type: 'DOMEvent'
                } as DOMEventDeclaration
            case 'BindAttribute':
                return {
                    src: parseFormula(value),
                    target: key.attribute,
                    targetType: 'attribute',
                    type: 'Bind'
                } as BindDeclaration
            case 'BindData':
                return {
                    src: parseFormula(value),
                    target: key.attribute,
                    targetType: 'data',
                    type: 'Bind',
                } as BindDeclaration
            case 'BindStyle':
                return {
                    src: parseFormula(value),
                    target: key.style,
                    targetType: 'style',
                    type: 'Bind',
                } as BindDeclaration
            case 'BindContent':
                return {
                    src: parseFormula(value),
                    targetType: 'content',
                    type: 'Bind',
                } as BindDeclaration
            case 'Clone':
                return {
                    iterator: action.iterator,
                    childRules: mapViewRules(value),
                    type: 'Clone',
                } as CloneDeclaration
            default:
                throw new Error(`Unknow view type ${action.type}`)
        }
    } catch (e) {
        throw new Error(`Error mapping view declaration ${e}`)
    }
}

const parseType = (type: string | {[key: string]: string}): NativeType => {
    if (typeof type === 'string')
        return parseAtom(typeParser)(type) as NativeType

    return {
        tuple: Object.values(type).map(parseType),
        getters: Object.keys(type)
    } as NativeTupleType
}

const mapViewRules = (value: {[key: string]: any}) => Object.keys(value).map(selector => ({
            selector,
            declarations: parseViewDeclarations(value[selector])
        }))

const mapEnum = (value: {[key: string]: any}) => Object.entries(value).map(([k, v]) => {
    if (typeof v !== 'number' || typeof k !== 'string')
        throw new Error(`Invalid enum value: ${k}: ${v}`)
    return {[k]: v}
}).reduce((a, o) => Object.assign(a, o), {})


const valueParser = {
    Controller: (key: any, value: any) => ({
        type: 'Controller',
        name: key.name,
        rootState: parseStateChildren(value)[0],
    } as ControllerStatement),
    Let: (key: any, valueType: any) => ({
        type: 'Let',
        name: key.name,
        valueType: parseAtom(typeParser)(valueType),
    } as LetStatement),
    Table: (key: any, valueType: any) => ({
        type: 'Table',
        name: key.name,
        valueType: parseType(valueType),
    } as TableStatement),
    Slot: (key: any, formula: any) => ({
        type: 'Slot',
        name: key.name,
        formula: parseFormula(formula),
    } as SlotStatement),
    Database: (key: any, declarations: any) => ({
        type: 'Database',
        name: key.name,
        persist: Object.keys(declarations).map((d: string) => {
            if (!d.startsWith('persist ')) {
                throw new Error('expected: persist')
            }
            return {
                table: d.substr(8),
                mode: 'optimistic'
            }
        }),
    } as DatabaseStatement),
    Router: (key: any, declarations: any) => ({
        type: 'Router',
        name: key.name,
        routes: Object.entries(declarations.routes).map(([k, v]) =>
            ({[k]: parseFormula(v as string)})).reduce((a, o) => Object.assign(a, o), {}),
        onChange: toArray(declarations['on change']).map(parseDOMEventAction)
    } as RouterStatement),
    View: (key: any, value: any) => ({
        type: 'View',
        name: key.name,
        rules: mapViewRules(value),
    } as ViewStatement),
    Enum: (key: any, value: any) => {
        return {
            name: key.name,
            type: 'Enum',
            values: Array.isArray(value) ?
                value.map((s, i) => ({[s]: i})).reduce((a, o) => Object.assign(a, o), {} as {[key: string]: number})
                : mapEnum(value)
        } as EnumStatement
    }
}

export interface ParseOptions {
    internal: boolean
}

function failOnInternals(b: any) {
    if (!b || typeof b !== 'object') {
        return
    }
    if (b.$internal
        || (b.name && b.name.startsWith('@'))
        || (b.$ref && b.$ref.startsWith('@'))
        || (b.event && b.event.startsWith('@'))
        )
        throw new Error(`Internal refs not allowed: ${JSON.stringify(b)}`)

    for (const key in b)
        failOnInternals(b[key])
}

    const document = parseDocument(yaml, {keepCstNodes: true})
    if (!document || !document.cstNode)
        throw new Error(`Unable to parse ${file}`)

    const map = (document.contents) as ast.Map
    return (map.items as ast.Pair[]).map(({key, value}: ast.Pair) => {
        if (!key)
            throw new Error(`Key is null`)
        const rootKey =
            parseAtom(rootParser)((key as ast.PlainValue).value as string) as
                ({type: keyof typeof valueParser})
        if (!rootKey)
            throw new Error(`Unknown key: ${key} at ${key.range}`)

        const p = valueParser[rootKey.type]
        if (!p)
            throw new Error(`No parser found for ${rootKey.type}`)
        let v
        try {
            v = p(rootKey, (value as ast.PlainValue).toJSON())
        } catch (e) {
            throw new Error(`Error while parsing ${key}: ${e.message}. Stack:\n\t\t${e.stack}`)
        }

        if (!options.internal)
            failOnInternals(v)

        v.$token = {file, range: key.range}
        return v
    })
}

export function parseKal(
                        parsedYaml: {[k: string]: any},
                        options: ParseOptions = {internal: false}): Bundle {
    return Object.keys(parsedYaml).map(key => {
        const rootKey = parseAtom(rootParser)(key) as ({type: keyof typeof valueParser})
        const value = parsedYaml[key]
        if (!rootKey)
            throw new Error(`Unknown key: ${key}`)

        const p = valueParser[rootKey.type]
        if (!p)
            throw new Error(`No parser found for ${rootKey.type}`)
        let v
        try {
            v = p(rootKey, value)
        } catch (e) {
            throw new Error(`Error while parsing ${key}: ${e.message}. Stack:\n\t\t${e.stack}`)
        }

        if (!options.internal)
            failOnInternals(v)

        return v
    })
}
