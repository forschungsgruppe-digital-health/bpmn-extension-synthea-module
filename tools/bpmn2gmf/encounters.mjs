// Encounter synthesis (ADR-0003, docs/bpmn2gmf-concept.md section 4.4).
//
// The diagram only tags states with synthea:encounterContext / encounterId.
// Here the Encounter and EncounterEnd states are derived and spliced into the
// flow of the IR, before transitions are built.
//
// Which part of the flow belongs to an encounter ("region"):
//   span  the tagged states plus every node on a path between two of them
//   tail  from the span on, untagged states keep the encounter open (a state
//         left untagged inherits whatever encounter is open, modeling guide
//         section 9) until the flow reaches a boundary: a long Delay, Terminal,
//         Death, CallSubmodule, or a state of another encounter
// A Delay of one day or more ends the encounter (a visit does not last days);
// shorter ones stay inside it. This matches upstream: anemia keeps its 1 hour
// delay inside the encounter and ends it before the 1 day delay, and a
// treatment loop with delays of weeks gets one encounter per cycle.
//
// Encounter     one per (encounter, entered state), on every edge that enters the span
// EncounterEnd  on every edge that leaves all regions the edge started in;
//               shared per successor, since EncounterEnd ends whichever
//               encounter is current at runtime
import { first } from './ir.mjs';
import { systemName } from './codes.mjs';

const BOUNDARY = new Set(['Terminal', 'Death', 'CallSubmodule']);

const DAYS_PER_UNIT = { seconds: 1 / 86400, minutes: 1 / 1440, hours: 1 / 24, days: 1, weeks: 7, months: 30, years: 365 };
export const LONG_DELAY_DAYS = 1;

// A Delay that ends the encounter: its (upper) duration is at least a day. A
// duration that cannot be read counts as long, so the encounter is closed.
function isLongDelay(node) {
  if (node.stateType !== 'Delay') return false;
  const d = first(node.ext, 'synthea:DelayConfig');
  const perUnit = DAYS_PER_UNIT[d?.delayUnit];
  const amount = Math.max(Number(d?.delayValue), Number(d?.delayValueHigh) || 0);
  return !perUnit || Number.isNaN(amount) || amount * perUnit >= LONG_DELAY_DAYS;
}

const endsEncounter = (node) => BOUNDARY.has(node.stateType) || isLongDelay(node);

// States Synthea only processes during an encounter (States wiki).
const REQUIRES_ENCOUNTER = new Set([
  'MedicationOrder', 'CarePlanStart', 'Procedure', 'ImagingStudy', 'Device',
  'SupplyList', 'Observation', 'MultiObservation', 'DiagnosticReport'
]);

