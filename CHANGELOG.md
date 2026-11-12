# @jc68124/cypress-spec-runner

## 0.4.0

### Minor Changes

- a76a0e4: Configure multiple profiles and browsers in a run dialog and submit every combination as one validated batch. Group runs with matrix summaries, editable run names and notes, and preserved target details. Existing concurrency limits control running and queued combinations.

  Remove cancelled queued runs immediately while retaining their batch totals. Add full plain-text output copying, and pause output following when scrolling up with automatic resume at the bottom.

- 8b4ff9f: Add alphabetical and local modification-date sorting to Individual specs. Default to file name A–Z, remember the sort choice per project, and show edit times when sorting by date. Refresh specs updates the timestamps.

### Patch Changes

- 8a023e1: Explain why shared settings, category editing, and spec refresh are unavailable while runs are active or queued. Show run counts and an action to view runs, and make disabled form controls visibly read-only. Spec selection and personal preferences remain available.
- 4a1b64a: Use Cypress Spec Runner as the desktop display name and close-confirmation title instead of the scoped npm package name.

## 0.3.0

### Minor Changes

- abfd42c: Run multiple profiles in separate tabs with overall, per-profile, and shared-environment concurrency limits. Queue blocked runs, cancel or stop runs independently, retain completed tabs, and isolate standard Cypress artifacts and full logs per run. Add scheduling settings, runtime artifact-directory variables for custom reporters, and bounded run history.

### Patch Changes

- bee4be8: Ship a checklist and play icon for the desktop window and taskbar on Windows and Linux, and the Dock on macOS. Projects need no additional configuration.

## 0.2.0

### Minor Changes

- 39431f1: Configure available project browsers in Settings and keep run controls and personal browser preferences within that list. Existing configurations continue to allow all supported browsers.

  Replace Save full log with Open log, which opens the automatically saved run log in the default application and reports file-opening errors.

### Patch Changes

- 243bb32: Update glob and its pattern-matching dependencies used for spec discovery.
