// Structural comparison of two Synthea modules (docs/bpmn2gmf-concept.md section 11).
//
// compare.mjs compares states by content (type, codes, values) as multisets. This file compares
// the logic: it walks both state graphs from Initial at the same time and checks that
//   - paired states have the same type and the same fields,
//   - every transition has the same conditions, probabilities (in the same ORDER) and targets,
// so a module that behaves like the other one has no difference, whatever its state names or
// extra pass-through states are.
//
// What is left out on purpose:
//   names, `remarks`, `reason` (only labels the output), `number_of_observations` (the engine
//   never reads it), Simple states (pass-through; gateways are resolved into the transition tree),
//   and attribute names as long as the renaming is consistent.
// What is treated as the same on purpose (see norm() and tcmp()):
//   a 1 day Delay as `exact` or as an EXACT distribution, a Counter without `amount` and with 1,
//   codes as number or text, mutually exclusive tests of one attribute in another order,
//   an explicit `Gender M` test and a default branch behind `Gender F`, likewise the second of two
//   `attribute == value` tests of one attribute (lung cancer type SCLC / NSCLC).
//
// A state may be paired with several upstream states (upstream often writes the same logic twice,
// we write it once behind a test of the attribute); conditions that a path already decided
// (Attribute == value) are dropped on both sides before trees are compared.
const TRANS = ['direct_transition', 'distributed_transition', 'conditional_transition', 'complex_transition'];
const IGNORE = new Set([...TRANS, 'remarks', 'reason', 'name', 'target_encounter', 'number_of_observations']);
const ATTR_KEYS = new Set(['attribute', 'assign_to_attribute', 'referenced_by_attribute', 'value_attribute']);

const clone = (x) => JSON.parse(JSON.stringify(x));
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const short = (x, n = 120) => JSON.stringify(x)?.slice(0, n) ?? 'undefined';

// ---- graphs ---------------------------------------------------------------------------------------
export function qualify(prefix, states) {
  const ref = (n) => `${prefix}:${n}`;
  const out = new Map();
  for (const [name, s0] of Object.entries(states)) {
    const s = clone(s0);
    s._mod = prefix;
    if (s.direct_transition) s.direct_transition = ref(s.direct_transition);
    for (const k of ['distributed_transition', 'conditional_transition']) for (const e of s[k] ?? []) e.transition = ref(e.transition);
    for (const e of s.complex_transition ?? []) {
      if (e.transition) e.transition = ref(e.transition);
      for (const d of e.distributions ?? []) d.transition = ref(d.transition);
    }
    out.set(ref(name), s);
  }
  return out;
}

// `main` with the CallSubmodule states that point to one of `subs` replaced by the submodule's states
// (upstream writes the symptom check and the treatment inline). subs: { fileBase: states }.
export function inline(prefix, main, subs) {
  const g = qualify(prefix, main);
  for (const [name, s] of [...g]) {
    const sub = s.type === 'CallSubmodule' && subs[s.submodule.split('/').pop()];
    if (!sub) continue;
    const base = s.submodule.split('/').pop();
    const sg = qualify(base, sub);
    const init = sg.get(`${base}:Initial`);
    sg.delete(`${base}:Initial`);
    g.set(name, { type: 'Simple', _mod: prefix, _inlined: base, ...Object.fromEntries(TRANS.filter((k) => init[k]).map((k) => [k, init[k]])) });
    for (const [k, v] of sg) {
      g.set(k, v.type === 'Terminal' && s.direct_transition ? { type: 'Simple', _mod: base, direct_transition: s.direct_transition, _wasTerminal: true } : v);
    }
  }
  return g;
}

// ---- signatures -----------------------------------------------------------------------------------
function norm(s) {
  const o = {};
  for (const [k, v] of Object.entries(s)) if (!IGNORE.has(k) && !k.startsWith('_')) o[k] = clone(v);
  const d = o.distribution;
  if (o.type === 'Delay' && d?.kind === 'EXACT') {
    o.exact = { quantity: d.parameters.value, unit: o.unit };
    delete o.distribution;
    delete o.unit;
  }
  if (o.type === 'Counter' && o.amount === undefined) o.amount = 1;
  for (const c of o.codes ?? []) if (c.code !== undefined) c.code = String(c.code);
  return o;
}

