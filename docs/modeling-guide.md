# Modeling Guide — building a pathway with `synthea:`

A practical, task-oriented guide for actually modeling a BPMN patient pathway
with this extension — not a conceptual introduction (see
[`synthea.md`](synthea.md) for that) and not the exhaustive technical mapping
reference (see [`implicit-rules.md`](implicit-rules.md) for that). This page
answers "I want to model X — which element, which `synthea:` group, which
fields?" Read top to bottom once, then use it as a lookup.

---

## 0. Setup

You need only a browser: open the [modeler](/modeler/) on this site, press
**New** or open a file (the [quickstart](quickstart.md) shows how). Everything
below is done by selecting an element on the canvas and filling in the
matching group in the properties panel on the right — you rarely need to
hand-write XML. The panel
is **dynamic**: many groups only show the fields that are actually meaningful
for the value you've already set (e.g. picking `conditionType="Age"` swaps in
`Quantity`/`Unit` and hides the Attribute-only fields). If a field you expect
isn't there, check whether a sibling dropdown needs to be set first.

**Checking your work in the browser:** the modeler checks the diagram while
you edit (the same lint rules as on the command line) and marks wrong or
missing entries in the panel. **Convert to Synthea** shows the module and, on
the **Messages** tab, every problem the converter found, each with an
explanation. A diagram with no errors there converts.

**The XML behind the panel.** When you read or edit the XML yourself:

- The extension's namespace is
  `https://forschungsgruppe-digital-health.github.io/schema/synthea/1.0`, its
  prefix `synthea`. Declare it on `definitions`:
  `xmlns:synthea="https://forschungsgruppe-digital-health.github.io/schema/synthea/1.0"`.
- This guide names the **types** of the model, which start with a capital
  letter (`synthea:StateTypeConfig`, `synthea:ConditionConfig`). In the XML
  the **element** starts with a small letter: `<synthea:stateTypeConfig>`,
  `<synthea:conditionConfig>`. Only the first letter changes. The
  [type reference](extension-api-types.md) lists every type with its fields.
- The example files write `bpmn2:task` where this guide writes `bpmn:task`.
  The prefix is only a name for the BPMN namespace; both are the same.
- The examples also carry `i18n:` (translated labels) and `cp:` (BPMN4CP
  clinical pathway data) from other extensions. The converter ignores them;
  you do not need them.

**Working from a checkout** is only needed for the command-line converter, for
converting many files at once and for running Synthea:

```bash
git clone -b dev https://github.com/forschungsgruppe-digital-health/bpmn-extension-synthea-module.git
cd bpmn-extension-synthea-module
npm install
npm run demo        # the same modeler, served locally
```

There, before treating a change as done: `npm run validate` (lint, round trip,
XSD, the tests with the golden files and the strict conversion of the lung
cancer files) and `npx bpmnlint "<your files>"` (your real pathway content).

---

## 1. Before you start: does your BPMN even qualify?

If you're modeling a pathway from scratch, skip this section — start at §2.
But if you're starting from an **existing clinical BPMN diagram** not
designed with Synthea in mind (e.g. a clinical-governance, documentation, or
quality-assessment model), it has to satisfy four structural preconditions
first. None of these are enforced by the extension, and none are fixable
automatically — they're manual restructuring, done *before* any `synthea:`
element gets added. Skipping this and modeling directly on top of a
non-qualifying diagram produces a result that looks complete but can't
actually be translated to a working Synthea module.

**1. Single pool, patient perspective only.** Synthea has no concept of
multiple actors — no pools, no lanes-as-roles, no message flows between
them. Collapse every pool down to what happens *to* the patient. Example:
a diagram with separate "GP" and "Radiology" pools — "GP orders X-ray" →
message flow → "Radiology receives order" → "Radiology performs X-ray" →
message flow back → "GP reviews result" — becomes a single state:
`Procedure: Chest X-Ray` (`stateType="Procedure"`). For every message flow between two non-patient pools, ask
"what does the *outcome* of this mean for the patient" and model only that
outcome as one state — not the handoff itself.

**2. Gateway patterns.** A Synthea transition always resolves to exactly one
next state (or waits, via Guard), so GMF has neither "0 to N of these can
happen" nor true parallelism. The converter rewrites the two block patterns
into a sequence, and the diagram keeps the meaning for the reader:

- **Parallel (`AND`) split with its join:** the branches run one after the
  other, in the order of the split's outgoing flows. Put them in the order
  that matters clinically; a condition or probability on such a flow is an
  error, because every parallel branch is taken.
- **Inclusive (`OR`) split with its join:** each branch is decided on its own
  by the condition or probability on its flow, so none, some or all branches
  can happen. Every branch needs one (see the lint rule below).

Both must be a structured block: every branch is a region with one way in and
one way out (decisions and sub-processes inside are fine, nested blocks too)
and all branches end in one join of the same kind. A branch that ends the
process, loops back to the split, or has flows from outside is an error
(`PARALLEL_NOT_STRUCTURED`, `INCLUSIVE_NOT_STRUCTURED`) and has to be
remodelled. Complex and event-based gateways have no counterpart.

