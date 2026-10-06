// Stage 5: IR node -> GMF state object (without transition).
import { first } from './ir.mjs';
import { conditionToGmf, typedValue, num } from './conditions.mjs';
import { codesForState } from './codes.mjs';

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// ---- helpers shared by the clinical emitters ---------------------------------

const assignTo = (node) => {
  const attribute = first(node.ext, 'synthea:AssignToAttributeConfig')?.attribute;
  return attribute ? { assign_to_attribute: attribute } : {};
};

// codes for the node, in the systems its state type accepts (empty if none)
const codesField = (node, ctx) => {
  const { codes } = ctx.codes();
  return codes.length ? { codes } : {};
};

// For an *End state without an explicit link: the nearest upstream Onset/Order/Start
// state of the matching type on any path ("pairing by flow order", implicit-rules E).
function upstream(node, module, onsetType) {
  const found = new Set();
  const seen = new Set([node.id]);
  const queue = [node];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of current.incoming) {
      const prev = module.nodes.get(edge.from);
      if (!prev || seen.has(prev.id)) continue;
      seen.add(prev.id);
      if (prev.stateType === onsetType) found.add(prev);
      else queue.push(prev);
    }
  }
  return [...found];
}

// Ends the entity an earlier state started. In order of preference: the attribute
// the start state assigned (referencedByAttributeConfig), the code, the single
// matching start state found upstream.
const endState = (onsetType, pairField) => (node, ctx) => {
  const referenced = first(node.ext, 'synthea:ReferencedByAttributeConfig')?.attribute;
  if (referenced) return { referenced_by_attribute: referenced };

  const codes = codesField(node, ctx);
  if (codes.codes) return codes;

  const starts = upstream(node, ctx.module, onsetType);
  if (starts.length === 1) return { [pairField]: starts[0].stateName };

  return ctx.report(
    'END_STATE_UNPAIRED',
    starts.length === 0
      ? `No ${onsetType} state found upstream. Set synthea:referencedByAttributeConfig (matching an assignToAttributeConfig) or give the state a code.`
      : `${starts.length} ${onsetType} states found upstream, so the pairing is ambiguous. Set synthea:referencedByAttributeConfig or give the state a code.`
  );
};

// ---- emitters: (node, ctx) -> fields, or ctx.report(...) for an error ---------

