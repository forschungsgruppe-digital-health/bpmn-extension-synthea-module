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

// Synthea names the ended entity in one way only; a reference to an attribute wins over a code.
function warnCodeNotUsed(node, ctx) {
  if (first(node.ext, 'synthea:StateTypeConfig')?.code) {
    ctx.warn('CODE_NOT_USED', `${node.stateType} refers to an attribute (referencedByAttributeConfig), so its code is not written; Synthea takes one or the other.`);
  }
}

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
  if (referenced) {
    warnCodeNotUsed(node, ctx);
    return { referenced_by_attribute: referenced };
  }

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
// the state), 'inside' (Death: unit sits inside exact/range), 'none' (Symptom),
// 'duration' (Procedure: always {low, high, unit}; an exact value is low = high).
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
  if ((where === 'inside' || where === 'duration') && !v.unit) {
    return ctx.report('VALUE_CONFIG_INVALID', 'This value needs a unit (e.g. years).');
  }

  if (where === 'duration') return { value: { duration: { low, high: range ? high : low, unit: v.unit } } };

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

// The distribution fields of a synthea:SetAttributeConfig -> {kind, round?, parameters}. Which
// parameters each kind needs follows the States wiki (Delay, "distribution"): EXACT value;
// UNIFORM low+high; GAUSSIAN mean+standardDeviation (optional min/max); EXPONENTIAL mean.
const DISTRIBUTION_PARAMETERS = {
  EXACT: { need: ['value'], optional: [] },
  UNIFORM: { need: ['low', 'high'], optional: [] },
  GAUSSIAN: { need: ['mean', 'standardDeviation'], optional: ['min', 'max'] },
  EXPONENTIAL: { need: ['mean'], optional: [] }
};
const DISTRIBUTION_FIELDS = ['value', 'mean', 'standardDeviation', 'min', 'max', 'low', 'high'];
const distributionField = (name) => `distribution${name[0].toUpperCase()}${name.slice(1)}`;

function distributionToGmf(c, ctx) {
  const kind = c.distribution;
  const spec = DISTRIBUTION_PARAMETERS[kind];
  if (!spec) return ctx.report('DISTRIBUTION_INVALID', 'A distribution needs a kind: EXACT, UNIFORM, GAUSSIAN or EXPONENTIAL.');
  const parameters = {};
  for (const name of [...spec.need, ...spec.optional]) {
    const v = num(c[distributionField(name)]);
    if (v === undefined) {
      if (spec.need.includes(name)) return ctx.report('DISTRIBUTION_INVALID', `A ${kind} distribution needs ${spec.need.join(' + ')} (missing ${name}).`);
      continue;
    }
    if (Number.isNaN(v)) return ctx.report('DISTRIBUTION_INVALID', `The distribution field ${name} must be a number.`);
    parameters[name] = v;
  }
  const stray = DISTRIBUTION_FIELDS.filter((n) => c[distributionField(n)] !== undefined && !(n in parameters));
  if (stray.length) return ctx.report('DISTRIBUTION_INVALID', `A ${kind} distribution does not use: ${stray.join(', ')}.`);
  return { kind, ...(c.distributionRound ? { round: true } : {}), parameters };
}

// ---- emitters: (node, ctx) -> fields, or ctx.report(...) for an error ---------

