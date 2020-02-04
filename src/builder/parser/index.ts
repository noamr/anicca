import chalk from 'chalk'
import {execSync} from 'child_process'
import { Grammar, Parser} from 'nearley'
import {resolve} from 'path'
import {assert} from '../transformers/helpers'
import {ast, cst, parseDocument} from 'yaml'
import { NativeType, DatabaseStatement, NativeTupleType, Statement, ViewRule } from '../types'
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
  State,
  TableStatement,
  Token,
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
const toArray = (a: ast.AstNode|null) => a ? a.type === 'SEQ' ? a.items : [a] : []
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

function parseFormula(str: string | {[key: string]: string}): Formula {
    if (typeof str === 'string')
        return parseAtom(formulaParser)(`(${str})`) as Formula
    return {op: 'object', args: Object.entries(str).map(([k, v]) =>
        ({ op: 'tuple',
        args: [parseFormula(k), parseFormula(v)]}))} as FunctionFormula
}

const toStringNode = (s: ast.AstNode | null): {value: string, range: [number, number] | null} => {
    s = assert(s)
    return {range: s.range, value: s.toJSON()}
}

const parseStateActions = (s: ast.AstNode | null): TransitionAction[] =>
    toArray(s).map((action: ast.AstNode | null) =>
        parseAtom(controllerActionsParser)(toStringNode(action).value as string))

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

interface NodeTypes {
    MAP: ast.MapNode
    PAIR: ast.Pair
    PLAIN: ast.PlainValue
    SEQ: ast.SeqNode
}