**3. Embedded subprocesses and placeholders.** An embedded (expanded)
`subProcess` with ordinary sequential content inside — no multi-instance loop,
no boundary events — is converted by `tools/bpmn2gmf`: its content becomes a
module of its own and the subprocess becomes the call of it (see below).
Remove the subprocess boundary and wire its states into the parent flow only
if you want one module instead of two. A subprocess that's actually an empty
placeholder linking out to a separate diagram (e.g. via an external
`cp:definitionCanonical` reference) should instead become a `Call Activity`
with `SubmoduleConfig` pointing at that separate pathway (see §11) — it
already matches the intent, just the wrong BPMN element type.

*Sub-process:* what is drawn inside a sub-process (it needs its own start event and an end event)
becomes a module of its own, `<file>_<sub-process name>`, a submodule; the sub-process becomes the
`CallSubmodule` state that calls it (note `SUBPROCESS_EXTRACTED`). Nested sub-processes become
modules inside modules. Patient attributes are global in Synthea, so what the inside sets is seen
outside. An encounter cannot span the boundary: use a different `encounterId` inside (error
`ENCOUNTER_ACROSS_SUBPROCESS`). An empty sub-process names a module of a file of its own with
`synthea:submoduleConfig`, like a call activity (the plain way); naming a module on a sub-process
with content is `SUBPROCESS_SUBMODULE_CONFLICT`. A lab report with contained measurements is **not** a sub-process:
it is a task of type `DiagnosticReport` whose values are listed as `synthea:reportObservation`,
because Synthea embeds the observations inside that one state.

**4. Drop data objects, message flows, and organization-specific
extensions.** `dataObject`/`dataObjectReference` elements, quality
indicators (e.g. BPMN4CP), and similar artifacts have no Synthea
equivalent. If a data object just restates something another state
already captures (e.g. a "lab report" object next to the task
that actually performs the lab test), it's redundant — remove it. If it
represents something no state currently produces (e.g. a standalone
administrative document), decide per case: does it gate any real branching
logic (→ model that as a plain attribute + `Guard`/`Condition`, see §5 and
§4c — nothing new to build, this is the ordinary mechanism), or is it
irrelevant to the simulated clinical course (→ drop it, no loss for patient
data generation)?

None of this is something `npm run validate` or `bpmnlint` can check —
they only validate a diagram that already uses `synthea:` correctly, not
whether the underlying BPMN structure qualifies in the first place. Treat
it as a manual review pass, ideally against a specific reference diagram,
before opening the properties panel for the first time.

---

## 2. Start and end

- **Start event** → `Initial`. Nothing to configure — unambiguous. The generated
  state is always named `Initial` whatever the event's label says (Synthea
  requires that exact name), and a module needs exactly one start event.
- **End event** → defaults to `Terminal`. For a death outcome, set
  `synthea:StateTypeConfig.stateType="Death"` explicitly, and
  reference the prior `ConditionOnset` that caused it via
  `ReferencedByAttributeConfig` (a code for the cause of death is optional in
  Synthea and is not part of `synthea:`).
- **Death at a later point in time:** Synthea's `Death` can also *schedule* the
  death — the patient dies after a time span while the module goes on (the
  upstream lung cancer module does this for stage I–IV). Draw it as an
  ordinary element in the flow (a task or intermediate event, **not** an end
  event) with `stateType="Death"` and the group **"Time until death"**: value
  shape `RANGE` (or `EXACT`), the numbers and the **unit of time** (`years`,
  `months`, …). The flow continues after it. Do not model this with a timer
  boundary event on a call activity — GMF has no boundary events and the
  converter rejects them.

### When does the module start?

Synthea runs every module for every patient **from birth**: the start event is
reached on the day the patient is born. Whatever comes right after it happens
to a newborn. A pathway therefore usually **waits first**:

- **A Delay right after the start event** picks the age at which the pathway
  begins. The lung cancer pathway starts with a delay of `RANGE` 45–65 years
  (§3), then decides who gets the disease.
- **A Guard** (§4c) with an `Age` condition (e.g. `>= 18 years`) waits until
  the patient is old enough, then goes on.
- **A risk over the whole life** is a loop: delay (e.g. 1 year) → probability
  gateway → the "no" branch leads back to the delay. Each pass is one more
  chance.

Keep in mind that a decision is taken **once**, at the age the flow reaches
it. A probability gateway after a delay of 1–10 years gives the disease only
to children between 1 and 10; a later condition such as "adult?" is then never
true. The converter warns (`INITIAL_WITHOUT_WAIT`) when a state that records
something can run right after the start event without a Delay or Guard before
it. That is fine for a submodule (it starts when it is called) or a disease
that starts at birth on purpose.

---

## 3. Making the patient wait — `DelayConfig`

**Element:** Intermediate event with a **Timer** event definition (click the
event, click the wrench (**Change element**) and choose **Timer intermediate
catch event**; the properties panel then shows the BPMN "Timer" group — this alone
is the unambiguous signal that the state is `Delay`, nothing else needs a timer).

**Group:** "Delay" → `delayShape` (`EXACT` or `RANGE`), `delayValue`, and —
only shown when `delayShape="RANGE"` — `delayValueHigh`, plus `delayUnit`.

