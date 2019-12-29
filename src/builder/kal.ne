main -> (statements)                           {% id %}

@include "./formula.ne"
constValue -> primitive {% id %}

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
    %varname Operand["+="] rawFormula {% ([target, op, src]) => 
        ({type: "Assign", target: target.value, src: {op: "plus", ...extractToken(target), args: [
            {$ref: target.value, ...extractToken(target)}, src
        ]}}) %}

viewEventDispatchAction ->
    DeclareKeyword["dispatch"] %varname to %varname
        {% ([token, event, , bus]) => ({...token, event: event.value, bus: bus.value, type: 'Dispatch'}) %}

preventDefault ->
    "prevent default" {% t => ({type: "PreventDefault", ...extractToken(t)}) %}

formula -> rawFormula {% id %}

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
