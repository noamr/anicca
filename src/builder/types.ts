export type Primitive = string | number | boolean | null

export type StatementType = 'Const' | 'View' | 'Main' | 'Let' | 'Controller' | 'Slot' | 'Bus' | 'Table'

export interface WithToken {
    $token?: {
        line: number
        col: number,
    }

}
export interface Statement extends WithToken {
    name?: string
    type: StatementType
}

export type PostProcessor = (bundle: Bundle) => Bundle

export interface ConstStatement extends Statement {
    type: 'Const'
    value: Primitive
}

export interface SlotStatement extends Statement {
    type: 'Slot'
    formula: Formula
}
export interface LetStatement extends Statement {
    type: 'Let'
    valueType: Primitive
}

type SingularType = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'i8' | 'i16' | 'i32' | 'i64' | 'i128' | 'f32' | 'f64' | 'string' | 'bool' | 'ByteArray'
export type NativeType = SingularType | NativeTupleType | NativeDictionaryType
interface NativeTupleType {
    tuple: NativeType[]
}
interface NativeDictionaryType {
    dictionary: [NativeType, NativeType]
}

export interface TableStatement extends Statement {
    type: 'Table'
    valueType: NativeType
}

export interface ViewDeclaration extends WithToken {
    type: 'Bind' | 'DOMEvent'
}

export interface BindTarget extends WithToken  {
    type: 'html' | 'attribute' | 'style'
}

export type Formula = WithToken
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

export interface BindDeclaration extends ViewDeclaration {
    type: 'Bind'
    src: Formula
    target?: string
    targetType: 'content' | 'attribute' | 'data' | 'style'
}

export interface DOMEventDeclaration extends ViewDeclaration {
    type: 'DOMEvent'
    eventType: string
    actions: DOMEventAction[]
}

export interface DOMEventAction extends WithToken {
    type: 'PreventDefault' | 'Dispatch' | 'StopPropagation'
}

export interface DispatchAction extends DOMEventAction {
    type: 'Dispatch'
    target: string
    event: string
    payload?: any

}
export interface GotoAction extends TransitionAction {
    type: 'Goto'
    target: string
}

export interface ViewRule extends WithToken  {
    type: 'ViewRule'
    selector: string
    declarations: ViewDeclaration[]
}

export interface AppDeclaration extends WithToken  {
    type: 'Use'
    ref: string
}

export interface MainStatement extends Statement {
    type: 'Main'
    declarations: AppDeclaration[]
}

export interface ControllerStatement extends Statement {
    type: 'Controller'
    name: string
    rootState: State
}

export interface Statechart {
    root: State
}

export interface ViewStatement extends Statement {
    type: 'View'
    name: 'string'
    rules: ViewRule[]
}

export interface Transition extends WithToken {
    type: 'Transition'
    event?: string
    condition?: Formula
    actions?: TransitionAction[]
}

export interface TransitionAction {
    type: 'Assign' | 'Dispatch' | 'Goto'
}
export interface AssignTransitionAction {
    type: 'Assign'
    source: Formula
    method?: 'post' | 'put' | 'delete'
    target: Formula
}

export interface State {
    type: 'State' | 'Parallel' | 'Final' | 'History' | 'Initial'
    name: string
    deep?: boolean
    defaultTargets?: string[]
    defaultActions?: TransitionAction[]
    onEntry?: TransitionAction[]
    onExit?: TransitionAction[]
    children: Array<State|Transition>
}

interface NT<Name> {$T: Name}

type ArgumentTypes<F> = F extends (...args: Array<infer A>) => any ? A : never
type ReturnType<F> = F extends (...args: Array<infer A>) => infer R ? R : never

export interface TypedFormula<T> extends Formula {
    $T: T
}

export interface TypedPrimitive<T> extends TypedFormula<T> {
    $primitive: T
}

export interface TypedRef<T> extends TypedFormula<T> {
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
    encode(s: string[]): ArrayBuffer
    noop(): null
    table(n: number): any
}

export type Configuration = Set<State>
export type HistoryConfiguration = Map<State, Configuration>

export interface Modus {
    configuration: Configuration
    history: HistoryConfiguration
}

export interface FlatStatechart {
    junctures: Map<Juncture<string>|null, Array<StepResults<string>>>
    events: string[]
    debugInfo?: {}
}

export interface StepResults<M = Modus> {
    condition: Formula
    execution: TransitionAction[]
    modus: M
}

