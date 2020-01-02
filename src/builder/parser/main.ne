@include "./formula.ne"

MainDeclaration ->
    "use" __ %varname {% ([,,name]) => ({type: 'Use', name: name.value}) %}
