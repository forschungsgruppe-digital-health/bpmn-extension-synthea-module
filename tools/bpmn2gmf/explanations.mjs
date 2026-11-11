// Plain-language explanations for the converter's notes and warnings, shown next
// to the messages in the demo and on the converter result page. Errors are not
// listed: their message already says what is wrong and what to change.
//
// { what: what the converter found or did, why: what it means for the module, fix: what to do in the model }

export const EXPLANATIONS = {
  STATE_NAME_DUPLICATE: {
    what: 'Two BPMN elements have the same name. Synthea needs a unique name for every state, so the converter renamed the later ones by appending the element id.',
    why: 'The module works, but its state names no longer match the diagram, and identical names often hide a copy-and-paste mistake.',
    fix: 'Give every element its own name in the diagram, so nothing has to be renamed. The lint rule unique-element-names (SYN-34) reports this before the conversion.'
  },
  TRANSITION_NO_FALLBACK: {
    what: 'A gateway tests conditions, but no branch covers the case that none of them is true.',
    why: 'In that case Synthea moves to its default Terminal state, so the patient\'s pathway ends without anyone having decided that.',
    fix: 'Add a default flow (the "else" branch) to the gateway and remove its condition. The lint rule exclusive-gateway-requires-default-flow (SYN-35) reports this before the conversion.'
  },
  DISTRIBUTION_REMAINDER: {
    what: 'The branch probabilities come from attributes, so their sum is only known when Synthea runs, and the last branch has a probability of its own.',
    why: 'Synthea gives the last branch whatever the others leave over, so its own value is never used. If it was meant as a real setting, it has no effect.',
    fix: 'Leave the probability off the last branch, so it is the remainder by design, or check that the other branches already add up to its complement.'
  },
  DISTRIBUTION_SUM: {
    what: 'The probabilities of a gateway do not add up to 1.0.',
    why: 'The patients are not distributed over the branches as drawn.',
    fix: 'Correct the probabilities so that they sum to 1.0.'
  },
  STATE_UNREACHABLE: {
    what: 'No path leads from the Initial state to this state.',
    why: 'No patient will ever reach it, so it has no effect on the generated population.',
    fix: 'Connect it to the pathway, or remove it from the diagram.'
  },
  TERMINAL_SYNTHESIZED: {
    what: 'A Death state has no outgoing flow, but Synthea expects it to continue to a Terminal state.',
    why: 'The converter reused the existing Terminal state or added one, so the module is valid.',
    fix: 'Nothing is required. Draw the Terminal state yourself if you want it visible in the diagram.'
  },
  GATEWAYS_FUSED: {
    what: 'States that only existed for gateways were merged into their neighbours (option "fuse gateways").',
    why: 'The module is closer to a hand-written one and has fewer states. The behaviour is the same.',
    fix: 'Nothing is required.'
  },
  COMPLEX_TRANSITION: {
    what: 'A probability gateway directly behind a conditional state was folded into that state as a complex_transition.',
    why: 'Synthea can express "condition, then probability" in a single state. The behaviour is the same.',
    fix: 'Nothing is required.'
  },
  PARALLEL_LINEARIZED: {
    what: 'The branches of a parallel (AND) gateway run one after the other, because Synthea has no parallel execution.',
    why: 'The order shown in the message is the order in which the branches happen for every patient.',
    fix: 'Check that this order is acceptable. If not, change the order of the flows or split the branches into separate submodules.'
  },
  INCLUSIVE_CHAINED: {
    what: 'The branches of an inclusive (OR) gateway are decided one after the other, each on its own.',
    why: 'Any combination of branches can happen, as an inclusive gateway allows.',
    fix: 'Nothing is required unless only some combinations should be possible.'
  },
  LINK_RESOLVED: {
    what: 'A link throw event was replaced by a direct flow to the element behind its matching link catch event.',
    why: 'Synthea has no links. The behaviour is the same as drawn.',
    fix: 'Nothing is required.'
  },
  DOCUMENTATION_ONLY: {
    what: 'This element is marked as documentation only, so no state is generated for it.',
    why: 'Its incoming and outgoing flows are joined directly.',
    fix: 'Nothing is required.'
  },
  TRANSITION_FALLBACK_NOT_DEFAULT: {
    what: 'A gateway flow without a condition was used as the fallback branch, although it is not marked as the gateway\'s default flow.',
    why: 'The converter guessed the intended "else" branch. The result is right if the guess is, but the diagram does not say so.',
    fix: 'Mark the flow as the default flow of the gateway in the BPMN modeler.'
  },
  STATE_OUTSIDE_ENCOUNTER: {
    what: 'A state that only works during an encounter (for example a procedure or an observation) is not part of any encounter.',
    why: 'In Synthea such a state has no effect, or fails, when no encounter is active.',
    fix: 'Tag the state with an encounter context, or place it after a state that has one.'
  },
  CODING_IGNORED: {
    what: 'A coding (a code system and code) was added to an element whose state type does not use that code system.',
    why: 'The coding does not appear in the generated module.',
    fix: 'Remove the coding, or use the code system that this state type expects.'
  },
  SUBPROCESS_EXTRACTED: {
    what: 'The elements inside a sub-process became a module of their own, which the state of the sub-process calls (CallSubmodule).',
    why: 'Synthea has no nested sub-processes, only submodules. The behaviour is the same as drawn.',
    fix: 'Nothing is required.'
  },
  MESSAGE_FLOWS_IGNORED: {
    what: 'Message flows between pools are not converted. Each pool becomes a module of its own.',
    why: 'The modules are generated, but they do not hand over to each other.',
    fix: 'To let one pathway hand over to another, call it with a call activity.'
  },
  INITIAL_WITHOUT_WAIT: {
    what: 'A state that takes time or records something can run right after Initial, with no Delay or Guard before it. Simple, SetAttribute and Counter states are passed through. The check applies to modules that no other module calls.',
    why: 'Every patient reaches that state at birth. This is fine for a module that only runs when another one asks for it, or for a disease that starts at birth on purpose.',
    fix: 'Put a Delay (a patient age) or a Guard (a condition) before it, unless starting at birth is intended.'
  },
  ENCOUNTER_REQUIRED: {
    what: 'A clinical state (for example a Procedure, an Observation or a MedicationOrder) can be reached on a path with no open Encounter.',
    why: 'The States wiki says these states must occur during an encounter, and the engine raises an error without one. A few of Synthea\'s own modules do it anyway.',
    fix: 'Put an Encounter before the state on every path to it, or tag the state with an encounter context in the diagram.'
  },
  ENCOUNTER_NOT_ENDED: {
    what: 'An Encounter can still be open when the module reaches Terminal.',
    why: 'The wiki only recommends an EncounterEnd, and a wellness encounter needs none, so this is a note and not a problem by itself.',
    fix: 'Add an EncounterEnd if the visit should be closed before the module ends. The converter adds one where a flow leaves an encounter group.'
  },
  END_START_MISSING: {
    what: 'An end state (for example ConditionEnd or MedicationEnd) names a start state that is not a state of this module.',
    why: 'Synthea cannot find what to end, so the end state has no effect.',
    fix: 'Correct the name of the start state, or end it through an attribute that the start state assigns.'
  },
  END_START_TYPE: {
    what: 'An end state names a state of the wrong type, for example a ConditionEnd that names a Procedure.',
    why: 'Synthea cannot end that kind of state with this end state.',
    fix: 'Name a state of the matching start type (ConditionOnset for ConditionEnd, MedicationOrder for MedicationEnd, and so on).'
  },
  END_BEFORE_START: {
    what: 'An end state cannot be reached from its start state.',
    why: 'On no path does the patient get from the start to the end, so the condition, medication or care plan is never ended.',
    fix: 'Check the order of the flows: the end state has to come after its start state.'
  },
  GUARD_ATTRIBUTE_NEVER_SET: {
    what: 'A Guard waits for an attribute that no module of this run sets.',
    why: 'Synthea itself or another module may set it, and then nothing is wrong. Otherwise the Guard blocks the patient for good.',
    fix: 'Set the attribute with a SetAttribute state, or check that Synthea or the other module provides it.'
  },
  CONFIG_IGNORED: {
    what: 'A configuration was added to an element whose state type does not read it.',
    why: 'The setting has no effect on the generated module.',
    fix: 'Remove the configuration, or change the state type to one that uses it.'
  }
};

export const explain = (code) => EXPLANATIONS[code] ?? null;
