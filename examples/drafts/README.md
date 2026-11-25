# Drafts (v0.1)

The first draft diagrams of the lung cancer pathway and of the mapping from Synthea modules to BPMN,
from before the extension and the converter existed. They are kept to show where the models started.

| File | What it is |
|---|---|
| `synthea-module-bpmn-translation-v0.1-draft.xml` (`.svg` is the picture) | Synthea's lung cancer module as one BPMN diagram; the probabilities, the symptom check and the anemia submodule are collapsed sub-processes |
| `synthea-lung-cancer-subprocesses-v0.1-draft.xml` (`.svg` is the picture) | the content of those sub-processes drawn out: the lung cancer probabilities, the anemia submodule and the symptom check |

They are not checked: lint, round trip, XSD and the converter only read `.bpmn` files, and these are
`.xml`. The current pathway is in [`../lung-cancer/`](../lung-cancer/README.md).