export interface Juncture<M = Modus> {
    event: string | null
    modus: M
}

export type RootType = 'inbox' | 'outbox' | 'idle' | 'staging'
export interface TransformData {
    tables: {[name: string]: number}
    roots: {[name in RootType]?: Formula}
    refs: {[name: string]: Formula}
    outputNames: {[name: string]: number}
    outputs: {[name: string]: TypedFormula<ArrayBuffer>}
    getEventHeader: (event: string, target: string) => number
    debugInfo: any
    views: {
        bindings: Array<{
            view: string
            selector: string
            target?: string
            type: 'attribute' | 'content' | 'data' | 'style',
        }>
        events: Array<{
            view: string
            selector: string
            eventType: string
            preventDefault: boolean
            stopPropagation: boolean
            headers: number[],
        }>,
    }
}

export function tuple<A, B>(a: A, b: B) {
    return [a, b] as [A, B]
}

type IsTuple<T> = T extends any[] ? number extends T['length'] ? false : true : false
export type toArgType<T> = T | ResolveType<T> | toFormula<T>
export type toFormula<T> =
    T extends TypedFormula<infer R> ? T :
    T extends Array<TypedFormula<infer R>> ? TypedFormula<R[]> :
    T extends {$T: infer R} ? TypedFormula<R> :
    TypedFormula<T>
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
type ResolveType<P> = P extends {$T: infer T} ? T : P
type IsMapType<T> = ResolveType<T> extends Map<any, any> ? true : never
type Pair<A, B> = [A, B]

export type AssignmentDirective<K = any, V = any> = [number, ResolveType<K>, ResolveType<V>]

export type FormulaBuilder = {
    [k in keyof SimpleFunctions]: (...args: Array<toArgType<ArgumentTypes<SimpleFunctions[k]>>>) =>
        toFormula<ReturnType<SimpleFunctions[k]>>
} & {
    get<M, K>(s: M, k: K): toFormula<ValueType<M, K>>
    first<P>(s: P): ResolveType<P> extends ResolveType<[infer A, any]> ? toFormula<A> : never
    last<P>(s: P): ResolveType<P> extends ResolveType<[any, infer B]> ? toFormula<B> : never
    flatMap<M, P>(input: M, predicate: P):
        IsMapType<M> extends true ? toFormula<P> extends toFormula<Array<[infer K2, infer V2]>> ? toFormula<Map<K2, V2>>
        : never : never
    map<M, P>(input: M, predicate: P):
        IsMapType<M> extends true ? toFormula<P> extends toFormula<infer V2> ? toFormula<Map<KeyType<M>, V2>>
        : never : never
    flatReduce<M, P, V>(map: M, predicate: P, initialValue: V):
        IsMapType<M> extends true ?
            ResolveType<P> extends [boolean, ResolveType<V>] ? toFormula<V>
            : never : never
    head<M>(a: M): toFormula<KeyType<M>>
    tail<M>(a: M): toFormula<KeyType<M>>
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
    aggregate<T = any>(): toFormula<T>
    size<T>(m: T): toFormula<number>
    isnil<A>(a: A): toFormula<A extends null ? true : boolean>
    cond<Condition, Consequent, Alternate>(c: Condition, t: Consequent, a: Alternate):
        toFormula<Consequent | Alternate>
    put<T, K, V>(table: T, key: K, value: V): toFormula<AssignmentDirective<K, V>>
    delete<T, K>(table: T, key: K): toFormula<AssignmentDirective<ResolveType<K>, any>>
    replace(): toFormula<AssignmentDirective>
    merge(): toFormula<AssignmentDirective>
    filter<T, P>(t: T, p: P): IsMapType<T> extends true ? toFormula<T> : never
    some<T, P>(t: T, p: P): IsMapType<T> extends true ? toFormula<boolean> : never
    every<T, P>(t: T, p: P): IsMapType<T> extends true ? toFormula<boolean> : never
    diff<T>(a: T, b: T): IsMapType<T> extends true ? toFormula<T> : never,
}

export type Bundle = Statement[]

export interface RawFormula {
    op?: string
    args?: number[]
    value?: any
}

export interface StoreSpec {
    roots: {[key in RootType]: number}
    outputNames: {[name: string]: number}
    slots: RawFormula[]
    tableTypes: {[x: number]: NativeType}
    debugInfo?: any[]
}
