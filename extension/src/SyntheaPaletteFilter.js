/**
 * Palette filter: offers only what the converter turns into Synthea states. Not offered: data
 * object and data store (the converter ignores them), pool (every pool becomes a module of its own,
 * which a newcomer does not mean to make) and group (ignored). What remains: start, intermediate
 * and end event, exclusive gateway, task and expanded sub-process, plus the tools. The context pad
 * of a shape needs no filter: it only appends events, a gateway, a task and a text annotation (the
 * converter ignores it, but a comment does no harm); the parallel and inclusive gateway are
 * reached with the replace menu.
 */

/** Palette entries the converter has no use for. */
export const UNSUPPORTED_PALETTE_ENTRIES = [
  'create.data-object',
  'create.data-store',
  'create.participant-expanded',
  'create.group'
];

/**
 * Takes the unsupported entries out of an entries object.
 *
 * @param {Record<string, object>} entries palette entries, by id
 * @param {string[]} unsupported the ids to remove
 * @returns {Record<string, object>} the same object without them
 */
export function withoutEntries(entries, unsupported) {
  for (const id of unsupported) delete entries[id];
  return entries;
}

// Below the providers of bpmn-js (default priority 1000), so its entries exist when this runs.
const PRIORITY = 100;

/**
 * Registers the filter as a provider of the palette.
 *
 * @param {object} palette the palette service (injected)
 */
export default function SyntheaPaletteFilter(palette) {
  palette.registerProvider(PRIORITY, this);
}

SyntheaPaletteFilter.$inject = ['palette'];

SyntheaPaletteFilter.prototype.getPaletteEntries = function () {
  return (entries) => withoutEntries(entries, UNSUPPORTED_PALETTE_ENTRIES);
};
