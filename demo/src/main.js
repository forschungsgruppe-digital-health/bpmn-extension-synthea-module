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

// Zooming immediately after import can run before (a) the #canvas container
// has a laid-out, non-zero size (e.g. right after initial page load, CSS/font
// loading still settling) and/or (b) diagram-js has actually rendered the
// imported elements, so their combined bounding box is still 0x0 — either one
// makes diagram-js compute a non-finite scale factor. A single
// requestAnimationFrame is not always enough for either condition, so poll
// both the container's rendered size and the default layer's content bbox
// across frames (bounded, so a genuinely broken layout/render doesn't spin
// forever) before zooming, and don't let a still-failing zoom take down the
// whole import.
function waitForLayout(canvas, maxFrames = 30) {
  return new Promise((resolve) => {
    let frames = 0;
    const container = canvas.getContainer();

    function check() {
      const { width, height } = container.getBoundingClientRect();
      const bbox = canvas.getDefaultLayer().getBBox();
      const ready = width > 0 && height > 0 && bbox.width > 0 && bbox.height > 0;

      if (ready || frames >= maxFrames) {
        resolve();
        return;
      }

      frames += 1;
      requestAnimationFrame(check);
    }

    requestAnimationFrame(check);
  });
}

async function openDiagram(xml) {
  try {
    await modeler.importXML(xml);

    const canvas = modeler.get('canvas');
    await waitForLayout(canvas);

    try {
      canvas.zoom('fit-viewport');
    } catch (zoomErr) {
      console.error('failed to fit viewport (diagram is still imported and usable)', zoomErr);
    }
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
