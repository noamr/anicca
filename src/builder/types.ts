import { T } from "index"

export type Primitive = string | number | boolean | null

export type StatementType = "Const" | "View" | "App" | "Export" | "Controller"

export interface WithToken {
    $token?: {
        line: number
        col: number
    }

}
export interface Statement extends WithToken {
    name?: string
    type: StatementType
}
export interface ConstStatement extends Statement {
    type: "Const"
    value: Primitive
}

export interface ExportStatement extends Statement {
    type: "Export"
    ref: Formula
}

export interface ViewDeclaration extends WithToken {
    type: "Bind" | "DOMEvent"
}

export interface BindTarget extends WithToken  {
    type: 'html' | 'attribute' | 'style'
}

export interface Formula extends WithToken {
}
export interface ReferenceFormula extends Formula {
    $ref: string
}
export interface PrimitiveFormula extends Formula {
    $primitive: Primitive
}

export interface FunctionFormula<Op extends string = string> extends Formula {
    op: Op
    args?: Formula[]
}






export interface BindDeclaration extends ViewDeclaration{
    type: "Bind"
    src: Formula
    target: BindTarget
}

export interface DOMEventDeclaration extends ViewDeclaration {
    type: "DOMEvent"
    eventType: string
    actions: Array<DOMEventAction>
}

export interface DOMEventAction extends WithToken {
    type: "PreventDefault" | "Dispatch"
}

export interface DispatchAction extends DOMEventAction {
    type: "Dispatch"
    controller: string
    event: string
}

export interface ViewRule extends WithToken  {
    type: "ViewRule"
    selector: string
    declarations: Array<ViewDeclaration>
}

export interface AppDeclaration extends WithToken  {
    type: "Use"
    ref: string
}

export interface AppStatement extends Statement {
    type: "App"
    name: string
    declarations: Array<AppDeclaration>
}

export interface ControllerStatement extends Statement {
    type: "Controller"
    name: string
    statechart: Statechart
}

export type Statechart = {
    root: State
}

export interface ViewStatement extends Statement {
    type: "View"
    name: "string"
    rules: Array<ViewRule>
}

export interface Transition extends WithToken {
    event?: string
    actions?: Array<TransitionAction>
}

export type TransitionAction = {
    type: "Assign" | "Dispatch"
}

export type AssignTransitionAction = {
    type: "Assign"
    operand: "=" | "+=" | "-=" | "*=" | "/=" | "|=" | "&="
    source: string
    target: string
}

export type State = {
    type: "State"
    name: string
    children: Array<State|Transition>
}

export type Bundle = Array<Statement>