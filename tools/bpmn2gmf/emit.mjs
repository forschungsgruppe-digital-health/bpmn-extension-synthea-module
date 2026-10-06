// Stage 5: IR node -> GMF state object (without transition).
import { first } from './ir.mjs';
import { conditionToGmf, typedValue, num } from './conditions.mjs';

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// Each emitter gets (node, report) and returns the type-specific fields.
const EMITTERS = {
  Initial: () => ({}),
  Terminal: () => ({}),
  Simple: () => ({}),

  Guard(node, report) {
    const allow = first(node.ext, 'synthea:GuardConfig')?.allow;
    if (!allow) return report('GUARD_ALLOW_MISSING', 'Guard needs synthea:guardConfig with an allow condition.');
    const condition = conditionToGmf(allow, (m) => report('CONDITION_INVALID', m));
    return condition ? { allow: condition } : null;
  },

  Delay(node, report) {
    const d = first(node.ext, 'synthea:DelayConfig');
    if (!d) return report('DELAY_CONFIG_MISSING', 'Delay needs synthea:delayConfig.');
    const quantity = Number(d.delayValue);
    if (!d.delayUnit || Number.isNaN(quantity)) {
      return report('DELAY_CONFIG_INVALID', 'delayConfig needs a numeric delayValue and a delayUnit.');
    }
    if (d.delayShape === 'RANGE') {
      const high = Number(d.delayValueHigh);
      if (Number.isNaN(high)) return report('DELAY_CONFIG_INVALID', 'RANGE delay needs a numeric delayValueHigh.');
      return { range: { low: quantity, high, unit: d.delayUnit } };
    }
    return { exact: { quantity, unit: d.delayUnit } };
  },

  SetAttribute(node, report) {
    const c = first(node.ext, 'synthea:SetAttributeConfig');
    if (!c?.attribute) return report('SET_ATTRIBUTE_MISSING', 'SetAttribute needs synthea:setAttributeConfig with an attribute.');
    return compact({ attribute: c.attribute, value: typedValue(c.value) });
  },

  Counter(node, report) {
    const c = first(node.ext, 'synthea:CounterConfig');
    if (!c?.attribute || !c.action) return report('COUNTER_CONFIG_INVALID', 'Counter needs synthea:counterConfig with attribute and action.');
    return compact({ attribute: c.attribute, action: c.action, amount: num(c.amount) });
  },

  CallSubmodule(node, report) {
    const c = first(node.ext, 'synthea:SubmoduleConfig');
    if (!c?.submodule) return report('SUBMODULE_MISSING', 'CallSubmodule needs synthea:submoduleConfig with a submodule name.');
    return { submodule: c.submodule };
  }
};

export function emitState(node, module, diag) {
  const where = { module: module.fileBase, element: node.id, label: node.label };
  const emitter = EMITTERS[node.stateType];
  if (!emitter) {
    diag.error('STATE_TYPE_NOT_IMPLEMENTED', `State type ${node.stateType} is not implemented yet.`, where);
    return null;
  }
  let failed = false;
  const fields = emitter(node, (code, message) => {
    diag.error(code, message, where);
    failed = true;
    return null;
  });
  if (failed || !fields) return null;
  return { type: node.stateType, ...fields };
}
