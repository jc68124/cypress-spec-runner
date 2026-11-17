# Project configuration

Run `cypress-spec-runner init`, then use **Settings**. The runner saves shared settings in `spec-runner.config.json` and category definitions in `.spec-runner/categories.json`. Commit both files, the launch script in `package.json`, the package-manager lockfile, and Git ignore changes.

The app never commits or pushes files automatically. A save reminder identifies the files written by the app. Personal preferences are stored locally and do not trigger commit reminders.

**Individual specs** defaults to file name A–Z, with Z–A, recently edited, and oldest edited sorting also available. The choice is remembered locally per project and works with search and category/selection filters. Date sorting shows local file modification times, rather than Git commit dates; use **Refresh specs** after editing files. Files without an available date appear last.

## Example profiles

All example addresses and variables below are placeholders. This configuration can be used by any project.

```json
{
    "version": 1,
    "name": "Example project",
    "configFile": "cypress.config.ts",
    "envFile": ".env",
    "browsers": ["chrome", "electron"],
    "profiles": [
        {
            "id": "local",
            "name": "Local",
            "baseUrl": "http://localhost:3000",
            "args": [],
            "env": {}
        },
        {
            "id": "test",
            "name": "Test environment",
            "baseUrl": "${TEST_BASE_URL}",
            "args": [],
            "env": { "API_TOKEN": "${LOCAL_API_TOKEN}" }
        }
    ],
    "defaultProfile": "local"
}
```

Local `.env` file, excluded from Git:

```dotenv
TEST_BASE_URL=https://app.example.test
LOCAL_API_TOKEN=replace-locally
```

Environment settings are loaded when a run starts, so later edits apply to subsequent runs. Existing process environment values take priority over the local file. Profile variables then apply over those values; `${VARIABLE}` references must exist. The app's command preview leaves references unexpanded and does not display the local file contents. Output produced by tests themselves may still contain whatever the tests print.

Only variable references and non-sensitive values belong in shared configuration. If you change the local environment-file location, make sure that file is ignored by Git. Local environment files must resolve inside the project.

## Available browsers

Choose the project's browser list in **Settings → Available browsers**, then save and commit `spec-runner.config.json`. The optional `browsers` field accepts `chrome`, `electron`, `edge`, `firefox`, and IDs from `customBrowsers`; keep at least one and do not repeat entries. Existing configurations without this field continue to allow all four.

Run controls and the personal preferred-browser setting show only the saved project choices. If a previously selected browser is removed, the runner selects the first enabled browser. Cypress uses the selected browser's local installation; configure the list to match what your team supports. Use **Add custom browser** for a friendly name and either a Cypress browser/channel (for example `chromium` or `chrome:beta`) or a local executable binding. Shared entries go in `customBrowsers`:

```json
"browsers": ["electron", "beta", "portable"],
"customBrowsers": [
    { "id": "beta", "name": "Chrome Beta", "channel": "chrome:beta" },
    { "id": "portable", "name": "Portable Chromium" }
]
```

Save the shared entry first. For an entry without `channel`, open **Personal preferences → Local browser executables**, browse to the installed browser, and save its path. Absolute paths stay in the ignored `.spec-runner/local.json` file and can differ between computers. Browser/channel names are passed to Cypress without a shell; Cypress decides which installed browser can launch. On macOS an `.app` bundle can also be selected. Names remain visible in run lists, matrix cells, results and history; the command preview shows the launch target. Queued runs keep their captured binding; reruns resolve the current binding. Missing executables fail validation with a Settings hint before a batch starts.

## Concurrent runs and environment limits

Use **Settings → Run scheduling** to set `maxConcurrentRuns` (default **2**). Each profile has its own `maxConcurrentRuns` (default **1**). Values must be integers from 1 to 8. Existing configurations get these defaults without an initializer migration.

Profiles that target the same environment can share a concurrency group. Add a group with a name and combined run limit, then assign the relevant profiles to it. For example:

```json
{
    "maxConcurrentRuns": 2,
    "concurrencyGroups": [
        { "id": "staging", "name": "Shared staging", "maxConcurrentRuns": 1 }
    ]
}
```

In each applicable profile, set `"maxConcurrentRuns": 1` and `"concurrencyGroup": "staging"`. Profiles without a shared group omit `concurrencyGroup`. The overall, profile, and group limits must all allow a run to start. A waiting profile does not block an unrelated profile that has capacity. Limits apply to this application instance; coordinate other tools or app instances separately when they use the same systems.

Use **Configure run** to select one or more profiles and browsers. The default **Repeat all specs on every target** mode runs the full selection on every profile/browser combination. Two profiles and two browsers create four runs, each using all selected specs. The sidebar shows the complete plan before **Start runs**. Applying configuration updates local preferences; cancelling the dialog discards its draft. The whole batch is validated and capacity reserved before any combination starts.

The **Runs** view keeps group totals and the current target above the terminal. Pencil icons beside runs and groups in the run list edit names and notes; the group details menu contains **Rerun group** and **Rerun failed**. Names and notes are session-only and remain editable during runs; they do not change execution settings. **Run command and artifacts** opens a dialog with the complete command, notes, paths and diagnostics. Narrow windows use a run selector and **Manage runs** dialog to keep the terminal tall. Start another batch using the panel on the right. Each submission captures the specs and shared runner settings at submission time; changing the next selection does not alter submitted runs. Local environment-file values are read when the queued run actually starts. Project files remain in the checkout, so edits to Cypress configuration or test code still apply when Cypress reads those files.

**Cancel queued run** prevents a waiting run from starting and immediately removes its row. Its cancellation stays in the group totals while other rows remain. **Stop run** stops only that run's process tree and retains its output for inspection. Completed, failed and stopped runs stay until closed; closing a row frees its visible history and retains its log files. Closing or cancelling the last row removes the empty group and its session-only results automatically. **Close group** removes a finished group's rows and summary together. The app supports up to 50 retained/queued runs and 50 groups to bound memory. Run history and queues are session-only. Closing the app asks before stopping active runs and cancelling queued ones.

Shared configuration/category saves are locked while runs are active or queued. Run selections, browser/profile choices, and personal output preferences remain editable. After changing scheduling settings, save and commit the listed project files as usual.

### Sharing work across targets

Choose **Configure run → Split specs across targets** to divide the selected spec files between profile/browser pairs. For example, 100 specs, two profiles and two browsers create four runs with 25 files each, for 100 total spec executions rather than 400. Each file runs once and keeps all of its tests together. Select profiles where these specs are interchangeable: a split run does not verify every spec in every environment or browser.

The split is deterministic and balanced by file count, not estimated duration. Targets alternate between profiles first so smaller selections can use independent profile slots; targets with no files are skipped. A large single spec is not split further. Existing overall, profile and shared-environment limits still control actual concurrency, so increase only the limits your environments support. This uses ordinary project-local Cypress processes without requiring Cypress Cloud parallelization.

The dialog shows run counts and the range of specs per run before applying. The sidebar and group details identify split mode, and matrix cells show assigned spec counts. The distribution mode is a local preference. Run submissions capture their assignments, so changing the next plan does not change queued runs.

### Matrix overview

Use **View matrix** on a run group for a profile × browser table. Select an available cell to open that run. Cancelled and closed rows retain their result with a Row removed label; combinations not included in a partial rerun are marked Not included. The overview opens in a dialog so it does not reduce terminal space.

### Rerunning results

Once a run finishes, **Rerun** creates a fresh run for the same specs, profile and browser. **Rerun group** repeats every original combination, including cancelled combinations; **Rerun failed** repeats only failed combinations, even if their output rows were closed. Failed pairs are preserved exactly rather than expanded into another full matrix. Names and notes carry forward, current shared project settings are used, and original results remain unchanged. Split-mode reruns retain the exact spec assignment for every selected target, including targets whose rows were closed; they never redistribute the full selection. The original artifact-isolation preference is kept, and logs always use a new run folder. Removed profiles or specs must be fixed before the whole rerun batch can start.

