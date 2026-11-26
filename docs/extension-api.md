# The extension API

How to use the `synthea:` extension in your own project: register it in bpmn-js, read the data it writes into the BPMN XML, and what the XSD does and does not check. The list of all types and attributes is generated and has its own page: [the `synthea:` types (reference)](extension-api-types.md).

## What the package provides

The package is `bpmn-js-synthea-extension`. Its entry points (the `exports` in `package.json`):

| Import | What it is |
|---|---|
| `bpmn-js-synthea-extension` | The bpmn-js editor module (properties panel groups, replace menu and palette filter, `Initial` default for start events, modeling rules). Goes into `additionalModules`. |
| `bpmn-js-synthea-extension/model` | The moddle descriptor (`extension/model/synthea.json`). Goes into `moddleExtensions` under the key `synthea`. |
| `bpmn-js-synthea-extension/xsd` | The XML schema for the structure of the extension data (`extension/model/synthea.xsd`). |
| `bpmn-js-synthea-extension/converter` | The converter as a function (`extension/src/converter/convert.mjs`). The command line is the binary `bpmn2gmf`. |

The package is not on npm yet. Use it as a file dependency (`"bpmn-js-synthea-extension": "file:../.."`, see [examples/consumer](../examples/consumer/)) or install a tarball made with `npm pack`. CI checks both (`npm run test:consumer`).

## Register it in bpmn-js

The module extends the properties panel, so register the panel modules next to it. The moddle extension has to be registered under the prefix `synthea`; the XML in your diagrams uses that prefix. The module has no options.

This is the whole file `src/main.js` of the consumer example, which CI builds:

```js
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';

import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule
} from 'bpmn-js-properties-panel';

// Both entries resolve through the "exports" of bpmn-js-synthea-extension.
import syntheaModule from 'bpmn-js-synthea-extension';
import syntheaModdle from 'bpmn-js-synthea-extension/model';

const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties' },
  additionalModules: [BpmnPropertiesPanelModule, BpmnPropertiesProviderModule, syntheaModule],
  moddleExtensions: { synthea: syntheaModdle }
});

modeler.createDiagram();
```

**Peer dependencies** (`package.json`): `bpmn-js` 17 or newer and `diagram-js` 14 or newer are required. `@bpmn-io/properties-panel` 3 or newer and `bpmn-js-properties-panel` 5 or newer are optional: without them the module cannot add its groups, but the moddle extension alone is enough to read and write the data.

## Read the data without the editor

The moddle descriptor works with `bpmn-moddle` in Node, without bpmn-js:

```js
// tested in extension/test/extension-api-doc.test.mjs
import { readFileSync } from 'node:fs';
import BpmnModdle from 'bpmn-moddle';
import syntheaDescriptor from 'bpmn-js-synthea-extension/model' with { type: 'json' };

const moddle = new BpmnModdle({ synthea: syntheaDescriptor });
const { rootElement } = await moddle.fromXML(readFileSync('diagram.bpmn', 'utf8'));

for (const element of rootElement.rootElements[0].flowElements) {
  const config = element.extensionElements?.values?.find((v) => v.$type === 'synthea:StateTypeConfig');
  if (config) console.log(element.name, config.stateType, config.code);
}
```

## Problems in the properties panel

The module shows in the panel what the lint and the converter found on the selected element: all of it in a list **Problems** at the top of the group "Synthea" (red for an error, orange for a warning), and the message again under the field to change, where it clearly belongs to one field (a missing code under **Code**, a duplicate name under **Name**). It uses the panel's own mechanism for this (`propertiesPanel.setDiagnostics`), so the panel also marks the group. This needs a version of `@bpmn-io/properties-panel` that has that event (tested with 3.56 and 3.60).

- **Lint:** taken over by itself when the host registers `bpmn-js-bpmnlint` (its event `linting.completed`). The lint plugin is not part of the package; without it the panel still checks the values in the fields.
- **Converter:** the host hands over the messages of a conversion. They are dropped at the next change of the diagram:

```js
import { convert } from 'bpmn-js-synthea-extension/converter';

const { xml } = await modeler.saveXML();
const { diagnostics } = await convert([{ path: 'diagram.bpmn', xml }]);
modeler.get('syntheaDiagnostics').setConverterMessages(diagnostics.items);
```