const EMITTERS = {
  Initial: () => ({}),
  Terminal: () => ({}),
  Simple: () => ({}),

  Guard(node, ctx) {
    const allow = first(node.ext, 'synthea:GuardConfig')?.allow;
    if (!allow) return ctx.report('GUARD_ALLOW_MISSING', 'Guard needs synthea:guardConfig with an allow condition.');
    const condition = conditionToGmf(allow, (m) => ctx.report('CONDITION_INVALID', m));
    return condition ? { allow: condition } : null;
  },

  Delay(node, ctx) {
    const d = first(node.ext, 'synthea:DelayConfig');
    if (!d) return ctx.report('DELAY_CONFIG_MISSING', 'Delay needs synthea:delayConfig.');
    const quantity = Number(d.delayValue);
    if (!d.delayUnit || Number.isNaN(quantity)) {
      return ctx.report('DELAY_CONFIG_INVALID', 'delayConfig needs a numeric delayValue and a delayUnit.');
    }
    if (d.delayShape === 'RANGE') {
      const high = Number(d.delayValueHigh);
      if (Number.isNaN(high)) return ctx.report('DELAY_CONFIG_INVALID', 'RANGE delay needs a numeric delayValueHigh.');
      return { range: { low: quantity, high, unit: d.delayUnit } };
    }
    return { exact: { quantity, unit: d.delayUnit } };
  },

  SetAttribute(node, ctx) {
    const c = first(node.ext, 'synthea:SetAttributeConfig');
    if (!c?.attribute) return ctx.report('SET_ATTRIBUTE_MISSING', 'SetAttribute needs synthea:setAttributeConfig with an attribute.');
    return compact({ attribute: c.attribute, value: typedValue(c.value) });
  },

  Counter(node, ctx) {
    const c = first(node.ext, 'synthea:CounterConfig');
    if (!c?.attribute || !c.action) return ctx.report('COUNTER_CONFIG_INVALID', 'Counter needs synthea:counterConfig with attribute and action.');
    return compact({ attribute: c.attribute, action: c.action, amount: num(c.amount) });
  },

  CallSubmodule(node, ctx) {
    const c = first(node.ext, 'synthea:SubmoduleConfig');
    if (!c?.submodule) return ctx.report('SUBMODULE_MISSING', 'CallSubmodule needs synthea:submoduleConfig with a submodule name.');
    return { submodule: c.submodule };
  },

  // Start states: code + optional assign_to_attribute. target_encounter on
  // ConditionOnset/AllergyOnset waits for the encounter synthesis (phase 3).
  ConditionOnset: onsetEmitter(),
  AllergyOnset: onsetEmitter(),
  MedicationOrder: onsetEmitter(),
  CarePlanStart: onsetEmitter(),

  Device(node, ctx) {
    const { codes } = ctx.codes();
    return { ...(codes[0] ? { code: codes[0] } : {}), ...assignTo(node) };
  },

  Procedure: (node, ctx) => codesField(node, ctx),
  Observation: (node, ctx) => codesField(node, ctx),
  MultiObservation: (node, ctx) => codesField(node, ctx),
  DiagnosticReport: (node, ctx) => codesField(node, ctx),

  ImagingStudy(node, ctx) {
    const { codes } = ctx.codes();
    return codes[0] ? { procedure_code: codes[0] } : {};
  },

  // Nothing in the extension carries these yet (see docs/bpmn2gmf-concept.md §5);
  // the missing required fields are reported by verify.
  Symptom: () => ({}),
  VitalSign: () => ({}),
  SupplyList: () => ({}),

  ConditionEnd: endState('ConditionOnset', 'condition_onset'),
  AllergyEnd: endState('AllergyOnset', 'allergy_onset'),
  MedicationEnd: endState('MedicationOrder', 'medication_order'),
  CarePlanEnd: endState('CarePlanStart', 'careplan'),
  DeviceEnd: endState('Device', 'device'),

  // The cause of death is optional in Synthea: attribute, else code, else none.
  Death(node, ctx) {
    const referenced = first(node.ext, 'synthea:ReferencedByAttributeConfig')?.attribute;
    if (referenced) return { referenced_by_attribute: referenced };
    return codesField(node, ctx);
  }
};

function onsetEmitter() {
  return (node, ctx) => {
    if (first(node.ext, 'synthea:EncounterReference')?.targetEncounter) {
      return ctx.report(
        'TARGET_ENCOUNTER_NOT_IMPLEMENTED',
        'targetEncounter is resolved together with the encounter synthesis (phase 3).'
      );
    }
    return { ...codesField(node, ctx), ...assignTo(node) };
  };
}

export function emitState(node, module, diag) {
  const where = { module: module.fileBase, element: node.id, label: node.label };
  const emitter = EMITTERS[node.stateType];
  if (!emitter) {
    diag.error('STATE_TYPE_NOT_IMPLEMENTED', `State type ${node.stateType} is not implemented yet.`, where);
    return null;
  }

  let failed = false;
  const ctx = {
    module,
    report(code, message) {
      diag.error(code, message, where);
      failed = true;
      return null;
    },
    // codes in the systems this state type accepts; other codings on the same
    // element are left out and mentioned once
    codes() {
      const result = codesForState(node, node.stateType);
      if (result.ignored.length) {
        diag.note(
          'CODING_IGNORED',
          `${result.ignored.length} coding(s) not used for ${node.stateType}: ${result.ignored.map((c) => `${c.uri ?? '?'} ${c.code ?? ''}`.trim()).join('; ')}`,
          where
        );
      }
      return result;
    }
  };

  const fields = emitter(node, ctx);
  if (failed || !fields) return null;
  return { type: node.stateType, ...fields };
}
