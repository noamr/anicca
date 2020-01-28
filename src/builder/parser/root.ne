@include "./formula.ne"

RootTypeDeclaration ->
    RootType __ ref {% ([[{value}],,ref]) => ({type: value[0].toUpperCase() + value.substr(1), name: ref.$ref}) %}
    | _ ref _ {% ([,{$ref}]) => ({type: 'Slot', name: $ref})  %}

RootType ->
    "controller" 
    | "view" 
    | "let" 
    | "table" 
    | "slot"
    | "bus"
    | "database"
    | "router"
    | "enum"
    | "import"