```xml
<synthea:delayConfig delayShape="RANGE" delayValue="21" delayValueHigh="28" delayUnit="days" />
```

`RANGE` samples uniformly between the two values (matches Synthea's own v1
behavior) — that's the only shape modeled; Synthea's v2 `distribution`
syntax (Gaussian/exponential sampling) is deliberately out of scope, since
`RANGE` already covers this project's needs.

---

## 4. Branching

Three different mechanisms, pick based on what actually decides the branch:

**Every branch of an exclusive gateway needs one of 4a/4b.** A flow name such
as "Gender = F" or "28%" is only a label — the converter reads
`synthea:conditionConfig` (4b) or `synthea:probabilityConfig` (4a), never the
text. At most one outgoing flow may omit both (the BPMN default flow, or the
branch that receives the probability remainder). Lint rule SYN-27
(`gateway-branches-require-condition-or-probability`) warns about gateways
that break this.

On a **probability** gateway the branch without a value receives the
remainder. You may also mark it as the default flow; that changes nothing. On
a **condition** gateway the branch without a condition must be the default
flow (lint rule SYN-35, see 4c).

An **inclusive** gateway is different: each branch is decided on its own, so none, some or all
of them can happen, and there is no fallback or remainder branch. Every outgoing flow needs its
own condition or probability (lint rule `inclusive-branches-require-condition-or-probability`).

**Joining branches again:** draw an exclusive gateway with several incoming
flows and one outgoing flow, or let the flows end directly on the next
element. Both are fine. A joining gateway needs no configuration; it becomes a
`Simple` state that only passes the patient on. One gateway may also join and
split at once, e.g. the decision a loop leads back to (§2, "A risk over the
whole life"): several flows in, the branches with their probabilities or
conditions out.

### 4a. By fixed or dynamic probability — `ProbabilityConfig`

**Element:** a sequence flow leaving a gateway (any gateway type — the
probability lives on the flow, not the gateway itself).

**Group:** "Probability" → either `probability` (a fixed 0.0–1.0 number —
every flow's values across the group must sum to 1.0, checked by lint rule
`probability-sum-valid`), or "Probability as" **value of a patient attribute**: `probabilityAttribute` +
`probabilityDefault` (required; an attribute without a default is an error)
for a runtime-computed weight read from a patient attribute instead of a
hardcoded number.

The choice "Probability as" is stored as `probabilityKind` (`FIXED` or
`ATTRIBUTE`). In hand-written XML you can leave it out: the converter takes it
from the field that is set.

```xml
<bpmn:sequenceFlow id="Flow_Yes" sourceRef="Gateway_Risk" targetRef="Task_Onset">
  <bpmn:extensionElements>
    <synthea:probabilityConfig probability="0.1" />
  </bpmn:extensionElements>
</bpmn:sequenceFlow>
```

**The order of the flows matters when the weights come from attributes.**
Synthea gives whatever the other branches leave to the **last** branch. With
fixed numbers that sums up to 1.0 and the order is irrelevant; with attributes
the sum is only known at run time. So the branch whose probability *is* the
attribute (e.g. "lung cancer", `probability_of_lung_cancer`) must come
**before** the catch-all branch ("no lung cancer"). Put it the other way round
and the attribute is silently ignored: the first branch takes its default, the
event branch takes the remainder, and every patient gets the default risk. The
order is the order of the sequence flows in the file. The converter prints a
note (`DISTRIBUTION_REMAINDER`) when the last branch has a probability of its own,
because Synthea never uses that value: it names the branch that receives the
remainder and the value that is not used. Leave the value off the last branch to
make it the remainder by design. Found by running the
converted lung cancer module in Synthea: it had 13 instead of 1 diagnosis in
400 patients until the two flows were swapped.

### 4b. By a structured condition — `Condition` / `ConditionConfig`

**Element:** a sequence flow, wrapped in `synthea:ConditionConfig`.

**Group:** "Condition" → `conditionType` (a dropdown of all 20 Synthea
`condition_type` values) plus whichever fields are relevant to it — the
panel only shows those, not all 20 types' fields at once:

| `conditionType` | Fields shown | Notes |
|---|---|---|
| `Attribute` | `attribute`, `operator`, `value` | The general case — compares a named patient attribute. To test whether it is set at all use the operator `is nil` / `is not nil` **without a value**; `== nil` compares with the *text* "nil" and makes Synthea throw for an attribute that holds a diagnosis or medication (the converter rejects it) |
| `Gender` | `gender` | |
| `Race` | `race` | |
| `Socioeconomic Status` | `category` | |
| `Age` | `quantity`, `unit`, `operator` | |
| `Date` | `year`, `month`, `operator` | Only year/month — Synthea's fuller day/hour/minute date object isn't modeled |
| `Symptom` | `symptom`, `operator`, `value` | |
| `Vital Sign` | `vitalSign`, `operator`, `value` | |
| `Observation` | `referencedAttribute` **or** `codeSystem` + `code` + `codeDisplay`, `operator`, `value` | Identifies the observation either by an attribute set by a prior state, or by its code (the usual case for a value measured in a lab panel, e.g. LOINC `20570-8` hematocrit). Use one of the two, never both; with a code, all three code fields are required. The most recent observation with that code is compared, and it must have been recorded before this check |
| `Active Condition` / `Active Medication` / `Active Allergy` / `Active CarePlan` | `referencedAttribute` **or** `codeSystem` + `code` + `codeDisplay` | Same two ways — "is the thing referenced by this attribute / carrying this code currently active" |
| `PriorState` | `priorStateName`, `since`, `quantity`, `unit` | `quantity`/`unit` here mean Synthea's `within: {quantity, unit}` — the *same* fields Age uses, different meaning by context |
| `True` / `False` | none | Constants, mainly for testing |

In the XML the condition sits inside `synthea:conditionConfig` on the flow,
for example "age 18 or older":

```xml
<bpmn:sequenceFlow id="Flow_Adult" sourceRef="Gateway_Age" targetRef="Task_Next">
  <bpmn:extensionElements>
    <synthea:conditionConfig>
      <synthea:condition conditionType="Age" operator="&gt;=" quantity="18" unit="years" />
    </synthea:conditionConfig>
  </bpmn:extensionElements>
</bpmn:sequenceFlow>
```

Write `>` and `<` as `&gt;` and `&lt;` in the XML; the panel does that for you.

`negate` (a checkbox, always present) inverts the whole condition — it's our
flat equivalent of Synthea's `Not` wrapper; `tools/bpmn2gmf` is responsible
for expanding it back into a real `Not` object on export.

**Combining conditions — `And` / `Or` / `At Least` / `At Most`:** pick one of
these as `conditionType` and up to three "Sub-condition 1/2/3" groups appear
automatically below. Each is a full, independently-typed condition (same
table as above, recursively) — e.g. `And` with Sub-condition 1 = `Age
>= 45` and Sub-condition 2 = `Gender == F` models "age 45 or older AND
female". `At Least`/`At Most` additionally need `minimum`/`maximum` (how
many of the sub-conditions must/may hold). This only goes one level deep and
up to 3 sub-conditions in the panel — the schema itself has no such limit,
but deeper/wider nesting needs hand-edited XML.