### Run files and custom reporters

Each run uses its own `spec-runner-logs/<run-id>/` directory. By default, the runner passes unique `screenshotsFolder`, `videosFolder`, and `downloadsFolder` values to Cypress while retaining other profile `--config` overrides. Turn off **Configure run → Use separate artifact folders per run** to preserve Cypress/profile artifact paths instead. This local preference is captured for every queued combination and retained by reruns. Concurrent runs using shared paths may overwrite artifacts; complete logs remain separate in either mode. Tests should use `Cypress.config('downloadsFolder')` rather than a hard-coded download location.

Custom reporters and plugins may write to their own locations. Configure their output directory using `process.env.SPEC_RUNNER_ARTIFACTS_DIR` in your Cypress configuration, preserving the other reporter options, or use `${SPEC_RUNNER_ARTIFACTS_DIR}` in profile arguments supported by your reporter. `SPEC_RUNNER_RUN_ID` is also available. For example, a JUnit reporter can use `mochaFile=${SPEC_RUNNER_ARTIFACTS_DIR}/reports/result.xml`. These runtime values are generated per run; do not store absolute local paths or credentials in the shared configuration. A reporter/plugin that ignores those settings still needs its own output-isolation configuration before concurrent use.

## Custom launch options

Argument arrays and environment objects use a monospace JSON editor. Valid JSON formats automatically with four spaces when leaving the field or saving; **Format JSON** or Ctrl/Cmd+Shift+F also formats it. Enter preserves the current line’s indentation and adds one level after an opening object/array bracket. Enter between matching brackets creates a blank indented line and places the closing bracket on its own line; brackets inside strings do not trigger extra indentation. Composing text and modified Enter shortcuts are left to the platform. Tab inserts four spaces or indents selected lines, Shift+Tab outdents, and Escape then Tab leaves the editor. Syntax and expected array/object shapes are checked inline; malformed text stays available for repair and cannot be saved. Advanced discovery patterns stay one pattern per line, with surrounding whitespace removed on blur/save.

Profiles have an optional JSON list of `args`, available under **Advanced arguments and environment variables**. Each item is a separate Cypress argument, for example `["--config", "video=false"]`. Arguments are passed directly without a shell. Choose flags supported by the project's installed Cypress version. The runner controls `--spec` and `--project`; profiles cannot override them. The app always runs end-to-end specs in this first release.

The optional profile `baseUrl` overrides the Cypress setting for that run. Leave it blank to use Cypress's own value. `configFile` is relative to the project root; `null` leaves Cypress's default discovery in place.

## Spec discovery and categories

Discovery reads `e2e.specPattern` and `e2e.excludeSpecPattern` from the exported Cypress configuration, using Cypress defaults when absent. JavaScript and TypeScript exports, `defineConfig`, local constants and object spreads are supported. Project imports and setup hooks never execute while browsing. Patterns assembled through imports, environment values or functions need the collapsed **Settings → Advanced discovery override** section; unresolved configurations show a message rather than guessing. Existing saved overrides remain active until you disable the override and save. Refresh specs picks up config edits. A small amber indicator on **Refresh specs** appears when added/edited/removed spec files or discovery settings differ from the displayed list. The app checks discovery and file modification metadata every five seconds and stops checking once changes are detected until a successful refresh or shared save loads the updated project. It does not execute Cypress configuration or refresh selections automatically. Hover for an explanation; while runs are active or queued the indicator remains visible but refresh stays locked. Refresh clears the indicator and updates spec edit dates. Unmatched helper-file edits do not mark the spec list as changed. Literal relative spec paths are stored in categories; new files appear as uncategorised until assigned.

Categories can overlap. Unticking a category removes its files from the next selection, including shared files. Editing category assignments changes the shared file; selecting files for a run changes only local preferences. Missing assignments remain in the editor for repair and cannot be executed.

