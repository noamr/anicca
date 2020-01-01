@include "./formula.ne"

RootTypeDeclaration ->
    RootType __ %varname {% ([[{value}],,name]) => ({type: value, name: name.value}) %}
    | "Main" {% () => ({type: "Main"}) %}

RootType ->
    "Controller" 
    | "View" 
    | "Let" 
    | "Slot"
    | "Bus"
    | "Import"

