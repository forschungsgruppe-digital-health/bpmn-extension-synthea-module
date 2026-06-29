import MyExtPropertiesProvider from './MyExtPropertiesProvider.js';

/**
 * The OPTIONAL bpmn-js editor module for this extension, injected via
 * `additionalModules`. It adds a properties-panel group for authoring the
 * <myext:annotation> data. The extension data is valid with or without this
 * module — the moddle descriptor and the lint plugin are what define and
 * enforce it. This only changes the editing experience.
 *
 * A real extension can add more here: a custom renderer, palette entries,
 * context-pad actions, or modeling rules.
 */
export default {
  __init__: ['myExtPropertiesProvider'],
  myExtPropertiesProvider: ['type', MyExtPropertiesProvider]
};