## Logs

**Copy output** copies the selected run's complete plain-text log, rather than only the visible 500,000-character tail. During a live run it first flushes pending writes and copies a snapshot up to that point. Clipboard copies are limited to 20 MiB to keep memory bounded; oversized logs report an error rather than silently truncating. Use the saved file for larger logs. Copying includes ANSI-free text; run names and notes are not inserted into Cypress output.

The small **Find output** icon or Ctrl/Cmd+F opens literal, case-insensitive search in the selected run’s visible history. Enter/Shift+Enter or the arrow buttons moves between highlighted matches; Escape closes search. The first 1,000 matches are highlighted to keep large logs responsive. Search does not alter ANSI formatting or copied output. Older text remains in the full saved log.

Ticking **Follow output** jumps to the bottom and resumes following. Scrolling upward in the terminal pauses **Follow output** so new lines do not move your reading position. Scrolling back to the bottom, or ticking **Follow output**, resumes it. This is a local preference.

Each run gets a unique timestamp/profile log inside its own `spec-runner-logs/<run-id>/` directory. Logs are streamed with disk backpressure and are flushed before the run finishes or Stop returns. Files are retained until manually deleted. After a run finishes or stops, **Open log** opens its existing file in your default application. The action is available after queued writes have finished; it does not ask you to save another copy. If the system cannot open the file, the app reports the error. **Open log location** reveals the saved log in the system file manager, including while the run is active once its log exists. The toolbar uses compact icons; hover or focus them for labels. Logs remain separate from the 500,000-character live output buffer. The limit is explained before output begins and inside the command/artifacts dialog rather than occupying a permanent terminal footer. A write failure is reported without changing Cypress's exit result; if a log cannot be created, the run does not start.

## Editing while runs are active

While runs are active or queued, shared project settings, category editing, and spec refresh are locked. Settings shows a notice explaining the lock and linking to Runs. Category edit/create controls and **Refresh specs** explain the lock in their hover titles, without a permanent banner on the Categories screen or spec-selection dialog. Finish or stop active runs and cancel queued runs to unlock editing. Spec selection and personal preferences remain available throughout.

## Completion notifications

Enable **Settings → Personal preferences → Notify when a run group finishes** for one desktop summary after the whole group finishes, including passed/failed and any stopped/cancelled totals. It defaults off, is saved locally, and remains editable while runs are active. Use **Send test notification** to verify desktop delivery. Clicking a notice brings the app forward and opens an available failed result first.

Renaming a finished group does not send another notice, enabling notifications does not replay old results, and all-cancelled/stopped groups or app shutdown do not send completion alerts. Notification failures are reported separately and never change Cypress results. Delivery depends on operating-system notification settings.

Notifications use the friendly **Cypress Spec Runner** name. On Windows, the process notification identity is set before any window opens. Enabling notifications registers a per-user Start menu entry and notification display name/icon under `HKCU\Software\Classes\AppUserModelId\CypressSpecRunner.Desktop`. No administrator rights are required. The entry opens the project most recently used with notifications enabled; disabling notifications leaves this launcher in place.

## Exit codes and result totals

The runner launches the consuming project's Cypress through its Module API in a separate Node process, parsing arguments with Cypress's own `cli.parseRunArguments`. Existing configuration, reporters and reporter options are retained; no setup hook or additional reporter installation is needed. The adapter returns process success/failure while structured results provide actual test totals, durations, final test states and retry attempts. Startup/configuration failures and stopped runs may have no completed test summary and explain this in **Test results**; they are never reported as zero failed tests.

CLI-only Cypress distributions without a Module API entry still run through their CLI and show results as unavailable. Version-aware POSIX flags remain in CLI arguments for compatible versions. Process exit codes are never interpreted as failed-test counts. See [Cypress Module API](https://docs.cypress.io/app/references/module-api).

For result dialogs, saved presets and persistent run history, see [Results, presets and history](results-presets-history.md).