### 4c. By waiting until a condition becomes true — `GuardConfig`

**Element:** an exclusive gateway (the panel and the converter accept `GuardConfig` only there).

**Group:** "Guard" → same `Condition` structure and table as 4b (including
combinators), just reached via `allow` instead of `condition`. The
difference from 4b isn't structural, it's *when* it's checked: a Guard
re-evaluates on every simulation tick until it passes — a plain conditional
flow checks once, when reached.

In the XML the condition sits inside `synthea:guardConfig` on the gateway (the
modeler writes the inner element as `synthea:condition`; `synthea:allow`, the
name of the field, is read as well):

```xml
<bpmn:exclusiveGateway id="Gateway_Adult" name="Adult (18+)?">
  <bpmn:extensionElements>
    <synthea:guardConfig>
      <synthea:condition conditionType="Age" operator="&gt;=" quantity="18" unit="years" />
    </synthea:guardConfig>
  </bpmn:extensionElements>
</bpmn:exclusiveGateway>
```

A gateway that branches on conditions (4b) should have its **default flow**
marked (right-click the flow → "Set as default flow", or the
`default="FlowId"` attribute) — the flow with no condition of its own. If the
flow without a condition is not marked, the converter still treats it as the
fallback and warns (`TRANSITION_FALLBACK_NOT_DEFAULT`). If every flow has a
condition, Synthea goes to its default `Terminal` when none matches; the
converter adds nothing and reports the note `TRANSITION_NO_FALLBACK`.

---

## 5. Changing the simulated patient

**`SetAttributeConfig`** (Task, `stateType="SetAttribute"`) → group "Set
Attribute": `attribute` plus the choice **"Value as"**, which decides which fields follow (the fields of the other choices are cleared when the choice changes):
- **Fixed value** (`value`) — a fixed numeric, boolean or string value (the plain Synthea case);
- **copy the value of this attribute** (`valueAttribute`) — e.g. a hospice
  reason that always is the patient's lung cancer diagnosis, whatever
  `ConditionOnset` stored it (the attribute must have been assigned by an
  earlier state, see section 8);
- **Drawn from a distribution** — a value drawn per patient: `EXACT` (value),
  `UNIFORM` (lowest/highest), `GAUSSIAN` (mean, standard deviation, optional
  min/max) or `EXPONENTIAL` (mean), optionally rounded to a whole number. The
  upstream lung cancer module draws the length of stay this way (exponential,
  mean 3, rounded) — a fixed `3` would give every patient the same stay.

A leftover field of another choice is an error; none sets the attribute to
`null`. (Synthea's `valueCode`/`range`/`expression` aren't modeled. The
States wiki lists neither `distribution` nor `value_attribute` for
`SetAttribute`; both exist in the engine (`State.java`, class `SetAttribute`: `distribution`
from GMF 2, `valueAttribute`) and are used by the upstream module; the
`distribution` follows the format the wiki documents for `Delay`. If several
are set, Synthea takes the first in the order expression, range, series data,
distribution, code, attribute, which is why the converter rejects a mix.)

