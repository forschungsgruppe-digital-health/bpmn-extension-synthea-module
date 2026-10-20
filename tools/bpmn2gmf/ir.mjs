// Stage 2: moddle tree -> intermediate representation (IR).
//
// The IR only contains what the emitters need. Everything BPMN-specific that
// does not matter for GMF (diagram interchange, annotations, associations,
// i18n, BPMN4CP, data objects) is dropped here.

const IGNORED_FLOW_ELEMENTS = new Set([
  'bpmn:DataObject',
  'bpmn:DataObjectReference',
  'bpmn:DataStoreReference'
]);

export function extensionsOf(element) {
  const out = {};
  for (const value of element.extensionElements?.values ?? []) {
    (out[value.$type] ??= []).push(value);
  }
  return out;
}

export const first = (ext, type) => ext[type]?.[0];

function kindOf(el) {
  switch (el.$type) {
    case 'bpmn:StartEvent': return 'start';
    case 'bpmn:EndEvent': return 'end';
    case 'bpmn:ExclusiveGateway': return 'gateway';
    case 'bpmn:CallActivity': return 'call';
    case 'bpmn:SubProcess': return 'subprocess';
    case 'bpmn:IntermediateCatchEvent':
    case 'bpmn:IntermediateThrowEvent': return 'event';
    default: return el.$instanceOf('bpmn:Task') ? 'task' : null;
  }
}

export function buildModule(process, fileBase, diag) {
  const module = {
    fileBase,
    name: process.name || process.id,
    processId: process.id,
    nodes: new Map(),
    edges: [],
    children: [] // sub-processes with content: { element, node }
  };
  const where = (el) => ({ module: fileBase, element: el.id, label: el.name });
  const flows = [];
  const skipped = new Set(); // ids of elements already reported as unsupported

  for (const el of process.flowElements ?? []) {
    if (el.$type === 'bpmn:SequenceFlow') {
      flows.push(el);
      continue;
    }
    if (IGNORED_FLOW_ELEMENTS.has(el.$type)) continue;

    if (el.$type === 'bpmn:BoundaryEvent') {
      diag.error(
        'BOUNDARY_EVENT_UNSUPPORTED',
        'GMF has no boundary events. Remodel this as a state in the normal flow (e.g. Death with a range before the attached activity).',
        where(el)
      );
      skipped.add(el.id);
      continue;
    }

    const kind = el.triggeredByEvent ? null : kindOf(el); // an event sub-process has no GMF equivalent
    if (!kind) {
      diag.error('UNSUPPORTED_ELEMENT', `BPMN element ${el.$type} cannot be converted.`, where(el));
      skipped.add(el.id);
      continue;
    }

    module.nodes.set(el.id, {
      id: el.id,
      kind,
      bpmnType: el.$type,
      label: el.name ?? '',
      ext: extensionsOf(el),
      hasTimer: (el.eventDefinitions ?? []).some((d) => d.$type === 'bpmn:TimerEventDefinition'),
      defaultFlow: el.default?.id ?? null,
      incoming: [],
      outgoing: []
    });

    // A sub-process with content becomes a module of its own; the sub-process itself becomes the
    // CallSubmodule state that calls it (see buildModules).
    if (kind === 'subprocess' && (el.flowElements ?? []).length) {
      module.children.push({ element: el, node: module.nodes.get(el.id) });
    }
  }

  for (const flow of flows) {
    const ext = extensionsOf(flow);
    const from = flow.sourceRef?.id;
    const to = flow.targetRef?.id;
    if (skipped.has(from) || skipped.has(to)) continue; // already reported with the element
    if (!module.nodes.has(from) || !module.nodes.has(to)) {
      diag.error(
        'FLOW_ENDPOINT_UNKNOWN',
        'Sequence flow connects an element that is not part of the converted flow.',
        where(flow)
      );
      continue;
    }
    const edge = {
      id: flow.id,
      label: flow.name ?? '',
      from,
      to,
      isDefault: module.nodes.get(from).defaultFlow === flow.id,
      condition: first(ext, 'synthea:ConditionConfig')?.condition ?? null,
      probability: first(ext, 'synthea:ProbabilityConfig') ?? null
    };
    module.edges.push(edge);
    module.nodes.get(from).outgoing.push(edge);
    module.nodes.get(to).incoming.push(edge);
  }

  return module;
}

const GERMAN = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
const slug = (text) =>
  text.toLowerCase().replace(/[äöüß]/g, (c) => GERMAN[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// A process becomes a module. A sub-process with content inside becomes a module of its own
// (named <parent>_<sub-process name>, nested ones likewise) and the sub-process becomes the
// CallSubmodule state that calls it. Synthea has no embedded flows: a module is a flat list of
// states and a submodule is a separate file.
function expand(module, diag, used) {
  const result = [module];
  for (const { element, node } of module.children) {
    let base = `${module.fileBase}_${slug(element.name ?? '') || slug(element.id)}`;
    while (used.has(base)) base += '_';
    used.add(base);
    const child = buildModule(element, base, diag);
    child.name = element.name || element.id;
    child.parent = module.fileBase;
    node.generatedSubmodule = base;
    diag.note(
      'SUBPROCESS_EXTRACTED',
      `The ${element.flowElements.length} element(s) inside this sub-process became the module "${base}", which this state calls (CallSubmodule).`,
      { module: module.fileBase, element: element.id, label: element.name }
    );
    result.push(...expand(child, diag, used));
  }
  return result;
}

export function buildModules(definitions, fileBase, diag) {
  const processes = (definitions.rootElements ?? []).filter((e) => e.$type === 'bpmn:Process');
  if (processes.length === 0) {
    diag.error('NO_PROCESS', 'The file contains no process.', { module: fileBase });
  }
  const used = new Set();
  return processes.flatMap((p, i) => {
    const base = processes.length > 1 ? `${fileBase}_${i + 1}` : fileBase;
    used.add(base);
    return expand(buildModule(p, base, diag), diag, used);
  });
}
