# Basics: BPMN and Synthea in five minutes

You do not need to know BPMN or Synthea to start. This page gives you just enough of both to follow the rest of the documentation. Words in **bold** are explained again in the [glossary](glossary.md).

## The idea

A **clinical pathway** describes what happens to a patient over time: a symptom appears, tests are done, a diagnosis is made, a treatment starts. You draw that pathway as a diagram. The diagram is then turned into a program-readable description that **Synthea** can run, so you get synthetic (invented) patients who follow your pathway.

```text
Draw the pathway  →  check it  →  convert it  →  run it in Synthea  →  synthetic patient records
   (BPMN)           (lint rules)   (converter)
```

## BPMN in two minutes

**BPMN** is a standard for drawing processes. A diagram is a flow of a few kinds of elements connected by arrows (**sequence flows**). These are the ones you will use:

| BPMN element | What it means in a pathway | What it becomes in Synthea |
|---|---|---|
| Start event (thin circle) | The pathway begins | The `Initial` state |
| End event (thick circle) | The pathway ends, or the patient dies | A `Terminal` state, or `Death` |
| Task (rounded box) | Something happens to the patient: a diagnosis, a procedure, a medication. You choose which kind in the properties panel | A state of the type you chose |
| Timer event (circle with a clock) | The patient waits | A `Delay` state |
| Exclusive gateway (diamond) | The pathway splits and each patient takes one branch, decided by a probability or a condition | The transitions out of a state |
| Call activity (box with a thick border) | Hand over to another, reusable diagram (a submodule) | A `CallSubmodule` state |

BPMN itself has no words for diagnoses, probabilities or waiting times. That is why this project adds its own data to each element, in a separate **namespace** called `synthea:`. The diagram stays valid BPMN, other tools simply ignore the extra data. How this works technically is explained in [Concepts for extension developers](concepts.md); as a modeler you only fill in a form (the **properties panel**) and never write XML by hand.

## Synthea in two minutes

**Synthea** is an open-source program that simulates the lives of fictional patients and writes out realistic but invented health records, for example as **FHIR**. Four ideas are enough:

1. **Modules are state machines.** Synthea describes a disease or a care process as a graph of **states** connected by **transitions**. A simulated patient walks through the graph over simulated time. Such a graph is called a **module** (the Generic Module Framework, GMF).
2. **A state does one thing.** For example: start a visit, record a condition, order a medication, wait, or branch. Each state has a type.
3. **Attributes are shared memory.** Modules do not talk to each other. They read and write named values on the patient, for example `smoker`. That is how one module reacts to another.
4. **Exporters write the result** as patient records.

Synthea modules are JSON files. This project lets you draw them instead of writing them, and checks your drawing before Synthea sees it. [Synthea in depth](synthea.md) goes further, if you want to know more.

## Where to go next

1. [Quickstart](quickstart.md): open the modeler, convert an example and draw a tiny pathway of your own.
2. [Modeling guide](modeling-guide.md): the full manual, for each kind of step.
3. [Glossary](glossary.md): look up any word you are unsure about.
