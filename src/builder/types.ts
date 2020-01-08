export type Primitive = string | number | boolean | null
import flattenState from './postprocessors/flattenStatechart';

export type StatementType = "Const" | "View" | "Main" | "Let" | "Controller" | "Slot" | "Bus" | "Table" | "FlatController"

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

export type PostProcessor = (bundle: Bundle) => Bundle

export interface ConstStatement extends Statement {
    type: "Const"
    value: Primitive
}

export interface SlotStatement extends Statement {
    type: "Slot"
    formula: Formula
}
export interface LetStatement extends Statement {
    type: "Let"
    valueType: Primitive
}

export interface TableStatement extends Statement {
    type: "Table"
    valueType: Primitive
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
    target?: string
    targetType: "content" | "attribute" | "data" | "style"
}

export interface DOMEventDeclaration extends ViewDeclaration {
    type: "DOMEvent"
    eventType: string
    actions: Array<DOMEventAction>
}

export interface DOMEventAction extends WithToken {
    type: "RunScript" | "Dispatch"
}

export interface DispatchAction extends DOMEventAction {
    type: "Dispatch"
    target: string
    event: string
    payload?: any
    
}
export interface GotoAction extends TransitionAction {
    type: "Goto"
    target: string
}

export interface RunScriptAction extends DOMEventAction {
    type: "RunScript"
    source: string
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

export interface MainStatement extends Statement {
    type: "Main"
    declarations: Array<AppDeclaration>
}

export interface ControllerStatement extends Statement {
    type: "Controller"
    name: string
    rootState: State
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
    type: 'Transition'
    event?: string
    condition?: Formula
    actions?: Array<TransitionAction>
}

export type TransitionAction = {
    type: "Assign" | "Dispatch" | "Goto"
}
export type AssignTransitionAction = {
    type: "Assign"
    source: Formula
    method?: 'post' | 'put' | 'delete' 
    target: Formula
}

export type State = {
    type: "State" | "Parallel" | "Final" | "History" | "Initial"
    name: string
    deep?: boolean
    defaultTargets?: string[]
    defaultActions?: TransitionAction[]
    onEntry?: TransitionAction[]
    onExit?: TransitionAction[]
    children: Array<State|Transition>
}

type NT<Name> = {$T: Name}
type NumberTypeNames = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'i8' | 'i16' | 'i32' | 'i64' | 'i128' | 'f32' | 'f64'
type NumberType = NT<NumberTypeNames>
type StringType = NT<'string'>
type BoolType = NT<'boolean'>
type ArrayType = NT<'array'>
type NullType = NT<'null'>
type MapType<K,V> = NT<[K, V]>
type Nullable<T> = NullType | T
export type NativeType = {$T: any}

type JSType<T extends NativeType> =
    T extends Pair<infer K, infer V> ? JSPairTypeFor<K, V> :
    T extends NumberType ? {$: number} :
    T extends StringType ? {$: string} :
    T extends MapType<infer K, infer V> ?  JSMapTypeFor<K extends NativeType ? K : never, V extends NativeType ? V : never> :
    T extends NullType ? {$: null} :
    never

type Pair<K, V> = [K, V]
type JSToNativeType<T> =
    T extends number ? {$: NumberType} :
    T extends Pair<infer K, infer V> ? NativePairTypeFor<K, V> :
    T extends string ? {$: StringType} :
    T extends null ? {$: NullType} : 
    T extends boolean ? {$: BoolType} :
    T extends Map<infer K, infer V> ? NativeMapTypeFor<K, V>:
    T extends {[key: string]: infer V} ? NativeMapTypeFor<string, T[keyof T]> :
    T extends Array<any> ? NativeMapTypeFor<keyof T, T[keyof T]>:
    never