**`CounterConfig`** (Task, `stateType="Counter"`) → group "Counter":
`attribute`, `action` (`increment`/`decrement`), `amount` (defaults to 1 if
left blank).

Neither produces a FHIR record — they're pure simulation bookkeeping.

---

## 6. Modeling a clinical event

**Element:** usually a `Task` (also valid: Intermediate Event for
`ConditionOnset`/`ConditionEnd`/`AllergyOnset`/`AllergyEnd` — both element
choices are equally correct, the real lung-cancer pathway actually uses Task
for all of these). Which of the 20 clinical `stateType` values applies
(`Procedure`, `Observation`, `MedicationOrder`, `ImagingStudy`, `CarePlanStart`,
`Device`, `SupplyList`, …) is set explicitly via "State Type" — don't rely on
inferring it from the element's name. (The full enum has 29 values; the
other 9 — `Initial`/`Terminal`/`Simple`/`Guard`/`Delay`/`SetAttribute`/
`Counter`/`CallSubmodule`/`Physiology` — are control states covered
elsewhere in this guide, not clinical events.)

**Allergies:** Synthea requires `allergy_type` and `category` on
`AllergyOnset`; they sit on `synthea:allergyConfig` (`allergyType`:
`allergy` or `intolerance`; `category`: `medication`, `food` or
`environment`). Reactions are `synthea:allergyReaction` elements with a SNOMED CT
code and the probability of each severity (`severityNone`, `severityMild`,
`severityModerate`, `severitySevere`). Synthea uses these as weights, so list
`severityNone` for the share without the reaction. None of the five lung cancer
files uses an allergy.

**Add, where applicable:**
- The clinical **code** of the state (SNOMED for most conditions/procedures,
  RxNorm for medications, LOINC for observations): group "Code", right below
  "State Type" — system, code and display text. They are the attributes
  `codeSystem`, `code` and `codeDisplay` of `synthea:stateTypeConfig`. Synthea
  needs the code (a `ConditionOnset` without one stops the simulation). One code
  per state. In the panel the system is a dropdown; in the XML it is the URI:

  | System | `codeSystem` in the XML | Typical use |
  |---|---|---|
  | SNOMED CT | `http://snomed.info/sct` | conditions, procedures, encounters |
  | LOINC | `http://loinc.org` | observations, lab panels |
  | RxNorm | `http://www.nlm.nih.gov/research/umls/rxnorm` | medications |

  The panel offers these three. The codes themselves come from the
  terminology (e.g. the SNOMED CT browser, RxNav for RxNorm, the LOINC search)
  or from an existing Synthea module for the same disease.
- For `ConditionOnset`/`AllergyOnset` specifically: "Assign to Attribute" if
  a later state needs to reference this exact instance (see §8), and
  "Encounter Reference" (`targetEncounter`) if the diagnosis should only be
  formally recorded at a *future* encounter rather than immediately.

---

### Fields Synthea requires on some clinical states

| State type | Panel group | What goes in |
|---|---|---|
| `Observation` | "Observation" + "Value" | **category** (HL7: `vital-signs`, `laboratory`, …) and **value** — `EXACT`, or a `RANGE` (lowest/highest) the simulation draws from — with **unit** (e.g. `{score}`, `mg/dL`) and optional **decimals** |
| `MultiObservation` | "Observation" + report observations (XML) | **category**, the panel's LOINC code (group "Code") and at least one contained value as `synthea:reportObservation` — see below |
| `ImagingStudy` | "Imaging series" | one series: body site (SNOMED code + text), modality (DICOM code, e.g. `CT`, + text), the kind of image (title, DICOM SOP class code + text), optional min/max number of instances. More series can be added in the XML (`synthea:imagingStudySeries`, repeatable) |

The code of the state itself is the "Code" group (see above).

#### Lab panels — `DiagnosticReport` with contained observations

A lab **panel** that bundles many single values (blood count, metabolic panel,
urinalysis) is Synthea's `DiagnosticReport`: one state for the report, with
its single observations *inside* it. Set `stateType="DiagnosticReport"` and the
panel's LOINC code (group "Code"), then list
every contained value as one repeated element in the XML:

```xml
<synthea:reportObservation code="718-7" codeDisplay="Hemoglobin [Mass/volume] in Blood"
    category="laboratory" unit="g/dL" valueShape="RANGE" value="10" valueHigh="11.9" />
```

| Attribute | Meaning |
|---|---|
| `code`, `codeDisplay` | the LOINC code of this single value (the system is LOINC by definition) |
| `category` | HL7 observation category, usually `laboratory` |
| `unit` | e.g. `g/dL`, `%`, `{nominal}` |
| **exactly one** of the three below | |
| `valueShape` + `value` (+ `valueHigh`) | `EXACT`, or `RANGE` — the simulation draws a value between `value` and `valueHigh`; optional `decimals` |
| `valueCodeSystem`, `valueCode`, `valueCodeDisplay` | a *coded* value instead of a number, e.g. SNOMED "Cloudy urine (finding)" for an urinalysis |
| `vitalSign` | the name of a Synthea vital sign that supplies the number (e.g. `Glucose`) |

