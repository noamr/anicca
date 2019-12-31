main -> (statements)                           {% ([s]) => JSON.parse(JSON.stringify(s)) %}

@include "./formula.ne"
constValue -> 
    primitive {% ([$primitive]) => ({$primitive}) %}
    | qvar {% ([t]) => ({$ref: t.value, $token: extractToken(t)}) %}

newlines -> %eol {% NOOP %}
    | %eol newlines {% NOOP %}

maybeNewlines -> newlines {% NOOP %} 
    | null {% NOOP %}

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
    slotStatement {% id %}
    | mainStatement  {% id %}     
    | busStatement {% id %}                  
    | constStatement {% id %}                     
    | letStatement {% id %}                
    | macroStatement {% id %}
    | importStatement {% id %}                     
    | viewStatement {% id %}    
    | controllerStatement {% id %}                  

viewStatement -> Statement["view", viewRules] {% Statement('View', 'rules') %}
busStatement -> DeclareKeyword["bus"] %varname _ newlines {% ([token, name]) => ({"type": "Bus", "name": name.value, $token: extractToken(token)}) %}
slotStatement -> Statement["slot", formula] {% Statement('Slot', 'formula') %}
importStatement -> DeclareKeyword["import"] _ stringLiteral Conjunction["as"] %varname WS {% ([token,, path,, name]) => ({type: "Import", path: eval(path), name: name.value, $token: extractToken(token)}) %}

macroStatement -> DeclareKeyword["macro"] %varname _ "(" _ macroArgs _ ")" IndentChildren[formula]
    {% ([,t,,,,args,,,formula]) => ({$macro: {args, formula}, $token: extractToken(t)}) %}

macroArgs ->
    null {% () => [] %}
    | %varname {% ([{value}]) => [value] %}
    | %varname _ "," _ macroArgs {% ([one,,,, additionalArgs]) => ([one.value, ...additionalArgs]) %}

selectorValue ->
    %varname {%id%}
    | stringLiteral {%id%}
    | number {%id%}

selectorAttribComp ->
    "=" {% id %}
    | "~=" {% id %}
    | "*=" {% id %}
    | "$=" {% id %}
    | "^=" {% id %}

selectorAttribs ->
    _ "[" _ %varname _ selectorAttribComp _ selectorValue _ "]" {% (a) => a.join('') %}
    | _ "[" _ %varname _ "]" {% (a) => a.join('') %}

selectorKey ->
    "*" {%id%}
    | %varname {% id %}
    | %selector {% id%}

selector ->
    selectorKey {% id %}
    | selectorKey selectorAttribs {% ([key, attribs]) => ({...key, value: key.value + attribs}) %}



viewRules -> ChildrenOfType[viewRule, viewRules] {% id %}
viewRule -> selector IndentChildren[viewDeclarations]
    {% ([selector, declarations]) => ({type: 'ViewRule', declarations, selector: selector.value, $token: extractToken(selector)})  %}

viewDeclarations -> ChildrenOfType[viewDeclaration, viewDeclarations] {% id %}

viewDeclaration ->
    viewBindDeclaration {% id %}
    | viewEventDeclaration {% id %}

viewBindDeclaration ->
    DeclareKeyword["bind"] viewBindTarget to formula
        {% ([token, target, , src]) => ({...token, type: "Bind", target, src}) %}

viewBindTarget ->
    "html" {% ([t]) => ({type: 'html', $token: extractToken(t)}) %}

viewEventDeclaration ->
    DeclareKeyword["on"] %varname IndentChildren[viewEventActions]
        {% ([token, eventType, actions]) => ({type: "DOMEvent", $token: extractToken(token), eventType: eventType.value, actions}) %}

viewEventActions -> ChildrenOfType[viewEventAction, viewEventActions] {% id %}

viewEventAction ->
    viewEventDispatchAction {% id %}
    | preventDefault {% id %}

to -> Conjunction["to"] {% NOOP %}

controllerStatement -> Statement["controller", statechart] {% Statement("Controller", "statechart") %}

statechart -> branchState {% ([root]) => ({root}) %}
maybeStateName ->
    %varname {% ([name]) => ({name: name.value, $token: extractToken(name)}) %}
    | null {% NOOP %}

exclusiveStateHeader ->
    DeclareKeyword["state"] %varname {% ([t, name]) => ({$token: extractToken(t), name: name.value}) %}
    | %varname {% ([name]) => ({$token: extractToken(name), name: name.value}) %}

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
    transitionHeaders IndentChildren[transitionActions] {% ([header, actions]) => 
        ({type: 'Transition', ...header.reduce((a, o) => Object.assign(a, o), {}), actions}) %}

transitionHeaders -> ChildrenOfType[transitionHeader, transitionHeaders] {% id %}
transitionHeader ->
    transitionCondition {% id %}
    | transitionTrigger {% id %}
    | transitionTarget {% id %}

transitionTarget ->
    DeclareKeyword["goto"] qvar {% ([$token, event]) => ({event: {$ref: event.value}, $token}) %}

transitionCondition ->
    DeclareKeyword["when"] formula {% ([$token, condition]) => ({$token, condition}) %}

transitionTrigger ->
    DeclareKeyword["on"] qvar {% ([$token, event]) => ({event: {$ref: event.value}, $token}) %}

transitionActions -> ChildrenOfType[transitionAction, transitionActions] {% id %}
transitionAction ->
    incrementAction {% id %}
    | assignAction {% id %}
    | decrementAction {% id %}
    | multAction {% id %}
    | divAction {% id %}

Operand[O] => _ $O _ {% ([, [op]]) => op %}

@{%
    const relAction = op => ([target,,,, src]) => 
        ({type: "Assign", target: {$ref: target.value}, src: {op, $token: extractToken(target), args: [
            {$ref: target.value, $token: extractToken(target)}, src
        ]}})
%}

incrementAction ->
    qvar _ "+=" _ formula {% relAction('add') %}

decrementAction ->
    qvar _ "-=" _ formula {% relAction('add') %}

multAction ->
    qvar _ "*=" _ formula {% relAction('div') %}

divAction ->
    qvar _ "/=" _ formula {% relAction('div') %}

assignAction ->
    qvar _ "=" _ formula {% ([target,, op,, src]) => 
        ({type: "Assign", target: {$ref: target.value}, src}) %}

viewEventDispatchAction ->
    DeclareKeyword["dispatch"] qvar to qvar
        {% ([token, event, , bus]) => ({$token: extractToken(token), event: event.value, bus: bus.value, type: 'Dispatch'}) %}

preventDefault ->
    "prevent" " " "default" {% t => ({type: "PreventDefault", $token: extractToken(t)}) %}

formula -> rawFormula {% id %}

VarDeclaration[Type] ->
    DeclareKeyword[$Type] %varname Conjunction["="] constValue WS {% ([type, name,, value]) => 
        ({name: name.value, value, $token: extractToken(type)})%} 

constStatement -> VarDeclaration["const"] {% ([v]) => ({...v, type: 'Const'}) %}
letStatement -> VarDeclaration["let"] {% ([v]) => ({...v, type: 'Let'}) %}

mainStatement -> 
    "main" _ mainChildren WS
        {% ([token,, declarations]) => ({$token: extractToken(token), type: 'Main', declarations}) %}
mainChildren -> ChildrenOfType[useDeclaration, mainChildren] {% id %}

useDeclaration ->
    DeclareKeyword["use"] qvar {% ([token, name]) => ({type: "Use", ref: name.value, ...token}) %}

