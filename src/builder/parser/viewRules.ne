@include "./formula.ne"

viewRule ->
    eventRule {% id %}
    | contentRule {% id %}
    | attributeRule {% id %}
    | dataRule {% id %}
    | cssRule {% id %}
    
eventRule ->
    "on" __ %varname {% ([,,event]) => ({type: 'DomEvent', eventType: event.value}) %}

contentRule ->
    "content" {% () => ({type: 'BindContent'}) %}

attributeRule ->
    "attribute" __ attribute {% ([,,attribute]) => ({type: 'BindAttribute', attribute}) %}

dataRule ->
    "data" __ attribute {% ([,,attribute]) => ({type: 'BindData', attribute}) %}

attribute ->
    %varname {% ([v]) => v.value %}
    | attribute "-" attribute {% args => args.join('')  %}
    | "-" attribute {% args => args.join('')  %}

cssRule ->
    "style" __ attribute {% ([,,style]) => ({type: 'BindStyle', style}) %}
