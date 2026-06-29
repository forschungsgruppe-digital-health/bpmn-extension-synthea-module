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

// The extension under test — wired exactly as a real consumer would:
//   - moddleExtensions: the descriptor (read/write the custom data)
//   - additionalModules: the optional editor module (the properties-panel group)
// Both come straight from the repo, so the demo exercises the real artifacts.
import myExtModule from '../../extension/src/index.js';
import myExtModdle from '../../extension/model/myExtension.json';
import diagramXML from '../../examples/valid/minimal-valid.bpmn?raw';

const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties' },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    myExtModule
  ],
  moddleExtensions: {
    myext: myExtModdle
  }
});

async function openDiagram(xml) {
  try {
    await modeler.importXML(xml);
    modeler.get('canvas').zoom('fit-viewport');
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
    link.download = 'diagram.bpmn';
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    console.error('failed to export diagram', err);
  }
});

openDiagram(diagramXML);
