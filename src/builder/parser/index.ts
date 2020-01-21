import {execSync} from 'child_process'
import { Grammar, Parser} from 'nearley'
import {resolve} from 'path'
import {
  BindDeclaration,
  Bundle,
  ControllerStatement,
  DispatchAction,
  DOMEventAction,
  DOMEventDeclaration,
  Formula,
  GotoAction,
  LetStatement,
  SlotStatement,
  TableStatement,
  TransitionAction,
  ViewDeclaration,
  ViewStatement
} from '../types'

function buildParser(filename: string): () => Parser {
    const module = {exports: {}} as {exports: Grammar | {}}
    // tslint:disable-next-line
    eval(execSync(`nearleyc ${resolve(__dirname, filename)}`).toString('utf8'))
    return () => new Parser(module.exports as Grammar)
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
    p.feed(s)
    p.finish()
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
    const without = children.filter(({type}) => type !== 'OnEntry' && type !== 'OnExit')

    const onEntry = onEntryChildren.flatMap(({actions}) => actions)
    const onExit = onExitChildren.flatMap(({actions}) => actions)
    return {children: without, onEntry, onExit}
}

const resolveChildren = (children: any[]) => {
    const s = withDefaults(withActions(children))
    console.log(s)
    return s
}
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

export function parseFormula(str: string): Formula {
    return parseAtom(formulaParser)(`(${str})`) as Formula
}

const mapViewDeclaration = (key: any, value: any): ViewDeclaration => {
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
        default:
            throw new Error(`Unknow view type ${key.type}`)
    }
}

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
        valueType: parseAtom(typeParser)(valueType),
    } as TableStatement),
    Slot: (key: any, formula: any) => ({
        type: 'Slot',
        name: key.name,
        formula: parseFormula(formula),
    } as SlotStatement),
    View: (key: any, value: any) => ({
        type: 'View',
        name: key.name,
        rules: Object.keys(value).map(selector => ({
            selector,
            declarations: Object.keys(value[selector]).map(
                dkey => mapViewDeclaration(dkey, value[selector][dkey])),
        })),
    } as ViewStatement),
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
        const v = p(rootKey, value)
        if (!options.internal)
            failOnInternals(v)

        return v
    })
}
