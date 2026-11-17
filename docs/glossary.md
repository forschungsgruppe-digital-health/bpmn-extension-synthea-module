# Glossary

Short explanations of the words used in this documentation, in alphabetical order.

**Attribute.** A named value on a simulated patient, for example `smoker` or `lung_cancer_stage`. States read and write attributes, and different Synthea modules use them to react to each other.

**BPMN.** Business Process Model and Notation, a standard for drawing processes as diagrams. Here it is used for clinical pathways. See [Basics](basics.md).

**bpmn.io / bpmn-js.** The open-source tools for viewing and editing BPMN diagrams in the browser. The modeler of this project is built with bpmn-js.

**bpmnlint.** A tool that checks BPMN diagrams against rules. This project adds its own rules for the Synthea data, see [Lint rules](lint-rules.md).

**Call activity.** A BPMN box that hands over to another diagram. It becomes a `CallSubmodule` state.

**Converter.** The tool that turns BPMN diagrams with `synthea:` data into Synthea modules. See [Converter overview](converter-overview.md).

**Encounter.** A visit of the patient to the health system in Synthea. Several steps can belong to one visit, see the [modeling guide](modeling-guide.md).

**Extension.** Your own data added to BPMN elements without changing the standard. Here: everything in the `synthea:` namespace. See [Concepts for extension developers](concepts.md).

**FHIR.** A standard format for health records. Synthea can write its output as FHIR.

**Generic Module Framework (GMF).** Synthea's way of describing a disease or care process as a JSON state machine.

**Guard.** A state that waits until a condition becomes true before the patient moves on.

**Lint.** Automatic checking of a diagram against rules, before it is converted. Errors stop `npm run validate`, warnings only report.

**Module.** One Synthea state machine, stored as a JSON file. One BPMN process becomes one module.

**Namespace (`synthea:`).** The prefix that keeps this project's data apart from standard BPMN in the file.

**Pathway.** The course of care of a patient, drawn as a BPMN diagram.

**Properties panel.** The form on the right side of the modeler where you fill in the Synthea settings of the selected element.

**Sequence flow.** An arrow between two BPMN elements.

**State.** One step of a Synthea module with a type, for example a condition, a procedure, a delay or a branch.

**Submodule.** A module that another module calls, so that parts of a pathway can be reused.

**Synthea.** The open-source simulator that generates synthetic patients from modules. See [Synthea in depth](synthea.md).

**Transition.** The connection from one state to the next. A transition can be fixed, or chosen by a probability or a condition.

**XSD.** The XML schema of BPMN. It checks the standard part of a file but not the `synthea:` data, which is why the lint rules exist.
