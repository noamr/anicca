@{%
const moo = require("moo");
const IndentifyLexer = require("@shieldsbetter/nearley-indentify")

const indentAwareLexer = new IndentifyLexer(moo.compile({
  keywords: [
      'const', 'let', 'table',
      'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64', 'bool',
      'view', 'formula', 'app', 'controller',
      'use', 'bind', 'export',
      'html', 'attribute', 'style',
      'prevent default', 'dispatch',
      'of', 'to', 'on'],
  ws:     /[ \t]+/,
  int: /-?[0-9]+/,
  float: /-?[0-9]*.[0-9]/,
  varname: /[A-Za-z$_][A-Za-z$_0-9]*/,
  assign: /[+\-*/|&]?\=/,
  arithmetic: /[=+*/?|^]/,
  selector: /[#*]?[A-Za-z$_][A-Za-z$_0-9]*\[?\]?(?:[~*$^]?\=[^\n])?/,
  singleQuoteStringLiteral:  {match: /'(?:\\['\\]|[^\n'\\])*'/, value: s => s.slice(1, -1)}, 
  doubleQuoteStringLiteral:  {match: /"(?:\\["\\]|[^\n"\\])*"/, value: s => s.slice(1, -1)}, 
  newline: { match: /[\n]/, lineBreaks: true }
}))

const extractToken = t => (t instanceof Array ? extractToken(t[0]) : {$token: {col: t.col, line: t.line}})
const NOOP = () => {}
%}

@lexer indentAwareLexer
main -> (statements)                           {% id %}

stringLiteral -> 
    %singleQuoteStringLiteral {% ([{value}]) => value %}
    | %doubleQuoteStringLiteral {% ([{value}]) => value %}

newlines -> %eol {% NOOP %}
    | %eol newlines {% NOOP %}

maybeNewlines -> newlines {% NOOP %} 
    | null {% NOOP %}

type -> "string" {%id %}
        | "i32" {%id %}
        | "f32" {%id %}
number -> %float | %int {%id %}
boolean -> "true" | "false" {%id %}
nil -> "null" {%id %}
primitive -> 
    number {%id %}
    | stringLiteral {%id %}
    | boolean {%id %}
    | nil {%id %}
constValue -> primitive {% ([a]) => a[0] %}

 
# Whitespace
_ -> null | _ [\s] {% NOOP %}
__ -> [\s] | __ [\s] {% NOOP %}


beforeChildren -> _ newlines %indent {% NOOP %}
afterChildren -> maybeNewlines %dedent {% NOOP %}
IndentChildren[X] -> beforeChildren $X afterChildren {% ([,[children]]) => children %}

DeclareKeyword[Keyword] -> $Keyword __ {% extractToken %}
Conjunction[Keyword] -> __ $Keyword __ {% NOOP %}

Statement[Keyword, Children] ->
    DeclareKeyword[$Keyword] %varname IndentChildren[$Children] 
        {% ([token, name, [children]]) => ({...token, name: name.value, children}) %}

@{% function Statement(type, childrenKey) 
    { return ([{$token, name, children}]) => ({$token, type, name, [childrenKey]: children}) } %}

betweenChildren -> _ maybeNewlines _
ChildrenOfType[X, XX] ->
    $X {% id %}
| $X betweenChildren $XX {% ([[one], , [additional]]) => ([one, ...additional]) %}


statements -> ChildrenOfType[anyStatement, statements] {% id %}

anyStatement -> 
    exportStatement {% id %}                     
    | appStatement  {% id %}                       
    | constStatement {% id %}                     
    | letStatement {% id %}                     
    | viewStatement {% id %}    
    | controllerStatement {% id %}                  

exportStatement -> DeclareKeyword["export"] %varname _ newlines {% ([token, name]) => ({"type": "Export", "ref": name.value, ...token}) %}
viewStatement -> Statement["view", viewRules] {% Statement('View', 'rules') %}

viewRules -> ChildrenOfType[viewRule, viewRules] {% id %}
viewRule -> %selector IndentChildren[viewDeclarations]
    {% ([selector, declarations]) => ({type: 'ViewRule', declarations, selector: selector.value, ...extractToken(selector)})  %}

viewDeclarations -> ChildrenOfType[viewDeclaration, viewDeclarations] {% id %}

viewDeclaration ->
    viewBindDeclaration {% id %}
    | viewEventDeclaration {% id %}

viewBindDeclaration ->
    DeclareKeyword["bind"] viewBindTarget to formula
        {% ([token, target, , src]) => ({...token, type: "Bind", target, src}) %}

viewBindTarget ->
    "html" {% ([t]) => ({type: 'html', ...extractToken(t)}) %}

viewEventDeclaration ->
    DeclareKeyword["on"] %varname IndentChildren[viewEventActions]
        {% ([token, eventType, actions]) => ({type: "DOMEvent", ...token, eventType: eventType.value, actions}) %}

viewEventActions -> ChildrenOfType[viewEventAction, viewEventActions] {% id %}

viewEventAction ->
    viewEventDispatchAction {% id %}
    | preventDefault {% id %}

to -> Conjunction["to"] {% NOOP %}

controllerStatement -> Statement["controller", statechart] {% Statement("Controller", "statechart") %}

statechart -> branchState {% ([root]) => ({root}) %}
maybeStateName ->
    %varname {% ([name]) => ({name: name.value, ...extractToken(name)}) %}
    | null {% NOOP %}

exclusiveStateHeader ->
    DeclareKeyword["state"] %varname {% ([t, name]) => ({...extractToken(t), name: name.value}) %}
    | %varname {% ([name]) => ({...extractToken(name), name: name.value}) %}

exclusiveState -> exclusiveStateHeader IndentChildren[stateChildren] {% ([header, children]) => ({type: 'State', ...header, children}) %}
branchState -> exclusiveState {% id %}
state -> branchState {% id %}
stateChild ->
    state {% id %}
    | transition {% id %}

stateChildren -> ChildrenOfType[stateChild, stateChildren] {% id %}

transition ->
    conditionalTransition {% id %}

conditionalTransition ->
    transitionConditions IndentChildren[transitionActions] {% ([header, actions]) => ({type: 'Transition', ...header, actions}) %}

transitionConditions -> 
    transitionTrigger {% id %}

transitionTrigger ->
    DeclareKeyword["on"] %varname {% ([token, event]) => ({...token, event: event.value, ...extractToken(event)}) %}

transitionActions -> ChildrenOfType[transitionAction, transitionActions] {% id %}
transitionAction ->
    incrementAction {% id %}

Operand[O] => _ $O _ {% ([, [op]]) => op %}
incrementAction ->
    %varname Operand["+="] formula {% ([target, op, src]) => ({operand: op.value, target: target.value, src}) %}

viewEventDispatchAction ->
    DeclareKeyword["dispatch"] %varname to %varname
        {% ([token, event, , controller]) => ({...token, event: event.value, controller: controller.value, type: 'Dispatch'}) %}

preventDefault ->
    "prevent default" {% t => ({type: "PreventDefault", ...extractToken(t)}) %}

formula ->
    %varname {% ([ref]) => ({type: "Formula", ref: ref.value}) %}
    | primitive {% ([v]) => ({type: "Primitive", value: v.value}) %}

VarDeclaration[Type] ->
    DeclareKeyword[$Type] %varname _ maybeAs _ "=" _ constValue newlines {% ([token, name, s2, type, s3, e, s4, value]) => 
        ({name: name.value, value, ...token})%} 

constStatement -> VarDeclaration["const"] {% ([v]) => ({...v, type: 'Const'}) %}
letStatement -> VarDeclaration["let"] {% ([v]) => ({...v, type: 'Let'}) %}
appStatement -> Statement["app", appDeclarations] {% Statement("App", "declarations") %}
appDeclarations -> ChildrenOfType[useDeclaration, appDeclarations] {% id %}

useDeclaration ->
    DeclareKeyword["use"] %varname {% ([token, name]) => ({type: "Use", ref: name.value, ...token}) %}

maybeAs -> asExpression | null
asExpression -> "as" __ type