- **Elsewhere:** every update fires `synthea.diagnostics.changed` with the selected element and its messages (`{ element, messages }`, each message with `source`, `severity`, `code` and `message`), for a host that wants to show them in its own place.

Which message goes under which field is the table `FIELD` in `extension/src/SyntheaDiagnostics.js`; a test checks that every field in it exists in the panel.

## What the XML looks like

The extension data sits in `<bpmn:extensionElements>` of the element it belongs to, in the namespace `https://forschungsgruppe-digital-health.github.io/schema/synthea/1.0` with the prefix `synthea`. The type `StateTypeConfig` is written as the element `<synthea:stateTypeConfig>`:

```xml
<bpmn:task id="Task_1" name="Diagnosis: Anemia">
  <bpmn:extensionElements>
    <synthea:stateTypeConfig stateType="ConditionOnset" codeSystem="http://snomed.info/sct"
                             code="271737000" codeDisplay="Anemia (disorder)" />
  </bpmn:extensionElements>
</bpmn:task>
```

A task with more data, from the lung cancer treatment submodule (in the example files the BPMN prefix is `bpmn2`):

```xml
<bpmn:task id="Activity_1j8wfnd" name="Medication Prescription: Chemotherapy I">
  <bpmn:extensionElements>
    <synthea:stateTypeConfig stateType="MedicationOrder"
        codeSystem="http://www.nlm.nih.gov/research/umls/rxnorm" code="1736854"
        codeDisplay="Cisplatin 50 MG Injection" />
    <synthea:medicationConfig administration="true" />
    <synthea:assignToAttributeConfig attribute="chemotherapy_i_order" />
    <synthea:encounterContext requiresEncounterContext="true" encounterId="SCLC_Treatment_Encounter"
        encounterClass="inpatient" encounterCodeSystem="http://snomed.info/sct"
        encounterCode="185347001" encounterCodeDisplay="Encounter for problem (procedure)" />
  </bpmn:extensionElements>
</bpmn:task>
```

- `stateTypeConfig` says which Synthea state the element is, and which clinical code it carries (one code per state).
- Probabilities and conditions sit on the **sequence flows** (`synthea:probabilityConfig`, `synthea:conditionConfig`), not on the gateway.
- Encounters are **not drawn**: all states of one visit carry the same `encounterId`, and the converter creates the `Encounter` and `EncounterEnd` states.
- `assignToAttributeConfig` and `referencedByAttributeConfig` link a start state to its end state through an attribute name (for example which medication is discontinued).

All attributes are optional in the model. Which ones a state needs depends on its state type, and that is what the lint rules and the converter check. Which type belongs on which BPMN element is in the [extension matrix](extension-matrix.md), and how to model a pathway with the types is in the [modeling guide](modeling-guide.md).

## The XSD

`extension/model/synthea.xsd` is **generated** from the moddle descriptor and the fixed value lists in `extension/model/synthea.values.json` by `npm run xsd:gen`. The descriptor is the only source: do not edit the XSD by hand. `npm run xsd:gen:check` fails when the XSD differs from what the descriptor would produce.

| What | Who checks it |
|---|---|
| The structure of the extension elements and their attributes, and the fixed choices (enumerations, time units, comparison operators, gender, race) | the XSD (`npm run xsd:ext` validates a diagram against BPMN core and the extension together) |
| Required fields per state type, probability sums, unique names, default flows, encounter groups | the lint rules (`npm run lint:valid`, [lint rules](lint-rules.md)) |
| Whether the model can be turned into a Synthea module | the converter (`npm run convert:check`) |

The BPMN core XSD does not cover `<extensionElements>`. A diagram that passes the core XSD says nothing about the extension data, so "the XSD passed" never means "the extension is valid". The decision is `npm run validate`.

## Keeping this page honest

- The type reference is generated by `npm run api:gen` from the descriptor. `npm run api:gen:check` runs in `npm run validate` and fails when the page is stale.
- The first code block is compared with `examples/consumer/src/main.js`, and the second one is run, by `extension/test/extension-api-doc.test.mjs`.