class Unifier {
  constructor() { this.ou = new Map(); this.uo = new Map(); }
  snap() { return [new Map([...this.uo].map(([k, v]) => [k, new Set(v)])), new Map(this.ou)]; }
  restore([uo, ou]) { this.uo = new Map([...uo].map(([k, v]) => [k, new Set(v)])); this.ou = new Map(ou); }
  bind(a, b) {
    if (this.ou.has(b)) return this.ou.get(b) === a;
    this.ou.set(b, a);
    if (!this.uo.has(a)) this.uo.set(a, new Set());
    this.uo.get(a).add(b);
    return true;
  }
}

export function compareStructure(gu, go, { bypassUpstream = [], callNames = {}, pairModules = ['u', 'o'] } = {}) {
  const uni = new Unifier();
  const accepted = new Map();
  const accept = (note) => accepted.set(note, (accepted.get(note) ?? 0) + 1);

  // upstream states that only end an encounter before the module starts: skipped, reported
  gu = new Map([...gu].map(([k, v]) => [k, clone(v)]));
  const bypassed = [];
  for (const [name, s] of gu) {
    if (bypassUpstream.includes(name.split(':').slice(1).join(':'))) bypassed.push(name);
  }
  for (const b of bypassed) {
    for (const s of gu.values()) if (s.direct_transition === b) s.direct_transition = gu.get(b).direct_transition;
  }

  const eq = (u, o, key) => {
    if (isObj(u) && isObj(o)) {
      const ku = Object.keys(u), ko = Object.keys(o);
      return ku.length === ko.length && ku.every((k) => k in o && eq(u[k], o[k], k));
    }
    if (Array.isArray(u) && Array.isArray(o)) return u.length === o.length && u.every((x, i) => eq(x, o[i], key));
    if (ATTR_KEYS.has(key) && typeof u === 'string' && typeof o === 'string') return uni.bind(u, o);
    if (typeof u === 'number' && typeof o === 'number') return Math.abs(u - o) < 1e-12;
    return u === o;
  };
  const tryEq = (u, o, key) => {
    const snap = uni.snap();
    const ok = eq(u, o, key);
    if (!ok) uni.restore(snap);
    return ok;
  };

  const sigDiff = (su, so) => {
    const nu = norm(su), no = norm(so);
    if (nu.type === 'CallSubmodule' && callNames[nu.submodule.split('/').pop()] === no.submodule.split('/').pop()) {
      nu.submodule = no.submodule;
    }
    const snap = uni.snap();
    if (eq(nu, no)) return [];
    uni.restore(snap);
    const keys = [...new Set([...Object.keys(nu), ...Object.keys(no)])].filter((k) => !(k in nu && k in no && tryEq(nu[k], no[k], k)));
    return keys.length ? keys : ['(attribute renaming conflict)'];
  };

  // ---- transition trees ------------------------------------------------------------------------
  function tree(g, name, seen = []) {
    const s = g.get(name);
    const sn = [...seen, name];
    const target = (t) => {
      if (!g.has(t)) return { k: 'leaf', n: t };
      if (g.get(t).type === 'Simple') return sn.includes(t) ? { k: 'loop' } : tree(g, t, sn);
      return { k: 'leaf', n: t };
    };
    if (s.direct_transition) return target(s.direct_transition);
    if (s.distributed_transition) return { k: 'dist', b: s.distributed_transition.map((e) => [e.distribution, target(e.transition)]) };
    if (s.conditional_transition) return { k: 'cond', b: s.conditional_transition.map((e) => [e.condition ?? null, target(e.transition)]) };
    if (s.complex_transition) {
      return {
        k: 'cond',
        b: s.complex_transition.map((e) => [
          e.condition ?? null,
          e.distributions ? { k: 'dist', b: e.distributions.map((d) => [d.distribution, target(d.transition)]) } : target(e.transition)
        ])
      };
    }
    return { k: 'end' };
  }
  const fact = (c) => (isObj(c) && c.condition_type === 'Attribute' && c.operator === '==' ? [c.attribute, c.value] : null);

  function simplify(t, facts, side) {
    if (t.k === 'cond') {
      const out = [];
      for (const [c, sub] of t.b) {
        const f = fact(c);
        if (f) {
          const key = side === 'o' ? (uni.ou.get(f[0]) ?? f[0]) : f[0];
          if (key in facts) {
            if (facts[key] === f[1]) return simplify(sub, facts, side); // first true branch wins
            continue; // impossible here
          }
        }
        out.push([c, sub]);
      }
      if (!out.length) return { k: 'end' };
      if (out.length === 1 && out[0][0] === null) return simplify(out[0][1], facts, side);
      return { k: 'cond', b: out.map(([c, sub]) => [c, simplify(sub, facts, side)]) };
    }
    if (t.k === 'dist') return { k: 'dist', b: t.b.map(([p, sub]) => [p, simplify(sub, facts, side)]) };
    return t;
  }
  const leaves = (t) => (t.k === 'leaf' ? [t.n] : t.b ? t.b.flatMap(([, s]) => leaves(s)) : []);
  const leafFacts = (t, facts = {}) => {
    if (t.k === 'leaf') return [[t.n, facts]];
    if (!t.b) return [];
    return t.b.flatMap(([c, sub]) => {
      const f = t.k === 'cond' ? fact(c) : null;
      return leafFacts(sub, f ? { ...facts, [f[0]]: f[1] } : facts);
    });
  };

  function tcmp(tu, to, facts, path, out) {
    if (tu.k !== to.k) return [`${path}: shape ${tu.k} vs ${to.k}`];
    if (tu.k === 'leaf') { out.push([tu.n, to.n, { ...facts }]); return []; }
    if (tu.k === 'end' || tu.k === 'loop') return [];
    if (tu.b.length !== to.b.length) return [`${path}: ${tu.k} with ${tu.b.length} branches vs ${to.b.length}`];
    let bu = [...tu.b], bo = [...to.b];
    const allFacts = (b) => b.every(([c]) => fact(c)) && new Set(b.map(([c]) => fact(c)[0])).size === 1;
    if (tu.k === 'cond' && allFacts(bu) && allFacts(bo)) {
      const key = (b) => String(fact(b[0])[1]);
      const su = [...bu].sort((a, b) => key(a).localeCompare(key(b)));
      const so = [...bo].sort((a, b) => key(a).localeCompare(key(b)));
      if (su.some((b, i) => b !== bu[i]) || so.some((b, i) => b !== bo[i])) accept('mutually exclusive tests of one attribute in another order');
      bu = su; bo = so;
    }
    const probs = [];
    bu.forEach(([cu0, su], i) => {
      let cu = cu0;
      const [co, so] = bo[i];
      const prev = i ? bu[i - 1][0] : null;
      const otherGender = cu?.condition_type === 'Gender' && prev?.condition_type === 'Gender' && prev.gender !== cu.gender;
      const otherValue = tu.b.length === 2 && cu?.condition_type === 'Attribute' && prev?.condition_type === 'Attribute' &&
        cu.operator === '==' && prev.operator === '==' && cu.attribute === prev.attribute && cu.value !== prev.value;
      if (tu.k === 'cond' && co === null && (otherGender || otherValue)) {
        accept(otherGender
          ? 'explicit Gender test (upstream) vs default branch (ours) behind the other gender'
          : 'explicit test of the second value (upstream) vs default branch (ours) behind the first, in a split of two');
        cu = null;
      }
      if (!tryEq(cu, co, tu.k === 'dist' ? 'distribution' : undefined)) {
        probs.push(`${path}/${tu.k}[${i}]: ${tu.k === 'dist' ? 'probability' : 'condition'} ${short(cu, 90)} vs ${short(co, 90)}`);
        return;
      }
      // the path decided this test on the upstream side even where ours reaches it as the default branch
      const f = tu.k === 'cond' ? fact(cu0) : null;
      probs.push(...tcmp(su, so, f ? { ...facts, [f[0]]: f[1] } : facts, `${path}/${tu.k}[${i}]`, out));
    });
    return probs;
  }

  // ---- the walk ---------------------------------------------------------------------------------
  const problems = [];
  const pairedU = new Set(), pairedO = new Set(), pairs = new Set();
  const start = [`${pairModules[0]}:Initial`, `${pairModules[1]}:Initial`];
  const queue = [[...start, {}]];
  const seen = new Set();
  const name = (n) => n.split(':').slice(1).join(':');
  while (queue.length) {
    const [u, o, facts] = queue.shift();
    const key = JSON.stringify([u, o, Object.entries(facts).sort()]);
    if (seen.has(key)) continue;
    seen.add(key);
    pairedU.add(u); pairedO.add(o); pairs.add(`${u}\u0000${o}`);
    const su = gu.get(u), so = go.get(o);
    const d = sigDiff(su, so);
    if (d.length) problems.push(`STATE ${su.type}  U:${name(u).slice(0, 40)}  O:${name(o).slice(0, 40)}  differing fields: ${d.join(', ')}\n       U=${short(norm(su), 230)}\n       O=${short(norm(so), 230)}`);
    if (!!su.target_encounter !== !!so.target_encounter) problems.push(`STATE ${su.type}  U:${name(u)}  O:${name(o)}  target_encounter on only one side`);
    const f2 = { ...facts };
    if (su.attribute) delete f2[su.attribute];
    const tu = simplify(tree(gu, u), f2, 'u'), to = simplify(tree(go, o), f2, 'o');
    const out = [];
    const probs = tcmp(tu, to, f2, '', out);
    if (probs.length) {
      problems.push(`TRANSITION at U:${name(u).slice(0, 40)} / O:${name(o).slice(0, 40)}\n       ${probs.slice(0, 4).join('\n       ')}`);
      // continue the walk: pair the leaves by signature
      const lo = leaves(to), used = new Set();
      for (const [a, fa] of leafFacts(tu)) {
        for (const b of lo) {
          if (used.has(b) || !gu.has(a) || !go.has(b)) continue;
          const snap = uni.snap();
          if (!sigDiff(gu.get(a), go.get(b)).length) { used.add(b); out.push([a, b, { ...f2, ...fa }]); break; }
          uni.restore(snap);
        }
      }
    }
    for (const [a, b, fc] of out) if (gu.has(a) && go.has(b)) queue.push([a, b, fc]);
  }

  // the state a target_encounter names must be the one the other side's target_encounter names
  for (const pair of pairs) {
    const [u, o] = pair.split('\u0000');
    const tu = gu.get(u).target_encounter, to = go.get(o).target_encounter;
    if (tu && to && !pairs.has(`${gu.get(u)._mod}:${tu}\u0000${go.get(o)._mod}:${to}`)) {
      problems.push(`target_encounter of U:${name(u)} names ${tu}, O:${name(o)} names ${to}, and those two are not the same state`);
    }
  }

  const effect = (g) => [...g].filter(([, v]) => v.type !== 'Simple').map(([k]) => k);
  return {
    problems,
    unpairedUpstream: effect(gu).filter((n) => !pairedU.has(n) && !bypassed.includes(n)),
    unpairedOurs: effect(go).filter((n) => !pairedO.has(n)),
    bypassed,
    pairedUpstream: pairedU.size,
    pairedOurs: pairedO.size,
    renames: [...uni.uo].map(([a, set]) => [a, [...set].sort()]),
    accepted: Object.fromEntries(accepted),
    wasTerminal: (n) => go.get(n)?._wasTerminal === true
  };
}