// The reactions of an AllergyOnset (SNOMED CT). Each needs a code with its display and the probabilities
// of its severities, which should add up to 1. Returns null after an error.
const SEVERITIES = [['severityMild', 'mild'], ['severityModerate', 'moderate'], ['severitySevere', 'severe'], ['severityNone', 'none']];
function readReactions(node, ctx) {
  const out = [];
  for (const r of node.ext['synthea:AllergyReaction'] ?? []) {
    if (!r.code || !r.codeDisplay) return ctx.report('REACTION_INCOMPLETE', `allergyReaction "${r.code ?? r.codeDisplay ?? ''}" needs both code and codeDisplay.`);
    const levels = SEVERITIES.filter(([prop]) => num(r[prop]) !== undefined).map(([prop, level]) => ({ level, value: num(r[prop]) }));
    if (!levels.length) return ctx.report('REACTION_SEVERITIES_MISSING', `The reaction "${r.codeDisplay}" needs the probability of at least one severity (severityNone, severityMild, severityModerate, severitySevere).`);
    if (levels.some((l) => Number.isNaN(l.value) || l.value < 0 || l.value > 1)) return ctx.report('REACTION_SEVERITIES_INVALID', `The severities of the reaction "${r.codeDisplay}" must be numbers between 0 and 1.`);
    const sum = levels.reduce((n, l) => n + l.value, 0);
    if (Math.abs(sum - 1) > 1e-6) {
      ctx.warn('REACTION_SEVERITIES_SUM', `The severities of the reaction "${r.codeDisplay}" add up to ${Math.round(sum * 1e6) / 1e6}, not 1; add severityNone for the share without this reaction.`);
    }
    out.push({ reaction: { system: 'SNOMED-CT', code: r.code, display: r.codeDisplay }, possible_severities: levels });
  }
  return out;
}