function castAst<T extends keyof NodeTypes>(node: ast.AstNode|null, type: T): NodeTypes[T] {
    assert(node && node.type === type, `Expected ${node} to be of type ${type}`)
    return node as NodeTypes[T]
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
export interface ParseOptions {
    internal: boolean
}

function fixTokens(formula: Formula, fixer: (token?: Token) => Token): Formula {
    return {...formula, $token: fixer(formula.$token), args: Reflect.has(formula, 'args') ? 
        ((formula as FunctionFormula).args || []).map(a => fixTokens(a, fixer))
    : null} as Formula
}

export function parseKalDocument(
                        yaml: string,
                        file: string,
                        options: ParseOptions = {internal: false}): Bundle {

    const parseFormulaNode = (n: ast.AstNode|null): Formula => {
        const node = assert(n)

        if (node.type === 'MAP') {
            const n = node as ast.MapNode
            return {
                op: 'object', $token: {range: n.range, file},
                args: (n.items as ast.Pair[]).map(({key, value, range}: ast.Pair) =>
                    ({ op: 'tuple', $token: {range, file},
                       args: [parseFormulaNode(key), parseFormulaNode(value)]}))} as FunctionFormula
        }

        const formula = parseFormula(node.toJSON())
        const $token = {range: node.range, file}
        fixTokens(formula, (t?: Token) => (t && t.range && node.range)
            ? ({file, range: t.range.map(r => r + (node.range as [number, number])[0]) as [number, number]}) : {})
        return {...formula, $token}
    }

    const parseStateChildren = (node: ast.AstNode): Array<State|Transition> => {
        const s = castAst(node, 'MAP')

        return s.items.map(p => {
            const key = p.key as ast.PlainValue
            const value = p.value as ast.AstNode
            const atom = {...parseAtom(controllerParser)(key.toJSON()), $token: {file, range: key.range}}
            switch (atom.type) {
                case 'State':
                case 'Parallel':
                case 'Final':
                case 'History':
                    return {...atom, ...resolveChildren(parseStateChildren(value as ast.Map))}
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
    }

    const parseDOMEventAction = (node: ast.AstNode | null): DOMEventAction => {
        const action = toStringNode(node)

        const $token = {range: action.range, file}
        if (action.value === 'prevent default') {
            return {
                $token,
                type: 'PreventDefault'
            } as DOMEventAction
        }

        if (action.value === 'stop propagation') {
            return {
                $token,
                type: 'StopPropagation'
            } as DOMEventAction
        }

        const a = parseAtom(domEventActionParser)(action.value as string) as DOMEventAction
        assert(a, `Invalid DOM action: ${action.value}`)
        assert(a.type === 'Dispatch')
        return {...a, $token} as DispatchAction
    }

    const parseViewDeclarations = (v: ast.AstNode): ViewDeclaration[] =>
        castAst(v, 'MAP').items.map(({key, value}) => mapViewDeclaration(key, value as ast.AstNode))

    const mapViewDeclaration = (k: ast.AstNode | null, value: ast.AstNode | null): ViewDeclaration => {
        const key = toStringNode(k)

        try {
            const $token = {range: key.range, file}
            const action = parseAtom(viewRulesParser)(key.value as string)
            switch (action.type) {
                case 'DomEvent':
                    return {
                        actions: toArray(value).map(parseDOMEventAction),
                        eventType: action.eventType,
                        argName: action.argName,
                        condition: action.condition,
                        $token,
                        type: 'DOMEvent'
                    } as DOMEventDeclaration
                case 'BindAttribute':
                    return {
                        src: parseFormulaNode(value),
                        target: action.attribute,
                        $token,
                        targetType: 'attribute',
                        type: 'Bind'
                    } as BindDeclaration
                case 'BindData':
                    return {
                        src: parseFormulaNode(value),
                        target: action.attribute,
                        $token,
                        targetType: 'data',
                        type: 'Bind',
                    } as BindDeclaration
                case 'BindStyle':
                    return {
                        src: parseFormulaNode(value),
                        target: action.style,
                        $token,
                        targetType: 'style',
                        type: 'Bind',
                    } as BindDeclaration
                case 'BindContent':
                    return {
                        src: parseFormulaNode(value),
                        $token,
                        targetType: 'content',
                        type: 'Bind',
                    } as BindDeclaration
                case 'BindIndex':
                    return {
                        src: parseFormulaNode(value),
                        $token,
                        targetType: 'index',
                        type: 'Bind',
                    } as BindDeclaration
                case 'Clone':
                    return {
                        iterator: action.iterator,
                        mapSource: action.mapSource,
                        $token,
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

    const parseType = (node: ast.AstNode): NativeType => {
        if (node.type === 'MAP')
            return {
                $token: {range: node.range, file},
                tuple: node.items.map(item => (item.value as ast.PlainValue).value),
                getters: node.items.map(item => (item.key as ast.PlainValue).value)
            } as NativeTupleType

        return {...parseAtom(typeParser)(toStringNode(node).value), $token: {range: node.range, file}} as NativeType
    }

    const mapViewRules = (node: ast.AstNode | null) => {
        const rules = castAst(node, 'MAP')

        return (rules.items).map(({key, value}) => {
            const selector = (key as ast.PlainValue).value
            const declarations = parseViewDeclarations(value as ast.AstNode)
            return {selector, declarations, $token: {range: key ? key.range : null, file}} as ViewRule
        })
    }

    const mapEnum = (value: ast.AstNode) =>
        ((value as ast.Map).items as ast.Pair[])
            .map(({key, value}) => {
                return {[toStringNode(assert(key)).value as string]: +toStringNode(assert(value)).value}
            }).reduce((a, o) => Object.assign(a, o), {})


    const valueParser = {
        Controller: (key: any, value: ast.AstNode) => ({
            type: 'Controller',
            name: key.name,
            rootState: parseStateChildren(value)[0],
        } as ControllerStatement),
        Let: (key: any, valueType: ast.AstNode) => ({
            type: 'Let',
            name: key.name,
            valueType: parseType(valueType),
        } as LetStatement),
        Table: (key: any, valueType: ast.AstNode) => ({
            type: 'Table',
            name: key.name,
            valueType: parseType(valueType),
        } as TableStatement),
        Slot: (key: any, formula: ast.AstNode) => ({
            type: 'Slot',
            name: key.name,
            formula: parseFormulaNode(formula),
        } as SlotStatement),
        Database: (key: any, declarations: ast.AstNode) => ({
            type: 'Database',
            name: key.name,
            persist: ((declarations as ast.Map).items as ast.Pair[]).map(({key, value}) => {
                const table = (key as ast.PlainValue).value as string
                assert(table.startsWith('persist '))
                return {
                    table: table.substr(8),
                    mode: 'optimistic'
                }
            }),
        } as DatabaseStatement),
        Router: (key: any, declarations: ast.AstNode) => {
            const map = castAst(declarations, 'MAP')
            const routes = map.items.find(({key}) => toStringNode(key).value === 'routes') || null
            const onChange = map.items.find(({key}) => toStringNode(key).value === 'on change')
            return {
                type: 'Router',
                name: key.name,
                routes: castAst((routes as ast.Pair).value, 'MAP').items.map(({key, value}) =>
                    ({[toStringNode(key).value as string]:
                        parseFormulaNode(value as ast.AstNode)})).reduce((a, o) => Object.assign(a, o), {}),
                onChange: toArray((onChange as ast.Pair).value).map(parseDOMEventAction)
            } as RouterStatement
        },
        View: (key: any, value: ast.AstNode) => ({
            type: 'View',
            name: key.name,
            rules: mapViewRules(value),
        } as ViewStatement),
        Enum: (key: any, value: ast.AstNode) => {
            return {
                name: key.name,
                type: 'Enum',
                values: value.type === 'SEQ' ?
                    value.items.map((s, i) =>
                        ({[(s as ast.PlainValue).value as string]: i}))
                            .reduce((a, o) => Object.assign(a, o), {} as {[key: string]: number})
                    : mapEnum(value)
            } as EnumStatement
        }
    }

    function failOnInternals(b: any) {
        if (!b || typeof b !== 'object') {
            return
        }

        assert (b.$internal
            || !((b.name && b.name.startsWith('@'))
            || (b.$ref && b.$ref.startsWith('@'))
            || (b.event && b.event.startsWith('@'))))

        for (const key in b)
            failOnInternals(b[key])
    }

    const document = parseDocument(yaml)
    assert(document)

    const map = (document.contents) as ast.Map
    return (map.items as ast.Pair[]).map(({key, value}: ast.Pair) => {
        key = assert(key)
        const rootKey =
            parseAtom(rootParser)((key as ast.PlainValue).value as string) as
                ({type: keyof typeof valueParser})

        assert(rootKey)

        const p = assert(valueParser[rootKey.type])
        let v
        try {
            v = p(rootKey, value as ast.AstNode)
        } catch (e) {
            throw new Error(`Error while parsing ${key}: ${e.message}. Stack:\n\t\t${e.stack}`)
        }

        if (!options.internal)
            failOnInternals(v)

        return {...v, $token: {file, range: key.range}}
    })
}
