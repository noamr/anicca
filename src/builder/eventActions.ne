@include "./controllerActions.ne"

eventActions ->
    dispatchExternal {% id %}
    | runScript {% id %}
    | assign {% id %}

runScript ->
    "run" __ "script" {% () => ({type: "RunScript"}) %}