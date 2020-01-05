@include "./formula.ne"

conrtollerAtom ->
  transition {% id %}
  | state {% id %}
  | onEntry {% id %}
  | onExit {% id %}


historyHeader ->
   "history" {%  () => true %}
   | "shallow" __ "history" {% () => false %}
   | "deep" __ "history" {% () => true %}

state ->
    "state" __ V {% ([,,name]) => ({type: 'State', name: name.value}) %}
    | V {% ([name]) => ({type: 'State', name: name.value}) %}
    | "parallel" __ V {% ([,,name]) => ({type: 'Parallel', name: name.value}) %}
    | "final" __ V {% ([,,name]) => ({type: 'Final', name: name.value}) %}
    | "initial" {% () => ({type: 'Initial'}) %}
    | historyHeader __ V {% ([deep,,name]) => ({deep, type: 'History', name: name.value}) %}

trigger ->
    "on" __ V {% ([,,event]) => ({event: event.value}) %}

condition ->
    "when" __ formulaWithoutTokens {% ([,,condition]) => ({condition}) %}

transitionHeader ->
    trigger {% id %}
    | condition {% id %}
    | trigger __ condition {% ([t,,c]) => ({...t, ...c}) %}

transition ->
    transitionHeader {% ([transition]) => ({type: 'Transition', ...transition}) %}

onEntry ->
    "entering" {% () => ({type: 'OnEntry'}) %}

onExit ->
    "leaving" {% () => ({type: 'OnExit'}) %}

