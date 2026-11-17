# Quickstart: your first module

About ten minutes. You need a browser and nothing else: the modeler on this site runs everything locally in the page.

## 1. Open an example

The modeler has no diagrams of its own: you open your files, which stay in your browser and are never uploaded. To follow this tutorial, open the **Examples** menu in the toolbar (or press **Try the lung cancer example** on the start screen) and choose **Probabilities (submodule)**, the smallest real example. The file appears in the list on the left and as a diagram on the canvas: circles, boxes and diamonds connected by arrows. If you are not sure what they mean, read [Basics](basics.md) first.

You can also download the file, [lung-cancer-probabilities-submodule.bpmn](/examples/lung-cancer-probabilities-submodule.bpmn) (right-click, save link as), and drag it onto the page or press **Open files…**. That is how you open your own files later.

The other examples, all from the lung cancer pathway, as downloads: [main pathway](/examples/synthea-lung-cancer.bpmn), [treatment cycle](/examples/lung-cancer-treatment-submodule.bpmn), [symptom check](/examples/symptom-check-submodule.bpmn) and [anemia](/examples/anemia-submodule.bpmn). The main pathway calls the four others, so open it together with them: **Lung cancer pathway: all five files** in the Examples menu does that, and for downloaded files put all five in one folder and use **Open folder…**.

## 2. Look at one element

Click any box. On the right, the **properties panel** shows what you can set. The groups that start with the Synthea settings are the new part: the **State type** says what the box becomes in Synthea (for example a condition, a procedure or a delay), and further groups appear depending on that type. Click a few other elements and watch the groups change.

## 3. Change something and convert

Change a value in a group, for example a number. Then press **Convert to Synthea** in the toolbar. A panel opens with the Synthea module the diagram becomes, in three tabs:

- **Graph**: the module as a state graph.
- **JSON**: the file Synthea runs. **Download JSON** saves it.
- **Messages**: problems and hints the converter found. Each message comes with an explanation and what to do.

Your changes stay in your browser, and the modeler restores your files when you come back. **Save .bpmn** (or Ctrl/Cmd+S) downloads your diagram; a dot next to a file name in the list marks unsaved changes.

## 4. Draw a tiny pathway

Press **New** in the toolbar for an empty diagram. Then:

1. The empty diagram already contains a start event. It becomes the `Initial` state; there is nothing to configure.
2. Add an intermediate event after it and set its type to **Timer** (click the event, then set its type to Timer in the Timer group of the properties panel). In its **Delay** group choose a shape, a value and a unit, for example an exact value of 3 years.
3. Add an end event after the timer and connect the three elements with arrows.
4. Press **Convert to Synthea**. The result has three states: `Initial`, your delay and `Terminal`.

This is the smallest working module. More steps (conditions, branches, visits) follow the same pattern: one BPMN element, one state type, a few fields. The [modeling guide](modeling-guide.md) shows each of them.

## 5. Run it in Synthea

The converter output is a standard Synthea module. How to run the converted lung cancer modules in Synthea itself is described in the [lung cancer pathway README](../lung-cancer/README.md). The page [Check and convert](converter-overview.md) explains the command-line converter for your own files.

## Next

[Modeling guide](modeling-guide.md): every kind of step, one section each.
