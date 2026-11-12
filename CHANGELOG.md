# @jc68124/cypress-spec-runner

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