// The prescription of a MedicationOrder. Returns undefined when none is drawn, null after an error.
// A dosage and a duration are each all-or-nothing: a half-filled one would be a different prescription.
function readPrescription(node, ctx) {
  const p = first(node.ext, 'synthea:PrescriptionConfig');
  const instructions = node.ext['synthea:PrescriptionInstruction'] ?? [];
  if (!p && !instructions.length) return undefined;

  const block = (name, fields) => {
    const values = fields.map(([prop]) => p?.[prop]);
    if (values.every((v) => v === undefined || v === '')) return undefined;
    if (values.some((v) => v === undefined || v === '')) {
      return ctx.report('PRESCRIPTION_INCOMPLETE', `The ${name} of a prescription needs all of ${fields.map(([prop]) => prop).join(', ')}.`);
    }
    const out = {};
    for (const [prop, key, numeric] of fields) {
      const value = numeric ? num(p[prop]) : p[prop];
      if (numeric && Number.isNaN(value)) return ctx.report('PRESCRIPTION_INVALID', `${prop} must be a number.`);
      out[key] = value;
    }
    return out;
  };

  const dosage = block('dosage', [['dosageAmount', 'amount', true], ['dosageFrequency', 'frequency', true], ['dosagePeriod', 'period', true], ['dosageUnit', 'unit', false]]);
  const duration = block('duration', [['durationQuantity', 'quantity', true], ['durationUnit', 'unit', false]]);
  if (dosage === null || duration === null) return null;

  const coded = instructions.map((i) =>
    i.code && i.codeDisplay
      ? { system: 'SNOMED-CT', code: i.code, display: i.codeDisplay }
      : ctx.report('PRESCRIPTION_INSTRUCTION_INCOMPLETE', `prescriptionInstruction "${i.code ?? i.codeDisplay ?? ''}" needs both code and codeDisplay.`));
  if (coded.includes(null)) return null;

  const refills = num(p?.refills);
  if (Number.isNaN(refills)) return ctx.report('PRESCRIPTION_INVALID', 'refills must be a number.');
  return {
    ...(refills !== undefined ? { refills } : {}),
    ...(p?.asNeeded ? { as_needed: true } : {}),
    ...(dosage ? { dosage } : {}),
    ...(duration ? { duration } : {}),
    ...(coded.length ? { instructions: coded } : {})
  };
}

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
    if (d.delayShape !== 'RANGE' && d.delayValueHigh !== undefined && d.delayValueHigh !== '') {
      return ctx.report('DELAY_CONFIG_INVALID', 'delayValueHigh only belongs to a RANGE delay; set delayShape="RANGE" or remove it.');
    }
    if (d.delayShape === 'RANGE') {
      const high = Number(d.delayValueHigh);
      if (Number.isNaN(high)) return ctx.report('DELAY_CONFIG_INVALID', 'RANGE delay needs a numeric delayValueHigh.');
      return { range: { low: quantity, high, unit: d.delayUnit } };
    }
    return { exact: { quantity, unit: d.delayUnit } };
  },

  // What the attribute is set to, chosen with valueKind: a fixed value (VALUE), a copy of
  // another attribute's value (ATTRIBUTE) or a value drawn from a distribution (DISTRIBUTION).
  // Without a valueKind it is read from the fields that are set; fields of another kind than
  // the chosen one are an error (the three are alternatives). None of the three sets it to null.
  // (Wiki table lists value/valueCode/range/expression/seriesData; the upstream lung
  // cancer module also uses value_attribute and distribution on SetAttribute.)
  SetAttribute(node, ctx) {
    const c = first(node.ext, 'synthea:SetAttributeConfig');
    if (!c?.attribute) return ctx.report('SET_ATTRIBUTE_MISSING', 'SetAttribute needs synthea:setAttributeConfig with an attribute.');
    const hasDistribution = c.distribution !== undefined || c.distributionRound || DISTRIBUTION_FIELDS.some((n) => c[distributionField(n)] !== undefined);
    const present = { VALUE: c.value !== undefined, ATTRIBUTE: !!c.valueAttribute, DISTRIBUTION: hasDistribution };
    const kind = c.valueKind ?? Object.keys(present).find((k) => present[k]);
    const others = Object.keys(present).filter((k) => k !== kind && present[k]);
    if (others.length || (!c.valueKind && Object.values(present).filter(Boolean).length > 1)) {
      return ctx.report(
        'SET_ATTRIBUTE_VALUE',
        `SetAttribute takes only one of: a value, a valueAttribute, a distribution${c.valueKind ? ` (valueKind is ${c.valueKind}, but ${others.join(' and ')} is also set)` : ''}.`
      );
    }
    if (kind === 'DISTRIBUTION') {
      const distribution = distributionToGmf(c, ctx);
      return distribution ? { attribute: c.attribute, distribution } : null;
    }
    if (c.valueKind && !present[kind]) {
      return ctx.report('SET_ATTRIBUTE_VALUE', `valueKind is ${kind}, but ${kind === 'VALUE' ? 'value' : 'valueAttribute'} is not set.`);
    }
    return compact({
      attribute: c.attribute,
      value: typedValue(c.value),
      value_attribute: c.valueAttribute || undefined
    });
  },

  Counter(node, ctx) {
    const c = first(node.ext, 'synthea:CounterConfig');
    if (!c?.attribute || !c.action) return ctx.report('COUNTER_CONFIG_INVALID', 'Counter needs synthea:counterConfig with attribute and action.');
    return compact({ attribute: c.attribute, action: c.action, amount: num(c.amount) });
  },

  CallSubmodule(node, ctx) {
    const c = first(node.ext, 'synthea:SubmoduleConfig');
    if (node.generatedSubmodule) {
      if (c?.submodule) {
        return ctx.report('SUBPROCESS_SUBMODULE_CONFLICT', 'This sub-process has content, which becomes its own module; remove synthea:submoduleConfig (or empty the sub-process to call a module of a file of its own).');
      }
      return { submodule: node.generatedSubmodule };
    }
    if (!c?.submodule) return ctx.report('SUBMODULE_MISSING', 'CallSubmodule needs synthea:submoduleConfig with a submodule name.');
    return { submodule: c.submodule };
  },

  // Start states: code + optional assign_to_attribute; target_encounter on
  // ConditionOnset/AllergyOnset is resolved against the synthesized encounters.
  ConditionOnset: onsetEmitter(true),
  // allergy_type and category come from synthea:AllergyConfig (Synthea requires both); each
  // synthea:AllergyReaction becomes one entry of `reactions` with the probabilities of its severities.
  AllergyOnset(node, ctx) {
    const fields = onsetEmitter(true)(node, ctx);
    if (!fields) return fields;
    const config = first(node.ext, 'synthea:AllergyConfig');
    const reactions = readReactions(node, ctx);
    if (reactions === null) return null;
    return {
      ...fields,
      ...(config?.allergyType ? { allergy_type: config.allergyType } : {}),
      ...(config?.category ? { category: config.category } : {}),
      ...(reactions.length ? { reactions } : {})
    };
  },
  // administration: the medication is given during the encounter (inpatient) instead of prescribed.
  // administration: given during the encounter instead of prescribed; chronic: reissued at every wellness
  // visit; prescription: dosage, duration, refills and instructions (all optional).
  MedicationOrder(node, ctx) {
    const fields = onsetEmitter(false)(node, ctx);
    if (!fields) return fields;
    const config = first(node.ext, 'synthea:MedicationConfig');
    const prescription = readPrescription(node, ctx);
    if (prescription === null) return null;
    return {
      ...fields,
      ...(config?.administration ? { administration: true } : {}),
      ...(config?.chronic ? { chronic: true } : {}),
      ...(prescription ? { prescription } : {})
    };
  },
  // activities: SNOMED codes that describe the care plan (the code system is fixed).
  CarePlanStart(node, ctx) {
    const fields = onsetEmitter(false)(node, ctx);
    if (!fields) return fields;
    const activities = (node.ext['synthea:CarePlanActivity'] ?? []).map((a) =>
      a.code && a.codeDisplay
        ? { system: 'SNOMED-CT', code: a.code, display: a.codeDisplay }
        : ctx.report('ACTIVITY_INCOMPLETE', `carePlanActivity "${a.code ?? a.codeDisplay ?? ''}" needs both code and codeDisplay.`));
    if (activities.includes(null)) return null;
    return activities.length ? { ...fields, activities } : fields;
  },

  Device(node, ctx) {
    const { codes } = ctx.codes();
    return { ...(codes[0] ? { code: codes[0] } : {}), ...assignTo(node) };
  },

  // `duration` is optional; Synthea lets it take that much simulated time.
  Procedure(node, ctx) {
    const duration = readValue(node, ctx, 'duration');
    return { ...codesField(node, ctx), ...(duration ? duration.value : {}) };
  },

  // `series` is the dose number within the vaccine's series (optional).
  Vaccine(node, ctx) {
    const series = first(node.ext, 'synthea:VaccineConfig')?.series;
    return { ...codesField(node, ctx), ...(series !== undefined ? { series } : {}) };
  },

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
  // A panel (e.g. blood pressure): a category, a code and the contained observations.
  MultiObservation(node, ctx) {
    const observations = (node.ext['synthea:ReportObservation'] ?? []).map((o, i) => reportObservation(o, ctx, i));
    if (observations.includes(null)) return null;
    const category = first(node.ext, 'synthea:ObservationConfig')?.category;
    return compact({ category, ...codesField(node, ctx), ...(observations.length ? { observations } : {}) });
  },
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
      telemedicine_possibility: g.telemedicine,
      codes: g.code ? [{ system: g.codeSystem, code: g.code, display: g.codeDisplay }] : undefined
    });
  },
  // discharge_disposition: a NUBC code from the group's dischargeCode / dischargeDisplay (the system is fixed).
  EncounterEnd(node) {
    const g = node.synthetic.group;
    return g.dischargeCode && g.dischargeDisplay
      ? { discharge_disposition: { system: 'NUBC', code: g.dischargeCode, display: g.dischargeDisplay } }
      : {};
  },

  Symptom(node, ctx) {
    const name = first(node.ext, 'synthea:SymptomConfig')?.symptom;
    const value = readValue(node, ctx, 'none');
    return { ...(name ? { symptom: name } : {}), ...(value ? value.value : {}) };
  },

  // Nothing in the extension carries these yet (see docs/bpmn2gmf-concept.md §5);
  // the missing required fields are reported by verify.
  // A vital sign is only set in the patient, never recorded: its name (one of Synthea's vital signs), a
  // unit ('' for none, as upstream does) and an exact value or a range, from synthea:ValueConfig.
  VitalSign(node, ctx) {
    const name = first(node.ext, 'synthea:VitalSignConfig')?.vitalSign;
    const value = readValue(node, ctx, 'state');
    if (!value && first(node.ext, 'synthea:ValueConfig')) return null; // the error is reported
    return compact({ vital_sign: name, ...(value ? { unit: value.unit ?? '', ...value.value } : {}) });
  },

  // Runs a physiological model with a differential equation solver (1 state in 1 shipped module); it
  // has no counterpart in a care pathway, and a second transition (alt_direct_transition) besides.
  Physiology: (node, ctx) => ctx.report('PHYSIOLOGY_UNSUPPORTED', 'Physiology simulates a physiological model (solver, inputs, outputs, alt_direct_transition); it has no BPMN counterpart and is not converted. Write the module by hand if the simulation is needed.'),
  // supplies: the items the encounter needs (SNOMED CT, the system is fixed), one synthea:SupplyItem each.
  // None drawn: nothing is written and verify reports the missing `supplies`.
  SupplyList(node, ctx) {
    const items = node.ext['synthea:SupplyItem'] ?? [];
    const supplies = items.map((i) => {
      const quantity = num(i.quantity);
      if (!i.code || !i.codeDisplay) return ctx.report('SUPPLY_ITEM_INCOMPLETE', `supplyItem "${i.code ?? i.codeDisplay ?? ''}" needs both code and codeDisplay.`);
      if (!Number.isInteger(quantity) || quantity < 1) return ctx.report('SUPPLY_ITEM_INVALID', `supplyItem "${i.codeDisplay}" needs a quantity of at least 1.`);
      return { quantity, code: { system: 'SNOMED-CT', code: i.code, display: i.codeDisplay } };
    });
    if (supplies.includes(null)) return null;
    return supplies.length ? { supplies } : {};
  },

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
    if (referenced) warnCodeNotUsed(node, ctx);
    const cause = referenced ? { referenced_by_attribute: referenced } : codesField(node, ctx);
    return { ...cause, ...(value ? value.value : {}) };
  }
};

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