**These values have to be entered by you — they cannot be derived from the
panel's LOINC code.** LOINC says *which* panel it is (and, in its own
database, which single tests normally belong to it), but not which tests
*your* module includes, nor which values a simulated patient should get.
The ranges are a clinical and simulation decision: e.g. in the anemia module
the "severe" blood count draws a hematocrit of 20–30 %, the "routine" one 30–35 %,
and the later hematocrit check (`Observation` condition on LOINC `20570-8`)
relies on exactly that difference. Take them from the Synthea module you are
reproducing (that is how the five lung-cancer files were filled — the upstream
`lung_cancer.json` / `anemia_sub.json`) or from clinical reference ranges
agreed with a clinician. A report without contained observations is incomplete:
the converter reports it, and `--strict` refuses to write the module.

The properties panel only *lists* the contained observations (group "Report
observations", read-only); add, change or remove `synthea:reportObservation`
elements in the XML. (The state type of the `DiagnosticReport` itself is set in
the panel as usual.)

#### Several values measured together — `MultiObservation`

A **blood pressure** is two values taken at once (systolic and diastolic).
Synthea records that as a `MultiObservation`: one state with the panel's LOINC
code and the single values inside, written like the values of a lab panel. It
needs the category (group "Observation") as well:

```xml
<bpmn:task id="Task_BP" name="Blood pressure">
  <bpmn:extensionElements>
    <synthea:stateTypeConfig stateType="MultiObservation" codeSystem="http://loinc.org"
        code="85354-9" codeDisplay="Blood pressure panel with all children optional" />
    <synthea:observationConfig category="vital-signs" />
    <synthea:reportObservation code="8480-6" codeDisplay="Systolic blood pressure"
        category="vital-signs" unit="mm[Hg]" valueShape="RANGE" value="140" valueHigh="180" decimals="0" />
    <synthea:reportObservation code="8462-4" codeDisplay="Diastolic blood pressure"
        category="vital-signs" unit="mm[Hg]" valueShape="RANGE" value="90" valueHigh="110" decimals="0" />
  </bpmn:extensionElements>
</bpmn:task>
```

The difference to a `DiagnosticReport`: a report is a document that *contains*
results (a lab panel); a `MultiObservation` is one measurement with several
parts. Like every observation it needs a visit (§9).

---

## 7. `VitalSign` / `Symptom` / `SetAttribute` / `Counter` produce no FHIR record

These four produce no FHIR record. Set `stateType` explicitly on the real
element (Task, usually) — a `TextAnnotation` cannot carry it: the converter
ignores text annotations and the properties panel offers no groups on them.

A `Symptom` needs its **name** (group "Symptom" — the label of the element is
not parsed) and a **severity**: group "Value" with `EXACT` or `RANGE` (Synthea
scores symptoms on a scale; the simulation draws a value from the range).

Synthea keeps **one value per symptom name** and adds the values of all symptoms up: a patient
goes to the emergency room when the sum exceeds 500 (primary care 300, urgent care 350). Two
states with the same name therefore overwrite each other instead of adding up. The real
`symptom_check` module uses this: its states are labelled "Bloody Cough", "Fever" and so on, but
nine of them have the symptom name `Cough`. To get the same behavior, set the name in the panel
and leave the label as you want to read it.

### Optional fields that still change the result

Three fields are optional in Synthea, but the real lung cancer module sets them and they
change what the simulation does or writes:

- **`Procedure` duration** (group "Duration (optional)", the same value fields as above, with a
  unit): Synthea lets the procedure take this long. Without it, a daily treatment loop with
  radiation (0.5 to 4 hours) and a hearing test (30 minutes) is shorter than the original:
  in a test with the same seed the average stay was 5.98 instead of 6.64 days. An exact value
  becomes `low` = `high`.
- **`MedicationOrder` administered** (group "Medication", checkbox): the medication is
  given in the encounter, as chemotherapy is. Without it Synthea writes the order as a
  prescription for home ("community"); with it, as inpatient with a Medication resource.
- **`CarePlanStart` activity** (group "Care plan activity"): SNOMED code and display text
  of an activity of the plan. The panel shows one; add more as repeated
  `synthea:carePlanActivity` elements in the XML. Only the care plan resource changes,
  not the simulation.


---

## 8. Linking a later state back to an earlier one — Assign / Referenced by Attribute

**Problem this solves:** "which medication is this actually discontinuing?"
— with several similar prescriptions in the same path, relying on plain
diagram order is ambiguous.

**How:** on the *start* state (e.g. `MedicationOrder`), group "Assign to
Attribute" → pick any attribute name, e.g. `chemotherapy_i_order`. On the
*end* state (e.g. the matching `MedicationEnd`), group "Referenced by
Attribute" → choose "Attribute set by an earlier state" and enter the **same** attribute name (the other choice, "Code", names the entity by its code instead, and the Code section reappears; the panel clears the code when you pick the attribute and removes the reference when you pick the code, because Synthea takes one of the two). That's the whole mechanism — no ID
reference, just a matching string on both ends.

```xml
<!-- start -->
<synthea:assignToAttributeConfig attribute="chemotherapy_i_order" />
<!-- end -->
<synthea:referencedByAttributeConfig attribute="chemotherapy_i_order" />
```

Lint rule `referenced-by-attribute-matches-assign` warns if a
`ReferencedByAttributeConfig` attribute has no matching `AssignToAttributeConfig`
anywhere in the same process — usually a typo. `ReferencedByAttributeConfig`
is only meaningful on `ConditionEnd`/`AllergyEnd`/`MedicationEnd`/
`CarePlanEnd`/`DeviceEnd`/`Death`; `AssignToAttributeConfig` only on
`ConditionOnset`/`AllergyOnset`/`MedicationOrder`/`CarePlanStart`/`Device` —
using either elsewhere gets a lint warning.

Using this pair is optional — without it, pairing silently falls back to
plain diagram order, which is fine when there's genuinely only one candidate.

---

## 9. Grouping several steps into one visit — `EncounterContext`

**Problem this solves:** several states (a measurement, a procedure, a
diagnosis) all happening "during the same doctor visit," without drawing
explicit `Encounter`/`EncounterEnd` bracket states (this project derives them
instead — see [ADR-0003](adr/0003-encounter-context-implicit-scoping.md)).

**How:** on *every* clinical state that belongs to the visit — group
"Encounter Context":
- `requiresEncounterContext` — check this: it says the state needs a visit,
  and the consistency lint rules below only look at checked states.
- `encounterId` — any string, shared by every member of this one visit
  instance. Must be unique enough not to collide with an unrelated visit
  elsewhere in the same process. The converter groups states **by this id**,
  checked or not: a state with an `encounterId` belongs to that visit even
  without the check (one state in the lung cancer main pathway, "Stem Cells",
  is written that way; check the box in your own models).
- `wellness` — is this a routine/preventive visit? **Not cosmetic**: when
  `true`, Synthea pauses the module until the next already-scheduled routine
  checkup actually occurs (managed by Synthea's own internal scheduler,
  typically 1–3 years out) — an emergency diagnosis should almost always be
  `wellness=false`.
- `encounterClass` — **only shown while `wellness` is unchecked** (Synthea
  requires it for every non-wellness encounter): `ambulatory`, `emergency`,
  `urgentcare`, `inpatient`, `outpatient`, `hospice`, `home`, `snf` or `virtual`
  (the encounter types of Synthea v4.0.0).
- `reason` (optional) — why the visit happens: the attribute a prior
  `ConditionOnset` assigned its diagnosis to (§8), e.g. `reason="hypertension"`
  for a follow-up visit after `assignToAttributeConfig attribute="hypertension"`.
  Like the class and the code it belongs to the visit, so set it **the same on
  every member** or not at all (otherwise `ENCOUNTER_INCONSISTENT`). Only the
  visit has a reason in this extension: Synthea's own `reason` on
  `MedicationOrder`, `Procedure` or `CarePlanStart` is not modeled, so the
  converted states carry none.
- **Encounter code** (`encounterCodeSystem`, `encounterCode`,
  `encounterCodeDisplay`; shown with the class, i.e. for non-wellness visits) —
  **required by Synthea** for every non-wellness encounter; all three parts
  together, and the same on every member (lint rule SYN-28). Typical SNOMED
  CT codes: `185347001` *Encounter for problem (procedure)*, `50849002`
  *Emergency room admission (procedure)*.

Every member of the same `encounterId` group must agree on `wellness` (lint
rule `wellness-consistent-within-encounter`) and on `encounterClass` (lint
rule `encounter-class-consistent-within-encounter`, which also warns if a
non-wellness group sets no class at all).

**What if a state is reachable from more than one `encounterId` group?**
Usually: **leave it untagged** (no `EncounterContext` at all), rather than
forcing it onto one path's id. Real Synthea resolves encounter membership
dynamically at simulation time (`current_encounter`) — whichever encounter
is still open on the path actually taken stays active for an untagged
state, which is exactly correct regardless of which path led there. This
is confirmed directly against the real upstream `anemia_sub.json`:
`Administer_Medications`/`Iron_Supplement`/`Vitamin B12 Booster` carry no
encounter info at all there either, despite being reachable from both
`Anemia_Encounter`'s own workup and, via `Consult_Referral_to_Experts_Encounter`,
the blood-panel branch — our `anemia-submodule.bpmn` now matches this. A
second `encounterId` field on the element wouldn't help here even if it
existed: `tools/bpmn2gmf` would still have to emit two separate generated
states for the one diagram node, which untagging already achieves more
simply by not forcing a choice at all.

The one case this *doesn't* cover: a shared state that must itself carry
genuinely *different* `wellness`/`encounterClass` values depending on path
— not just bookkeeping, an actual requirement. There, duplicate the
element in the diagram instead: draw it twice, once per incoming path,
each copy tagged independently with its own `encounterId`.

See `implicit-rules.md` Section E for the full explanation of why (real
Synthea doesn't have this problem; our static tagging approach trades that
flexibility away).

**How far does a visit reach?** `tools/bpmn2gmf` opens the encounter before the
first tagged state and closes it again where the visit ends:
- every state on a path *between* two tagged states is inside the visit;
- untagged states *after* the last tagged one stay inside it (that is what
  makes the untagged medication states above work) until the flow reaches a
  `Terminal`, a `Death`, a submodule call, a state of another visit, or a
  **delay of one day or more** — after the last tagged state a visit does not
  go on for days, so such a delay closes it;
- a delay *between* two states of the same visit (you tagged both) is part of
  the stay if it is shorter than a week: that is how an inpatient stay of
  several days is modeled (a loop with a 1 day delay inside the visit, as in
  the upstream treatment cycle). A delay of a week or more between them splits
  the visit in two;
- in a loop, every pass through such a long delay starts a new visit.

If a state that Synthea only allows during a visit (medication, procedure,
observation, diagnostic report, imaging, care plan start, device, supply list)
ends up outside every visit, the converter warns (`STATE_OUTSIDE_ENCOUNTER`):
tag it, or move it behind a tagged state.

---

## 10. Deferring a diagnosis to a future visit — `EncounterReference`

**Element:** a `ConditionOnset` or `AllergyOnset` state only (enforced by
lint rule `encounter-reference-requires-condition-or-allergy-context`).

**Group:** "Encounter Reference" → `targetEncounter`. Models Synthea's real
distinction between *when a condition starts* (now) and *when it's formally
diagnosed and charted* (at a later encounter) — e.g. a disease process
begins now, but isn't recorded until a scheduled follow-up confirms it.

Set `targetEncounter` to the `encounterId` of the encounter group (§9) this
diagnosis should attach to; `tools/bpmn2gmf` replaces it by the name of that
group's generated `Encounter` state (`target_encounter`).

**Why it matters — a diagnosis without it can be lost.** A `ConditionOnset`
only appears in the patient's record if it happens *during* an encounter, or
if an encounter names it as its `target_encounter`. An onset that happens
between visits and has no target is "onset but never discovered": the condition
exists in the simulation but never shows up in the record. So every diagnosis
that is drawn *outside* a visit should point at the visit where it is found
(in the lung cancer pathway: the suspected cancer at the first emergency visit,
the confirmed type at the biopsy visit, each staged diagnosis at the visit
before treatment starts).

**The encounter must be in the same module** as the diagnosis: Synthea
looks for the target among the states this module has already processed.
`tools/bpmn2gmf` reports a `targetEncounter` that is not the `encounterId` of
a group in the same file (`TARGET_ENCOUNTER_UNKNOWN`), and one whose group is
entered at several places that cannot share one `Encounter` state
(`TARGET_ENCOUNTER_AMBIGUOUS`). That is why `Procedure: MRI Brain` — the state
of the visit the staged diagnoses point at — sits in the main pathway, right
before the treatment submodule is called, and not at the start of the
submodule.

Combine it with the *assign to attribute* of §8 when later states or logic
need to refer to the diagnosis (the hospice reason and the cause of death do).

---

## 11. Reusable submodules — `SubmoduleConfig`

**Element:** a Call Activity, with `calledElement` set to the target
process's ID (this is what makes it render/import correctly as a call — set
it via the BPMN element's own properties, not `synthea:`).

**Group:** "Submodule" → `submodule`, the Synthea module path the call
activity should invoke once exported (e.g.
`"lung_cancer_treatment_submodule"`). Write the bare module name: it is the
**file name** of the BPMN file with `-` replaced by `_`
(`lung-cancer-treatment-submodule.bpmn` → `lung_cancer_treatment_submodule`),
not the process name; the converter checks that every call resolves to a file
of the same run.

**Where the files end up is the converter's job, and it matters.** Synthea
runs every file directly in its modules directory as a module of its own, for
every patient, and treats only files in a *subdirectory* as submodules (loaded,
never run by themselves). So `tools/bpmn2gmf` writes the module nobody calls
(`synthea_lung_cancer.json`) to the top and the modules it calls into a
subdirectory named after it (`synthea_lung_cancer/anemia_submodule.json`, …),
and turns every `submodule` name into that path
(`"synthea_lung_cancer/anemia_submodule"`) — the layout of Synthea's own
`lung_cancer/lung_cancer_probabilities`. Copy the whole output directory.
(Written flat, the submodules would also run on their own and Synthea ran into
an endless recursion; found by running the converted modules in Synthea.)

---

## 12. Before you consider it done

In the browser:

1. No entry in the panel is marked as wrong or missing.
2. **Convert to Synthea** shows no error on the **Messages** tab; read the
   warnings and notes too.
3. Look at the **Graph** tab: does the patient go the way you meant? Think
   about the age at which each decision is taken (§2, "When does the module
   start?").

With a checkout, in addition:

4. `npm run validate` — lint, round trip, XSD conformance, package
   conventions, the tests with the golden files and the strict conversion
   of the lung cancer files.
5. `npx bpmnlint "<your files>"` and `npm run bpmn2gmf -- <your files> --strict`
   — your actual content, not just the example fixtures.
6. If you added a genuinely new pattern, consider whether it needs a
   fixture in `examples/valid/` (and, for anything a lint rule should catch,
   `examples/invalid/`) so the pattern stays tested.

For the full technical mapping (every BPMN element → every candidate Synthea
state, disambiguation signals, transition-type rules, and the complete list
of open points/known limitations), see [`implicit-rules.md`](implicit-rules.md).
