import './style.css';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import 'bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css';

import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule
} from 'bpmn-js-properties-panel';

import lintModule from 'bpmn-js-bpmnlint';

import { initConverterPanel } from './converter-panel.js';
import { initLiveCheck } from './live-check.js';
// Generated from .bpmnlintrc and the lint plugin by tools/pack-lint-config.mjs (npm run dev / build).
import bpmnlintConfig from './generated/lint-config.js';
import syntheaModule from '../../extension/src/index.js';
import syntheaModdle from '../../extension/model/synthea.json';

import mainPathwayXML from '../../lung-cancer/synthea-lung-cancer.bpmn?raw';
import probabilitiesXML from '../../lung-cancer/lung-cancer-probabilities-submodule.bpmn?raw';
import treatmentXML from '../../lung-cancer/lung-cancer-treatment-submodule.bpmn?raw';
import symptomCheckXML from '../../lung-cancer/symptom-check-submodule.bpmn?raw';
import anemiaXML from '../../lung-cancer/anemia-submodule.bpmn?raw';

const PATHWAYS = [
  { key: 'main', label: 'Lung Cancer (main pathway)', file: 'synthea-lung-cancer.bpmn', xml: mainPathwayXML },
  { key: 'probabilities', label: 'Lung Cancer Probabilities (submodule)', file: 'lung-cancer-probabilities-submodule.bpmn', xml: probabilitiesXML },
  { key: 'treatment', label: 'Lung Cancer Treatment Cycle (submodule)', file: 'lung-cancer-treatment-submodule.bpmn', xml: treatmentXML },
  { key: 'symptom-check', label: 'Symptom Check (submodule)', file: 'symptom-check-submodule.bpmn', xml: symptomCheckXML },
  { key: 'anemia', label: 'Anemia (submodule)', file: 'anemia-submodule.bpmn', xml: anemiaXML }
];

// Deep link from the overview page: modeler/?pathway=treatment
const requested = new URLSearchParams(location.search).get('pathway');
let currentPathway = PATHWAYS.find((p) => p.key === requested) || PATHWAYS[0];

const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties' },
  // The same lint rules as `npm run lint:valid`, live: problems show on the element while modeling.
  linting: { bpmnlint: bpmnlintConfig, active: true },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    syntheaModule,
    lintModule
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

const pathwaySelect = document.querySelector('#pathway-select');
PATHWAYS.forEach((pathway) => {
  const option = document.createElement('option');
  option.value = pathway.key;
  option.textContent = pathway.label;
  pathwaySelect.appendChild(option);
});
pathwaySelect.value = currentPathway.key;

pathwaySelect.addEventListener('change', () => {
  currentPathway = PATHWAYS.find((p) => p.key === pathwaySelect.value) || PATHWAYS[0];
  openDiagram(currentPathway.xml);
});

document.querySelector('#load-example').addEventListener('click', () => {
  openDiagram(currentPathway.xml);
});

document.querySelector('#new-diagram').addEventListener('click', async () => {
  try {
    await modeler.createDiagram();

    currentPathway = { key: 'new', label: 'New diagram (unsaved)', file: 'new-diagram.bpmn', xml: null };
    pathwaySelect.value = '';

    const canvas = modeler.get('canvas');
    await waitForLayout(canvas);
    canvas.zoom('fit-viewport');
  } catch (err) {
    console.error('failed to create new diagram', err);
  }
});

document.querySelector('#download').addEventListener('click', async () => {
  try {
    const { xml } = await modeler.saveXML({ format: true });
    const blob = new Blob([xml], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = currentPathway.file;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    console.error('failed to export diagram', err);
  }
});

openDiagram(currentPathway.xml);

const converterPanel = initConverterPanel({
  getXml: async () => (await modeler.saveXML({ format: true })).xml,
  getCurrent: () => currentPathway,
  pathways: PATHWAYS
});

// The static converter result (modules/) only exists in the built site, not under `vite dev`.
if (import.meta.env.DEV) document.querySelector('#converter-result').hidden = true;

initLiveCheck({
  modeler,
  compute: converterPanel.compute,
  getCurrent: () => currentPathway,
  showMessages: () => converterPanel.show('messages')
});
