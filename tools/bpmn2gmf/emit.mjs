// Stage 5: IR node -> GMF state object (without transition).
import { first } from './ir.mjs';
import { conditionToGmf, typedValue, num } from './conditions.mjs';
import { codesForState, systemName } from './codes.mjs';

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

// synthea:ValueConfig -> the numbers of an exact value or a low/high range.
// `where` is how the caller wants the unit: 'state' (Observation: unit sits on
// the state), 'inside' (Death: unit sits inside exact/range), 'none' (Symptom).
function readValue(node, ctx, where) {
  const v = first(node.ext, 'synthea:ValueConfig');
  if (!v) return null;

  const low = num(v.value);
  const high = num(v.valueHigh);
  if (low === undefined || Number.isNaN(low)) {
    return ctx.report('VALUE_CONFIG_INVALID', 'valueConfig needs a numeric value.');
  }
  const range = v.valueShape === 'RANGE';
  if (range && (high === undefined || Number.isNaN(high) || high < low)) {
    return ctx.report('VALUE_CONFIG_INVALID', 'A RANGE value needs a numeric valueHigh that is not below the low value.');
  }
  if (!range && high !== undefined) {
    return ctx.report('VALUE_CONFIG_INVALID', 'valueHigh only belongs to a RANGE value; set valueShape="RANGE" or remove it.');
  }
  if (where === 'inside' && !v.unit) {
    return ctx.report('VALUE_CONFIG_INVALID', 'This value needs a unit (e.g. years).');
  }

  const unitInside = where === 'inside' ? { unit: v.unit } : {};
  return {
    unit: where === 'state' ? v.unit : undefined,
    value: range
      ? { range: compact({ low, high, ...unitInside, decimals: where === 'state' ? v.decimals : undefined }) }
      : { exact: { quantity: low, ...unitInside } }
  };
}

// One synthea:ReportObservation -> an entry of a DiagnosticReport's `observations`:
// a LOINC-coded observation with category and unit and exactly one way to get its
// value: an exact number / a range, a coded value (e.g. "cloudy urine"), or the
// name of a vital sign. The numbers are a modeling decision, not derivable from
// the LOINC code (modeling guide).
function reportObservation(o, ctx, index) {
  const at = `reportObservation ${index + 1}${o.codeDisplay ? ` (${o.codeDisplay})` : ''}`;
  if (!o.code || !o.codeDisplay || !o.category || !o.unit) {
    return ctx.report('REPORT_OBSERVATION_INCOMPLETE', `${at} needs code, codeDisplay, category and unit.`);
  }
  const numeric = o.value !== undefined;
  const coded = !!(o.valueCodeSystem || o.valueCode || o.valueCodeDisplay);
  const vital = !!o.vitalSign;
  if ([numeric, coded, vital].filter(Boolean).length !== 1) {
    return ctx.report('REPORT_OBSERVATION_VALUE', `${at} needs exactly one of: a value (exact or range), a coded value, or a vitalSign.`);
  }

  const out = { category: o.category, ...(vital ? { vital_sign: o.vitalSign } : {}), codes: [{ system: 'LOINC', code: o.code, display: o.codeDisplay }], unit: o.unit };
  if (numeric) {
    const low = num(o.value);
    const high = num(o.valueHigh);
    if (Number.isNaN(low)) return ctx.report('REPORT_OBSERVATION_VALUE', `${at}: value must be a number.`);
    if (o.valueShape === 'RANGE') {
      if (high === undefined || Number.isNaN(high) || high < low) {
        return ctx.report('REPORT_OBSERVATION_VALUE', `${at}: a RANGE needs a numeric valueHigh that is not below value.`);
      }
      out.range = compact({ low, high, decimals: o.decimals });
    } else {
      if (high !== undefined) return ctx.report('REPORT_OBSERVATION_VALUE', `${at}: valueHigh only belongs to a RANGE.`);
      out.exact = { quantity: low };
    }
  }
  if (coded) {
    const system = systemName(o.valueCodeSystem);
    if (!o.valueCodeSystem || !o.valueCode || !o.valueCodeDisplay || !system) {
      return ctx.report('REPORT_OBSERVATION_VALUE', `${at}: a coded value needs a known valueCodeSystem, valueCode and valueCodeDisplay.`);
    }
    out.value_code = { system, code: o.valueCode, display: o.valueCodeDisplay };
  }
  return out;
}

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
  ConditionOnset: onsetEmitter(true),
  AllergyOnset: onsetEmitter(true),
  MedicationOrder: onsetEmitter(false),
  CarePlanStart: onsetEmitter(false),

  Device(node, ctx) {
    const { codes } = ctx.codes();
    return { ...(codes[0] ? { code: codes[0] } : {}), ...assignTo(node) };
  },

  Procedure: (node, ctx) => codesField(node, ctx),

  Observation(node, ctx) {
    const category = first(node.ext, 'synthea:ObservationConfig')?.category;
    const value = readValue(node, ctx, 'state');
    return compact({
      category,
      unit: value?.unit,
      ...codesField(node, ctx),
      ...(value ? value.value : {})
    });
  },
  MultiObservation: (node, ctx) => codesField(node, ctx),
  DiagnosticReport(node, ctx) {
    const observations = (node.ext['synthea:ReportObservation'] ?? []).map((o, i) => reportObservation(o, ctx, i));
    if (observations.includes(null)) return null;
    return { ...codesField(node, ctx), ...(observations.length ? { observations } : {}) };
  },

  ImagingStudy(node, ctx) {
    const { codes } = ctx.codes();
    const series = (node.ext['synthea:ImagingStudySeries'] ?? []).map((s) => imagingSeries(s, ctx));
    if (series.includes(null)) return null;
    return { ...(codes[0] ? { procedure_code: codes[0] } : {}), ...(series.length ? { series } : {}) };
  },

  // Synthesized by encounters.mjs from synthea:encounterContext, never drawn.
  // `codes` come from the group's encounterCode* attributes (a missing one is reported by verify).
  Encounter(node) {
    const g = node.synthetic.group;
    return compact({
      ...(g.wellness ? { wellness: true } : { encounter_class: g.encounterClass }),
      reason: g.reason,
      codes: g.code ? [{ system: g.codeSystem, code: g.code, display: g.codeDisplay }] : undefined
    });
  },
  EncounterEnd: () => ({}),

  Symptom(node, ctx) {
    const name = first(node.ext, 'synthea:SymptomConfig')?.symptom;
    const value = readValue(node, ctx, 'none');
    return { ...(name ? { symptom: name } : {}), ...(value ? value.value : {}) };
  },

  // Nothing in the extension carries these yet (see docs/bpmn2gmf-concept.md §5);
  // the missing required fields are reported by verify.
  VitalSign: () => ({}),
  SupplyList: () => ({}),

  ConditionEnd: endState('ConditionOnset', 'condition_onset'),
  AllergyEnd: endState('AllergyOnset', 'allergy_onset'),
  MedicationEnd: endState('MedicationOrder', 'medication_order'),
  CarePlanEnd: endState('CarePlanStart', 'careplan'),
  DeviceEnd: endState('Device', 'device'),

  // The cause of death is optional in Synthea: attribute, else code, else none.
  // A time span (valueConfig) schedules the death in the future; the module goes on.
  Death(node, ctx) {
    const referenced = first(node.ext, 'synthea:ReferencedByAttributeConfig')?.attribute;
    const value = readValue(node, ctx, 'inside');
    const cause = referenced ? { referenced_by_attribute: referenced } : codesField(node, ctx);
    return { ...cause, ...(value ? value.value : {}) };
  }
};

