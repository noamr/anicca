@include "./formula.ne"

controllerAction ->
    goto {% id %}
    | dispatch {% id %}
    | assign {% id %}


formula -> formulaWithoutTokens {% id %}

goto ->
    "goto" __ V {% ([,,target]) => ({type: 'Goto', target: target.value}) %}    

dispatchExternal ->
    "dispatch" __ V payload __ "to" __ V {% ([,, event, payload,,,, target]) => 
        ({type: 'Dispatch', event: event.value, target: target.value, payload}) %}

maybeComma -> 
    "," {% NOOP %}
    | null {% NOOP %}

payloadArg ->
    _ formula _ maybeComma _ {% ([,arg]) => arg %}

args -> 
    payloadArg:* {% id %}

payload ->
    _ "(" _ args _ ")" {% ([,,,args]) => args %}
    | null {% () => null %}

dispatch ->
    dispatchExternal {% id %}
    | "dispatch" __ V payload {% ([,,event,payload]) => ({type: 'Dispatch', event: event.value, payload}) %}

@{%
    const relAction = op => ([target,,,,src]) => 
        ({type: "Assign", target, source: {op, args: [target, src]}})
%}

target ->
    %varname {% ([{value}]) => ({$ref: value}) %}
    | formula {% id %}

incrementAction ->
    target _ "+=" _ formula {% relAction('plus') %}

deleteAction ->
    "delete" __ target __ "from" __ target {% ([,,key,,,,target]) => ({type: 'Assign', target: {op: 'get', args: [target, key]}, source: {op: 'delete'}}) %}

decrementAction ->
    target _ "-=" _ formula {% relAction('minus') %}

multAction ->
    target _ "*=" _ formula {% relAction('mult') %}

divAction ->
    target _ "/=" _ formula {% relAction('div') %}

assignAction ->
    target _ "=" _ formula {% ([target,,,, source]) => 
        ({type: "Assign", target, source}) %}

assign ->
    incrementAction {% id %}
    | assignAction {% id %}
    | decrementAction {% id %}
    | multAction {% id %}
    | divAction {% id %}
    | deleteAction {% id %}
