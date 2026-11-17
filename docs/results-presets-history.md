# Results, presets and history

## Test results

The **Runs** screen opens on **Progress**. It shows startup/queue state, the current spec, completed/total files, and pass/fail/pending/skipped counts from completed specs. Individual test details and artifacts replace the live file list after the full run finishes. Counts update at spec boundaries, rather than during each test. Stopped runs retain their last observed progress without claiming incomplete files passed.

**Raw output** contains the full terminal controls, including follow, copy and search. Ctrl/Cmd+F switches to that tab and opens search. The chosen display tab is retained during the app session; new sessions default to Progress. Complete logs are saved regardless of the selected tab.

Live events use Cypress's `before:run`, `before:spec`, `after:spec` and `after:run` hooks. The adapter generates a temporary config wrapper inside the ignored run-log directory, loads the original config through Cypress's own loader, and preserves its reporter, async setup, node hooks, tasks and returned configuration. The original config file is not rewritten. The wrapper sends bounded summaries to a short-lived, authenticated loopback connection and is removed when the run finishes or stops. A failed progress connection never fails a user hook; unavailable progress has a Raw output shortcut. CLI-only Cypress distributions retain raw output and explain why structured progress is unavailable.

### Rerunning failed files

**Rerun failed specs** is available for completed runs, group details and saved History items. It includes files with final failures or spec errors such as compilation failures; a test passing after retries does not make its file fail. Each spec runs all of its tests again.

Group reruns keep exact file/profile/browser combinations, including split assignments and closed output rows. They retain names, notes and artifact-isolation preferences while using current project configuration and browser bindings. Every target is validated before anything is queued. Missing files, incomplete results or startup failures without identified files block this action with an explanation; use **Rerun** or **Rerun failed runs** for those cases. Aggregate results retain a separately bounded failed-file index, so detailed result truncation does not silently omit failures from a rerun.

Use the compact results button beside a completed run's output controls. It opens a dialog with actual passed, failed, pending and skipped test counts, duration, spec names and individual final test states. Retried tests show their attempt count; a test that passes on retry counts once as passed. The default filter shows failed specs and spec errors. Expand a spec to inspect test errors and open screenshots or its video using the system's default application. Missing/deleted artifacts report an error without changing the run result. **Copy results** creates a concise plain-text summary for sharing.

Cypress's Module API supplies the data while the existing project reporter continues to run. Full Cypress configuration and environment objects are discarded from captured results. Detailed capture is bounded to 500 specs, 2,000 tests and 1,000 screenshot paths with a shared text budget; a notice explains when details were limited. Aggregate totals remain complete. Stopping or failing to start Cypress can leave results unavailable; the output and saved log remain the source of diagnostics.

## Run presets

Open **Presets** from the main navigation. The scrollable table shows saved spec counts, profile and browser targets, and distribution mode. Search by preset, profile or browser, or filter to local/shared presets. Select a row, then choose **Load preset** to prepare the next run without starting Cypress. **New preset** saves the currently selected spec files, profiles, browsers, headed/headless choice, distribution mode and artifact-isolation preference under a name.

Choose **This checkout only** to save in ignored `.spec-runner/local.json`, or **Project configuration** to save in `spec-runner.config.json`. Shared saves show the usual reminder to commit the changed file. Shared edits are locked while runs are active or queued; local presets remain editable. Each scope supports up to 50 uniquely named presets.

Use **Edit** to rename a preset. Enable **Replace settings with the current selection** to update its run settings, or leave it off to retain them. **Delete** asks for confirmation before removing the preset from its own scope. Presets store browser IDs rather than local executable paths. Missing profiles, disabled browsers or missing specs mark a preset as needing an update and block loading with a list of what needs repair; the app does not silently substitute another environment. Select the intended current settings and replace the preset's settings to repair it.

## Recent run history

**History** lists the latest 100 completed, failed or stopped runs from this checkout across application restarts, including closed output tabs and groups. Search names/profiles/browsers or filter by status. Opening a saved run displays its test results immediately, with **Copy results**, artifact links, **Open log** and **Open log location** in the same dialog. Expand **Run details and spec files** for notes, the saved spec list, group and timestamp. Runs without structured results explain this and keep log shortcuts available. **Refresh history** shows loading progress and confirms completion; copy actions also show confirmation and can be retried if they fail.

**Rerun** submits the saved specs and target using today's project configuration and local browser binding. Missing specs/profiles/browsers must be repaired first. History never restarts a queue automatically. Individual runs are retained separately, including the subsets assigned by split mode; a history rerun repeats that saved subset only.

Metadata is stored locally in `spec-runner-logs/history.json` and each run's `run.json`, next to its existing complete log. These files stay out of Git with the log directory. They include result/test details and artifact paths, which may contain information from the tests themselves. They omit commands, profile environment values, raw Cypress configuration and a duplicate copy of terminal output. Logs and reporter outputs retain their existing contents.

**Forget** removes one list entry. **Clear history** resets the recent list after confirmation and can repair a corrupt index. Neither action deletes saved logs, result files or artifacts. Older entries leave the list when the 100-run limit is reached; their files also remain until manually removed. History save errors are reported in the History view and never alter Cypress's result. Runs created before this feature remain available as log files but are not reconstructed into history.
