@include "./formula.ne"

viewRule ->
    eventRule {% id %}
    | contentRule {% id %}
    | attributeRule {% id %}
    | dataRule {% id %}
    | cssRule {% id %}
    | classRule {% id %}
    | cloneRule {% id %}
    
eventCondition ->
    __ "when" __ rawFormula {% ([,,, v]) => v %}
    | null {% () => null %}

eventRule ->
    "on" __ %varname eventCondition {% ([,,event,condition]) => ({type: 'DomEvent', eventType: event.value, condition}) %}

contentRule ->
    "content" {% () => ({type: 'BindContent'}) %}

iterator ->
    _ "[" _ %varname _ "," _ %varname _ "]" _ {% ([,,,key,,,,value]) => ([key.value, value.value]) %}

cloneRule ->
    "for" __ iterator __ "in" __ rawFormula {% ([,,iterator,,,,mapSource]) => ({type: 'Clone', mapSource, iterator}) %}

attributeRule ->
    "attribute" __ attribute {% ([,,attribute]) => ({type: 'BindAttribute', attribute}) %}

classRule ->
    "class" {% () => ({type: 'BindAttribute', attribute: 'class'}) %}

dataRule ->
    "data" __ attribute {% ([,,attribute]) => ({type: 'BindData', attribute}) %}

attribute ->
    %varname {% ([v]) => v.value %}
    | attribute "-" attribute {% args => args.join('')  %}
    | "-" attribute {% args => args.join('')  %}

cssRule ->
    "style" __ attribute {% ([,,style]) => ({type: 'BindStyle', style}) %}