const reach = (start, next, allowed) => {
  const seen = new Set(start);
  const queue = [...start];
  while (queue.length) {
    for (const n of next(queue.shift())) {
      if (!seen.has(n) && allowed(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
};

const signature = (g) => ({
  wellness: g.wellness, encounterClass: g.encounterClass, reason: g.reason,
  codeSystem: g.codeSystem, code: g.code, codeDisplay: g.codeDisplay
});

// The code is all-or-nothing and its system must be one the converter knows;
// codeSystem is turned into Synthea's name here so the emitter can use it as is.
function checkEncounterCode(group, firstMember, diag, where) {
  const parts = [group.codeSystem, group.code, group.codeDisplay];
  if (parts.every((p) => !p)) return;
  if (parts.some((p) => !p)) {
    diag.error('ENCOUNTER_CODE_INCOMPLETE', `Encounter "${group.id}" needs encounterCodeSystem, encounterCode and encounterCodeDisplay together.`, where(firstMember));
    return;
  }
  const system = systemName(group.codeSystem);
  if (!system) {
    diag.error('ENCOUNTER_CODE_SYSTEM_UNKNOWN', `Unknown code system "${group.codeSystem}" for encounter "${group.id}" (known: SNOMED CT, LOINC, RxNorm).`, where(firstMember));
    return;
  }
  group.codeSystem = system;
}

export function synthesizeEncounters(module, diag) {
  const nodeOf = (id) => module.nodes.get(id);
  const where = (n) => ({ module: module.fileBase, element: n.id, label: n.label });
  module.encounters = new Map(); // encounterId -> names of its Encounter states

  // ---- 1. groups -------------------------------------------------------------
  const groups = new Map();
  for (const node of module.nodes.values()) {
    const ctx = first(node.ext, 'synthea:EncounterContext');
    if (!ctx) continue;
    if (!ctx.encounterId) {
      if (ctx.requiresEncounterContext) {
        diag.error('ENCOUNTER_ID_MISSING', 'requiresEncounterContext is set but encounterId is empty, so the state cannot be grouped into an encounter.', where(node));
      }
      continue;
    }
    if (!node.stateType) continue;
    const attrs = {
      wellness: !!ctx.wellness,
      encounterClass: ctx.encounterClass || undefined,
      reason: ctx.reason || undefined,
      codeSystem: ctx.encounterCodeSystem || undefined,
      code: ctx.encounterCode || undefined,
      codeDisplay: ctx.encounterCodeDisplay || undefined
    };
    let group = groups.get(ctx.encounterId);
    if (!group) {
      group = { id: ctx.encounterId, ...attrs, members: new Set(), inconsistent: false };
      groups.set(group.id, group);
    } else if (!group.inconsistent && JSON.stringify(attrs) !== JSON.stringify(signature(group))) {
      group.inconsistent = true;
      diag.error('ENCOUNTER_INCONSISTENT', `Members of encounter "${group.id}" disagree on wellness / encounterClass / reason / code.`, where(node));
    }
    group.members.add(node);
    node.group = group.id;
  }
  for (const group of groups.values()) checkEncounterCode(group, [...group.members][0], diag, where);

  if (!groups.size) {
    warnOutside();
    return;
  }

  // States that need an encounter but lie in none (checked on every module, tagged or not).
  function regionsOf(n) {
    return [...groups.values()].filter((g) => g.region?.has(n));
  }
  function warnOutside() {
    for (const node of module.nodes.values()) {
      if (REQUIRES_ENCOUNTER.has(node.stateType) && node.kind !== 'synthetic' && regionsOf(node).length === 0) {
        diag.warn(
          'STATE_OUTSIDE_ENCOUNTER',
          `${node.stateType} states only work during an encounter, but this one is not part of any (tag it with synthea:encounterContext, or place it after a tagged state).`,
          where(node)
        );
      }
    }
  }

  // ---- 2. span and tail per group ----------------------------------------------
  const successors = (n) => n.outgoing.map((e) => nodeOf(e.to)).filter(Boolean);
  const predecessors = (n) => n.incoming.map((e) => nodeOf(e.from)).filter(Boolean);

  for (const group of groups.values()) {
    // another encounter's state, or anything that ends an encounter, cannot lie inside this span
    const blocked = (n) => (n.group && n.group !== group.id) || endsEncounter(n);
    const members = [...group.members];
    const forward = reach(members, successors, (n) => !blocked(n));
    const backward = reach(members, predecessors, (n) => !blocked(n));
    group.span = new Set([...forward].filter((n) => backward.has(n)));

    const frontier = [...group.span].flatMap((n) => successors(n)).filter((n) => !group.span.has(n));
    group.tail = new Set();
    const open = (n) => !n.group && n.stateType && !endsEncounter(n) && n.kind !== 'synthetic' && !group.span.has(n);
    const queue = frontier.filter(open);
    queue.forEach((n) => group.tail.add(n));
    while (queue.length) {
      for (const n of successors(queue.shift())) {
        if (open(n) && !group.tail.has(n)) {
          group.tail.add(n);
          queue.push(n);
        }
      }
    }
    group.region = new Set([...group.span, ...group.tail]);
  }

  const spansOf = (n) => [...groups.values()].filter((g) => g.span.has(n));

  // ---- 3. splice Encounter / EncounterEnd into the flow -----------------------------
  const used = new Set([...module.nodes.values()].map((n) => n.stateName).filter(Boolean));
  const unique = (base) => {
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}_${i}`;
    used.add(name);
    return name;
  };
  let counter = 0;
  const synthetic = (stateType, baseName, group) => {
    const node = {
      id: `synthetic_${++counter}`, kind: 'synthetic', bpmnType: null, label: '', ext: {},
      hasTimer: false, defaultFlow: null, incoming: [], outgoing: [],
      stateType, stateName: unique(baseName), group: undefined, synthetic: { group }
    };
    module.nodes.set(node.id, node);
    return node;
  };
  const connect = (from, to) => {
    const edge = { id: `synthetic_edge_${++counter}`, label: '', from: from.id, to: to.id, isDefault: false, condition: null, probability: null };
    module.edges.push(edge);
    from.outgoing.push(edge);
    to.incoming.push(edge);
  };
  const encounterStates = new Map(); // `${group}|${target}` -> node
  const endStates = new Map(); // successor id -> node

  for (const edge of [...module.edges]) {
    const from = nodeOf(edge.from);
    const to = nodeOf(edge.to);
    if (!from || !to || from.kind === 'synthetic' || to.kind === 'synthetic') continue;

    const fromRegions = regionsOf(from);
    const toRegions = regionsOf(to);
    const leaves = fromRegions.length > 0 && !fromRegions.some((g) => toRegions.includes(g));

    const entered = spansOf(to).filter((g) => !g.span.has(from));
    if (entered.length > 1) {
      diag.error('ENCOUNTER_SPANS_OVERLAP', `State lies between the states of several encounters (${entered.map((g) => g.id).join(', ')}); tag it with one of them.`, where(to));
      continue;
    }
    const entering = entered[0];
    if (!leaves && !entering) continue;

    let successor = to;
    if (entering) {
      const key = `${entering.id}|${to.id}`;
      let enc = encounterStates.get(key);
      if (!enc) {
        enc = synthetic('Encounter', entering.id, entering);
        encounterStates.set(key, enc);
        connect(enc, to);
        const names = module.encounters.get(entering.id) ?? [];
        names.push(enc.stateName);
        module.encounters.set(entering.id, names);
      }
      successor = enc;
    }
    if (leaves) {
      let end = endStates.get(successor.id);
      if (!end) {
        end = synthetic('EncounterEnd', `${fromRegions[0].id}_End`, fromRegions[0]);
        endStates.set(successor.id, end);
        connect(end, successor);
      }
      successor = end;
    }

    to.incoming = to.incoming.filter((e) => e !== edge);
    edge.to = successor.id;
    successor.incoming.push(edge);
  }

  warnOutside();
}
