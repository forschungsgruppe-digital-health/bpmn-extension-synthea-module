import './style.css';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';

import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule
} from 'bpmn-js-properties-panel';

import syntheaModule from '../../extension/src/index.js';
import syntheaModdle from '../../extension/model/synthea.json';
import diagramXML from '../../lung-cancer/synthea-lung-cancer.bpmn?raw';

const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties' },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    syntheaModule
  ],
  moddleExtensions: {
    synthea: syntheaModdle
  }
});

async function openDiagram(xml) {
  try {
    await modeler.importXML(xml);

    // Zooming immediately after import can run before the #canvas container
    // has a laid-out, non-zero size (e.g. right after initial page load),
    // which makes diagram-js compute a non-finite scale factor. Deferring to
    // the next animation frame guarantees layout has settled first.
    requestAnimationFrame(() => modeler.get('canvas').zoom('fit-viewport'));
  } catch (err) {
    console.error('failed to import diagram', err);
  }
}

document.querySelector('#load-example').addEventListener('click', () => {
  openDiagram(diagramXML);
});

document.querySelector('#download').addEventListener('click', async () => {
  try {
    const { xml } = await modeler.saveXML({ format: true });
    const blob = new Blob([xml], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'synthea-lung-cancer.bpmn';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    console.error('failed to export diagram', err);
  }
});

openDiagram(diagramXML);
