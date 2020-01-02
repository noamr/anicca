@include "./formula.ne"

conrtollerAtom ->
  state {% id %}
  | transition {% id %}
  | onEntry {% id %}
  | onExit {% id %}


historyHeader ->
   "history" {%  () => true %}
   | "shallow" __ "history" {% () => false %}
   | "deep" __ "history" {% () => true %}

state ->
    "state" __ %varname {% ([,,name]) => ({type: 'State', name: name.value}) %}
    | "parallel" __ %varname {% ([,,name]) => ({type: 'Parallel', name: name.value}) %}
    | "final" __ %varname {% ([,,name]) => ({type: 'Final', name: name.value}) %}
    | "initial" {% () => ({type: 'Initial'}) %}
    | historyHeader __ %varname {% ([deep,,name]) => ({deep, type: 'History', name: name.value}) %}

trigger ->
    "on" __ %varname {% ([,,event]) => ({event: event.value}) %}

condition ->
    "when" __ formulaWithoutTokens {% ([,,condition]) => ({condition}) %}

always ->
    "always" {% () => ({}) %}

transitionHeader ->
    trigger {% id %}
    | condition {% id %}
    | always {% id %}
    | trigger __ condition {% ([t,,c]) => ({...t, ...c}) %}

transition ->
    transitionHeader {% ([transition]) => ({type: 'Transition', ...transition}) %}

onEntry ->
    "entering" {% () => ({type: 'OnEntry'}) %}

onExit ->
    "leaving" {% () => ({type: 'OnExit'}) %}