// `target_encounter` (ConditionOnset/AllergyOnset only): the modeler writes the
// encounterId of the group; here it becomes the name of that group's Encounter
// state. Only well-defined when the group has exactly one (decision 3).
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

// The state types that read each configuration; on any other state it is ignored (and said so).
const ASSIGNING = ['ConditionOnset', 'AllergyOnset', 'MedicationOrder', 'CarePlanStart', 'Device'];
const CONFIG_READ_BY = {
  'synthea:GuardConfig': ['Guard'],
  'synthea:DelayConfig': ['Delay'],
  'synthea:SubmoduleConfig': ['CallSubmodule'],
  'synthea:CounterConfig': ['Counter'],
  'synthea:SetAttributeConfig': ['SetAttribute'],
  'synthea:AssignToAttributeConfig': ASSIGNING,
  'synthea:ReferencedByAttributeConfig': ['ConditionEnd', 'AllergyEnd', 'MedicationEnd', 'CarePlanEnd', 'DeviceEnd', 'Death'],
  'synthea:SymptomConfig': ['Symptom'],
  'synthea:ObservationConfig': ['Observation', 'MultiObservation'],
  'synthea:ValueConfig': ['Observation', 'Symptom', 'Death', 'Procedure', 'VitalSign'],
  'synthea:VitalSignConfig': ['VitalSign'],
  'synthea:MedicationConfig': ['MedicationOrder'],
  'synthea:PrescriptionConfig': ['MedicationOrder'],
  'synthea:PrescriptionInstruction': ['MedicationOrder'],
  'synthea:VaccineConfig': ['Vaccine'],
  'synthea:SupplyItem': ['SupplyList'],
  'synthea:AllergyConfig': ['AllergyOnset'],
  'synthea:AllergyReaction': ['AllergyOnset'],
  'synthea:CarePlanActivity': ['CarePlanStart'],
  'synthea:ImagingStudySeries': ['ImagingStudy'],
  'synthea:ReportObservation': ['DiagnosticReport', 'MultiObservation']
};

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
    warn(code, message) {
      diag.warn(code, message, where);
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

  for (const [type, states] of Object.entries(CONFIG_READ_BY)) {
    if (node.ext[type]?.length && !states.includes(node.stateType)) {
      diag.warn('CONFIG_IGNORED', `${type} is not read for state type ${node.stateType} (it belongs to ${states.join(', ')}).`, where);
    }
  }

  const fields = emitter(node, ctx);
  if (failed || !fields) return null;
  return { type: node.stateType, ...fields };
}