// `target_encounter` (ConditionOnset/AllergyOnset only): the modeler writes the
// encounterId of the group; here it becomes the name of that group's Encounter
// state. Only well-defined when the group has exactly one (decision 3).
// One synthea:ImagingStudySeries -> a GMF series (body site SNOMED, modality
// DICOM-DCM, one kind of image with its DICOM SOP class).
function imagingSeries(s, ctx) {
  const needed = ['bodySiteCode', 'bodySiteDisplay', 'modalityCode', 'modalityDisplay', 'instanceTitle', 'sopClassCode', 'sopClassDisplay'];
  const missing = needed.filter((f) => !s[f]);
  if (missing.length) {
    return ctx.report('SERIES_INCOMPLETE', `imagingStudySeries is missing: ${missing.join(', ')}.`);
  }
  return compact({
    body_site: { system: 'SNOMED-CT', code: s.bodySiteCode, display: s.bodySiteDisplay },
    modality: { system: 'DICOM-DCM', code: s.modalityCode, display: s.modalityDisplay },
    min_number_instances: s.minInstances,
    max_number_instances: s.maxInstances,
    instances: [{ title: s.instanceTitle, sop_class: { system: 'DICOM-SOP', code: s.sopClassCode, display: s.sopClassDisplay } }]
  });
}

function onsetEmitter(allowsTarget) {
  return (node, ctx) => {
    const fields = { ...codesField(node, ctx), ...assignTo(node) };
    const target = first(node.ext, 'synthea:EncounterReference')?.targetEncounter;
    if (!target) return fields;
    if (!allowsTarget) {
      return ctx.report('TARGET_ENCOUNTER_UNSUPPORTED', `${node.stateType} has no target_encounter in Synthea; remove synthea:encounterReference.`);
    }
    const states = ctx.module.encounters?.get(target) ?? [];
    if (states.length === 0) {
      return ctx.report('TARGET_ENCOUNTER_UNKNOWN', `targetEncounter "${target}" is not the encounterId of any group in this module.`);
    }
    if (states.length > 1) {
      return ctx.report(
        'TARGET_ENCOUNTER_AMBIGUOUS',
        `Encounter "${target}" is entered at ${states.length} places (${states.join(', ')}), so targetEncounter cannot name one state.`
      );
    }
    return { ...fields, target_encounter: states[0] };
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
