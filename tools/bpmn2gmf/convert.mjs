// Pure pipeline: BPMN XML strings in, GMF module objects + diagnostics out.
import { Diagnostics } from './diagnostics.mjs';
import { parseBpmn } from './parse.mjs';
import { buildModules } from './ir.mjs';
import { resolveStates } from './resolve.mjs';
import { buildTransition } from './transitions.mjs';
import { emitState } from './emit.mjs';
import { verifyModule, verifySubmodules } from './verify.mjs';
import { missingFields } from './required-fields.mjs';
import { first } from './ir.mjs';

// `fileBase` is the module file name without extension, e.g. "anemia_submodule";
// it is also what CallSubmodule refers to (flat layout).
export const fileBaseFor = (path) =>
  path.split('/').pop().replace(/\.bpmn$/i, '').replace(/-/g, '_');

export async function convert(inputs, { strict = false } = {}) {
  const diag = new Diagnostics();
  const modules = [];

  for (const { path, xml } of inputs) {
    const fileBase = fileBaseFor(path);
    let parsed;
    try {
      parsed = await parseBpmn(xml);
    } catch (err) {
      diag.error('PARSE_FAILED', err.message, { module: fileBase });
      continue;
    }
    for (const w of parsed.warnings) diag.error('PARSE_WARNING', w, { module: fileBase });

    for (const module of buildModules(parsed.definitions, fileBase, diag)) {
      resolveStates(module, diag);
      const states = {};
      for (const node of module.nodes.values()) {
        if (!node.stateName) continue;
        const state = emitState(node, module, diag);
        if (!state) continue;
        const transition = buildTransition(node, module, diag);
        states[node.stateName] = { ...state, ...transition };
      }
      terminateDeaths(module, states, diag);
      if (module.nodes.size && [...module.nodes.values()].some(usesEncounterContext)) {
        diag.note(
          'ENCOUNTER_SYNTHESIS_PENDING',
          'Encounter / EncounterEnd states are not generated yet (phase 3): states tagged with synthea:encounterContext are emitted without their encounter.',
          { module: module.fileBase }
        );
      }
      // Structural checks are meaningless on a partial module (cascading noise).
      if (diag.forModule(module.fileBase).every((i) => i.level !== 'error')) {
        verifyModule(module, states, diag, { strict });
        markIncomplete(states);
      }
      module.states = states;
      modules.push(module);
    }
  }

  verifySubmodules(modules, diag);

  const results = modules.map((m) => ({
    fileBase: m.fileBase,
    ok: diag.forModule(m.fileBase).every((i) => i.level !== 'error'),
    json: { name: m.name, states: m.states }
  }));
  return { modules: results, diagnostics: diag };
}

const usesEncounterContext = (node) => {
  const ctx = first(node.ext, 'synthea:EncounterContext');
  return !!ctx && (ctx.requiresEncounterContext || !!ctx.encounterId);
};

// A Death state drawn as an end event has no outgoing flow, but Synthea wants it
// to continue to a Terminal state ("typically", States wiki): reuse the module's
// Terminal state, or add one.
function terminateDeaths(module, states, diag) {
  const deaths = [...module.nodes.values()].filter(
    (n) => n.stateType === 'Death' && !n.outgoing.length && states[n.stateName]
  );
  if (!deaths.length) return;

  let terminal = Object.keys(states).find((name) => states[name].type === 'Terminal');
  if (!terminal) {
    terminal = 'Terminal';
    while (terminal in states) terminal += '_';
    states[terminal] = { type: 'Terminal' };
    diag.note('TERMINAL_SYNTHESIZED', `Added a Terminal state "${terminal}" for the Death state(s) to end in.`, { module: module.fileBase });
  }
  for (const n of deaths) states[n.stateName].direct_transition = terminal;
}

// Makes the gaps visible in the output itself: a state that lacks fields Synthea
// requires carries a remark saying so (Synthea ignores unknown remarks).
function markIncomplete(states) {
  for (const state of Object.values(states)) {
    const missing = missingFields(state);
    if (missing.length) {
      state.remarks = [`bpmn2gmf: not complete, required field(s) missing: ${missing.join(', ')}`, ...(state.remarks ?? [])];
    }
  }
}
