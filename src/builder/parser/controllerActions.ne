@include "./formula.ne"

controllerAction ->
    goto {% id %}
    | dispatch {% id %}
    | assign {% id %}


formula -> formulaWithoutTokens {% id %}

goto ->
    "goto" __ V {% ([,,target]) => ({type: 'Goto', target: target.value}) %}    

dispatchExternal ->
    "dispatch" __ V __ "to" __ V {% ([,,event,,,,target]) => ({type: 'Dispatch', event: event.value, target: target.value}) %}

dispatch ->
    dispatchExternal {% id %}
    | "dispatch" __ V {% ([,,event]) => ({type: 'Dispatch', event: event.value}) %}

@{%
    const relAction = op => ([target,,,,src]) => 
        ({type: "Assign", target: {$ref: target.value}, source: {op, args: [{$ref: target.value}, src]}})
%}

incrementAction ->
    %varname _ "+=" _ formula {% relAction('plus') %}

decrementAction ->
    %varname _ "-=" _ formula {% relAction('minus') %}

multAction ->
    %varname _ "*=" _ formula {% relAction('mult') %}

divAction ->
    %varname _ "/=" _ formula {% relAction('div') %}

assignAction ->
    %varname _ "=" _ formula {% ([target,,,, source]) => 
        ({type: "Assign", target: {$ref: target.value}, source}) %}

assign ->
    incrementAction {% id %}
    | assignAction {% id %}
    | decrementAction {% id %}
    | multAction {% id %}
    | divAction {% id %}
