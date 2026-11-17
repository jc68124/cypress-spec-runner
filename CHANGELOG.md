# @jc68124/cypress-spec-runner

## 0.9.0

### Minor Changes

- 9bdeafc: Show a live spec-progress view by default, keep raw output on a separate tab, and rerun only failed spec files on their original profile/browser targets from runs, groups and history.

## 0.8.1

### Patch Changes

- 1929e34: Open history directly to test results, add a searchable presets screen, shorten rerun labels, and provide consistent loading and completion feedback for app actions.

## 0.8.0

### Minor Changes

- 4c874d2: Add named custom browser channels and machine-local executable bindings, structured Cypress test results with retry/artifact details, local or shared run presets, and recent run history across application restarts. Preserve existing reporters, run limits and captured queued targets while keeping result dialogs compact and local data out of shared configuration.

## 0.7.0

### Minor Changes

- 5ea10b7: Add an optional split-specs mode that shares selected files between profile/browser targets instead of repeating the whole suite. Show the distribution in setup and run details, keep scheduling limits and per-target rerun assignments, preserve JSON indentation on Enter, and indicate pending spec changes on Refresh specs without automatically changing selections.

## 0.6.0

### Minor Changes

- dfddd92: Give run output more vertical space with a compact project header, terminal toolbar, sidebar edit actions, and dialogs for group details, commands and artifacts. Remove redundant jump/new-run actions and empty run groups. Explain category editing locks on the affected controls instead of a permanent banner. Add a log-location shortcut, optional artifact folder isolation, friendly notification branding, and version-aware POSIX Cypress exit codes without inferring failed-test totals.

## 0.5.0

### Minor Changes

- 14307ca: Read spec patterns automatically from standard Cypress JS/TS configuration without executing project code or setup hooks. Keep manual overrides in a collapsed advanced section, preserve existing overrides, and explain configurations that need an explicit override.
- ea3b841: Add opt-in desktop notifications when an entire run group finishes, with passed/failed totals and a test notification in personal preferences. Suppress repeated, cancellation-only and shutdown alerts; report notification errors without affecting test results. Register the required per-user Windows notification shortcut when enabled.
- 8e3accc: Make argument-array and environment-object editors format valid JSON automatically on blur and save. Add four-space Tab/Shift+Tab indentation, an accessible Escape-then-Tab exit, formatting shortcuts and inline syntax/shape errors. Invalid values never reach the saved project config.
- 15eb3e7: Add a compact profile-by-browser matrix overview with direct navigation to run output. Retain cancelled/closed results and distinguish combinations not included in a partial rerun.
- 2f2bb36: Find text in selected run output with Ctrl/Cmd+F, literal case-insensitive highlights, next/previous navigation and Escape to close. Add Jump to latest to resume output following without changing the saved log.
- 71d808a: Rerun a completed run, an entire group, or only failed target combinations without rebuilding the selection. Preserve run labels and notes, use current project settings, and retain exact failed combinations even after their rows are closed.

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
