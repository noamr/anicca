@include "./formula.ne"

RootTypeDeclaration ->
    RootType __ ref {% ([[{value}],,ref]) => ({type: value, name: ref.$ref}) %}

RootType ->
    "Controller" 
    | "View" 
    | "Let" 
    | "Table" 
    | "Slot"
    | "Bus"
    | "Import"

