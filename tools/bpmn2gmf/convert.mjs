// Pure pipeline: BPMN XML strings in, GMF module objects + diagnostics out.
import { Diagnostics } from './diagnostics.mjs';
import { parseBpmn } from './parse.mjs';
import { buildModules } from './ir.mjs';
import { resolveStates } from './resolve.mjs';
import { buildTransition } from './transitions.mjs';
import { emitState } from './emit.mjs';
import { verifyModule, verifySubmodules } from './verify.mjs';

// `fileBase` is the module file name without extension, e.g. "anemia_submodule";
// it is also what CallSubmodule refers to (flat layout).
export const fileBaseFor = (path) =>
  path.split('/').pop().replace(/\.bpmn$/i, '').replace(/-/g, '_');

export async function convert(inputs) {
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
      // Structural checks are meaningless on a partial module (cascading noise).
      if (diag.forModule(module.fileBase).every((i) => i.level !== 'error')) {
        verifyModule(module, states, diag);
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
