# Results, presets and history

## Test results

Use the compact results button beside a completed run's output controls. It opens a dialog with actual passed, failed, pending and skipped test counts, duration, spec names and individual final test states. Retried tests show their attempt count; a test that passes on retry counts once as passed. The default filter shows failed specs and spec errors. Expand a spec to inspect test errors and open screenshots or its video using the system's default application. Missing/deleted artifacts report an error without changing the run result. **Copy results** creates a concise plain-text summary for sharing.

Cypress's Module API supplies the data while the existing project reporter continues to run. Full Cypress configuration and environment objects are discarded from captured results. Detailed capture is bounded to 500 specs, 2,000 tests and 1,000 screenshot paths with a shared text budget; a notice explains when details were limited. Aggregate totals remain complete. Stopping or failing to start Cypress can leave results unavailable; the output and saved log remain the source of diagnostics.

## Run presets

The **Run preset** selector and **Presets** button are above the next-run controls. Save the selected spec files, profiles, browsers, headed/headless choice, distribution mode and artifact-isolation preference under a name. Loading only prepares the next run and never starts Cypress.

Choose **This checkout only** to save in ignored `.spec-runner/local.json`, or **Project configuration** to save in `spec-runner.config.json`. Shared saves show the usual reminder to commit the changed file. Shared edits are locked while runs are active or queued; local presets remain editable. Each scope supports up to 50 uniquely named presets.

Use **Edit** to rename a preset. Enable **Replace settings with the current selection** to update its run settings, or leave it off to retain them. **Delete** removes the preset from its own scope. Presets store browser IDs rather than local executable paths. Missing profiles, disabled browsers or missing specs block loading and list what needs repair; the app does not silently substitute another environment. Select the intended current settings and replace the preset's settings to repair it.

## Recent run history

**History** lists the latest 100 completed, failed or stopped runs from this checkout across application restarts, including closed output tabs and groups. Search names/profiles/browsers or filter by status. A saved run shows its label, group, actual target, timestamps, duration and test totals when available. Open it for notes, the saved spec list, results, **Open log** and **Open log location**.

**Rerun with current settings** submits the saved specs and target using today's project configuration and local browser binding. Missing specs/profiles/browsers must be repaired first. History never restarts a queue automatically. Individual runs are retained separately, including the subsets assigned by split mode; a history rerun repeats that saved subset only.

Metadata is stored locally in `spec-runner-logs/history.json` and each run's `run.json`, next to its existing complete log. These files stay out of Git with the log directory. They include result/test details and artifact paths, which may contain information from the tests themselves. They omit commands, profile environment values, raw Cypress configuration and a duplicate copy of terminal output. Logs and reporter outputs retain their existing contents.

**Forget** removes one list entry. **Clear history** resets the recent list after confirmation and can repair a corrupt index. Neither action deletes saved logs, result files or artifacts. Older entries leave the list when the 100-run limit is reached; their files also remain until manually removed. History save errors are reported in the History view and never alter Cypress's result. Runs created before this feature remain available as log files but are not reconstructed into history.