    interface JSMapTypeFor<K extends NativeType, V extends NativeType> {
        $: Map<JSType<K>, JSType<V>>
    }
interface JSPairTypeFor<K, V> {
    $: [toJSType<K>, toJSType<V>]
}
        
interface NativeMapTypeFor<K, V> {
    $: MapType<JSToNativeType<K>, JSToNativeType<V>>
}

interface NativePairTypeFor<K, V> {
    $: [toNativeType<K>, toNativeType<V>]
}

type ArgumentTypes<F extends Function> = F extends (...args: (infer A)[]) => any ? A : never;
type ReturnType<F extends Function> = F extends (...args: (infer A)[]) => infer R ? R : never;

export interface TypedFormula<T> extends Formula {
    $T: toJSType<T>
}

type toJSType<T> = T extends NativeType ? JSType<T>["$"] : T

type toNativeType<T> = T extends NativeType ? T : JSToNativeType<T>["$"]


export interface TypedPrimitive<T> extends TypedFormula<T>{
    $primitive: toJSType<T>
}

export interface TypedRef<T> extends TypedFormula<T>{
    $ref: string
}

type MapKeyType<M> = M extends Map<infer K, any> ? K : never
type MapEntryType<M> = M extends Map<infer K, infer V> ? [K, V] : never
type MapValueType<M> = M extends Map<any, infer V> ? V : never

interface SimpleFunctions {
    gt(a: number, b: number): boolean
    gte(a: number, b: number): boolean
    lt(a: number, b: number): boolean
    lte(a: number, b: number): boolean
    eq(a: number|string|null|boolean, b: number|string|null|boolean): boolean 
    neq(a: number|string|null|boolean, b: number|string|null|boolean): boolean
    plus(a: number, b: number): number
    minus(a: number, b: number): number
    mult(a: number, b: number): number
    div(a: number, b: number): number
    pow(a: number, b: number): number
    mod(a: number, b: number): number
    bwand(a: number, b: number): number
    bwor(a: number, b: number): number
    bwxor(a: number, b: number): number
    shl(a: number, b: number): number
    shr(a: number, b: number): number
    ushr(a: number, b: number): number
    bwnot(a: number): number
    negate(a: number): number
    sin(a: number): number
    cos(a: number): number
    tan(a: number): number
    atan(a: number): number
    log(a: number): number
    log2(a: number): number
    log10(a: number): number
    acos(a: number): number
    asin(a: number): number
    sqrt(a: number): number
    floor(a: number): number
    ceil(a: number): number
    round(a: number): number
    trunc(a: number): number
    round(a: number): number
    parseInt(a: string, r: number): number
    parseFloat(a: string, r: number): number
    formatNumber(n: number, r: number): string
    now(): number
    uid(): number
    source(): Map<any, any>
    toLowerCase(s: string): string
    toUpperCase(s: string): string
    startsWith(s: string, a: string): boolean
    endsWith(s: string, a: string): boolean
    stringIncludes(s: string, a: string): boolean
    noop(): null
}

export function tuple<A, B>(a: A, b: B) {
    return [a, b] as [A, B]
}

type IsTuple<T> = T extends Array<any> ? number extends T["length"] ? false : true : false
export type toArgType<T> = T | toJSType<T> | toFormula<T>
export type toFormula<T> = 
    T extends TypedFormula<infer R> ? T : T extends {$T: infer R} ? TypedFormula<R> : TypedFormula<toJSType<T>>
type ValueTypeOf<T, K = any> = 
    T extends Map<any, infer V> ? V :
    T extends {[key: number]: infer V} ? V :
    T extends {[key: string]: infer V} ? V :
    IsTuple<T> extends true ? never :
    T extends Array<infer V> ? V :
    never

type KeyTypeOf<T> = 
    T extends Map<infer K, any> ? K :
    T extends {[key: number]: infer V} ? number :
    T extends {[key: string]: infer V} ? string :
    keyof T

type KeyType<T> = KeyTypeOf<ResolveType<T>>
type ValueType<T, K = any> = ResolveType<ValueTypeOf<ResolveType<T>, K>>
type ResolveType<P> = P extends {$T: infer T} ? toJSType<T> : toJSType<P>
type IsMapType<T> = toJSType<T> extends Map<any, any> ? true : never

export type AssignmentDirective<K = any, V = any> = [number, ResolveType<K>, ResolveType<V>]

export type FormulaBuilder = {
    [k in keyof SimpleFunctions]: (...args: toArgType<ArgumentTypes<SimpleFunctions[k]>>[])=> toFormula<ReturnType<SimpleFunctions[k]>>
} & {
    entry<K, V>(k: K, v: V): toFormula<Pair<K, V>>
    get<M, K>(s: M, k: K): toFormula<ValueType<M, K>>
    first<P>(s: P): ResolveType<P> extends ResolveType<[infer A, any]> ? toFormula<A> : never
    second<P>(s: P): ResolveType<P> extends ResolveType<[any, infer B]> ? toFormula<B> : never
    map<M, P>(input: M, predicate: P): toFormula<P> extends toFormula<[infer K2, infer V2]> ? toFormula<Map<K2, V2>> : never
    reduce<M, P>(map: M, predicate: P): 
        ResolveType<P> extends [infer R, boolean] ? toFormula<R> : never
    head<M>(a: M): toFormula<KeyType<M>>
    findFirst<T, P>(t: T, p: P): IsMapType<T> extends true ? toFormula<KeyType<T>> : never
    concat<A, B>(a: A, b: B): toFormula<Array<ValueType<A> | ValueType<B>>>
    object<P>(...entries: P[]): P extends toArgType<Pair<infer K, infer V>> ? toFormula<Map<K, V>> : never
    array<V>(...entries: V[]): toFormula<V[]>
    pair<A, B>(a: A, b: B): toFormula<[ResolveType<A>, ResolveType<B>]>
    not<T>(o: any): toFormula<boolean>
    and<A>(...args: A[]): toFormula<A>
    or<A>(...args: A[]): toFormula<A>
    key<T = string|number>(): toFormula<T>
    value<T = any>(): toFormula<T>
    size<T>(m: T): toFormula<number>
    isnil<A>(a: A): toFormula<A extends null ? true : boolean>
    cond<Condition, Consequent, Alternate>(c: Condition, t: Consequent, a: Alternate): 
        toFormula<Consequent | Alternate>
    put<T, K, V>(table: T, key: K, value: V): toFormula<AssignmentDirective<K, V>>
    delete<T, K>(table: T, key: K): toFormula<AssignmentDirective<K, any>>
    replace(): toFormula<AssignmentDirective>
    merge(): toFormula<AssignmentDirective>
    filter<T, P>(t: T, p: P): IsMapType<T> extends true ? toFormula<T> : never
}

export type Bundle = Array<Statement>


export type RawFormula = {
    op: string
    args: number[]
} | {value: any}


export interface StoreSpec {
    roots: {
        [key in 'inbox' | 'outbox' | 'idle' | 'staging']: number
    }

    slots: RawFormula[]
    tables?: NativeType[]
    debugInfo?: any[]
}