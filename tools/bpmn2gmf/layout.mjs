// Where each module goes in Synthea's modules directory.
//
// Synthea runs every file directly in the modules directory as a module of its
// own, for every patient. Only files in a *subdirectory* are submodules that are
// loaded but never run by themselves (Module.walkModuleTree: submodule = the
// file's parent is not the modules directory), and CallSubmodule names them by
// path ("lung_cancer/lung_cancer_probabilities"). So:
//   a module no other module calls     -> <name>.json
//   a module that others call          -> <root>/<name>.json, where <root> is the first
//                                         such module (in input order) that reaches it
// and every CallSubmodule gets that path.
export function assignPaths(modules) {
  const calls = new Map(
    modules.map((m) => [
      m.fileBase,
      new Set(Object.values(m.states ?? {}).filter((s) => s.type === 'CallSubmodule').map((s) => s.submodule))
    ])
  );
  const called = new Set([...calls.values()].flatMap((set) => [...set]));
  const owner = new Map();

  for (const root of modules.filter((m) => !called.has(m.fileBase))) {
    const queue = [root.fileBase];
    const seen = new Set(queue);
    while (queue.length) {
      for (const next of calls.get(queue.shift()) ?? []) {
        if (seen.has(next) || !calls.has(next)) continue;
        seen.add(next);
        if (!owner.has(next)) owner.set(next, root.fileBase);
        queue.push(next);
      }
    }
  }

  const pathOf = (name) => (owner.has(name) ? `${owner.get(name)}/${name}` : name);
  for (const m of modules) {
    m.path = pathOf(m.fileBase);
    for (const state of Object.values(m.states ?? {})) {
      if (state.type === 'CallSubmodule' && calls.has(state.submodule)) state.submodule = pathOf(state.submodule);
    }
  }
}
