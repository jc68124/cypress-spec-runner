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
    "specPattern": ["cypress/e2e/**/*.cy.{js,jsx,ts,tsx}"],
    "excludeSpecPattern": ["**/node_modules/**", "**/__snapshots__/**"],
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

Choose the project's browser list in **Settings → Available browsers**, then save and commit `spec-runner.config.json`. The optional `browsers` field accepts `chrome`, `electron`, `edge`, and `firefox`; keep at least one and do not repeat entries. Existing configurations without this field continue to allow all four.

Run controls and the personal preferred-browser setting show only the saved project choices. If a previously selected browser is removed, the runner selects the first enabled browser. Cypress uses the selected browser's local installation; configure the list to match what your team supports.

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

The **Runs** view keeps independent tabs with each run's profile, browser, state, elapsed time, output, command, and saved log. Start another run using the sidebar or **New run**. Each submission captures the specs and shared runner settings at submission time; changing the next selection does not alter submitted runs. Local environment-file values are read when the queued run actually starts. Project files remain in the checkout, so edits to Cypress configuration or test code still apply when Cypress reads those files.

**Cancel queued run** prevents a waiting run from starting. **Stop run** stops only that tab's process tree. Completed, failed, stopped, and cancelled tabs stay until closed; closing a tab frees its visible history and retains its log files. The app supports up to 50 open run tabs to bound memory. Tabs and queues are session-only. Closing the app asks before stopping active runs and cancelling queued ones.

Shared configuration/category saves are locked while runs are active or queued. Run selections, browser/profile choices, and personal output preferences remain editable. After changing scheduling settings, save and commit the listed project files as usual.

### Run files and custom reporters

Each run uses its own `spec-runner-logs/<run-id>/` directory. The runner passes unique `screenshotsFolder`, `videosFolder`, and `downloadsFolder` values to Cypress while retaining other profile `--config` overrides. Tests should use `Cypress.config('downloadsFolder')` rather than a hard-coded download location.

Custom reporters and plugins may write to their own locations. Configure their output directory using `process.env.SPEC_RUNNER_ARTIFACTS_DIR` in your Cypress configuration, preserving the other reporter options, or use `${SPEC_RUNNER_ARTIFACTS_DIR}` in profile arguments supported by your reporter. `SPEC_RUNNER_RUN_ID` is also available. For example, a JUnit reporter can use `mochaFile=${SPEC_RUNNER_ARTIFACTS_DIR}/reports/result.xml`. These runtime values are generated per run; do not store absolute local paths or credentials in the shared configuration. A reporter/plugin that ignores those settings still needs its own output-isolation configuration before concurrent use.

## Custom launch options

Profiles have an optional JSON list of `args`, available under **Advanced arguments and environment variables**. Each item is a separate Cypress argument, for example `["--config", "video=false"]`. Arguments are passed directly without a shell. Choose flags supported by the project's installed Cypress version. The runner controls `--spec` and `--project`; profiles cannot override them. The app always runs end-to-end specs in this first release.

The optional profile `baseUrl` overrides the Cypress setting for that run. Leave it blank to use Cypress's own value. `configFile` is relative to the project root; `null` leaves Cypress's default discovery in place.

## Spec discovery and categories

The standard Cypress end-to-end pattern is the default. For custom layouts, set `specPattern` and `excludeSpecPattern` in Settings to match the Cypress configuration. The runner deliberately does not execute arbitrary Cypress configuration or setup hooks while displaying files. Literal relative spec paths are stored in categories; new files appear as uncategorised until assigned.

Categories can overlap. Unticking a category removes its files from the next selection, including shared files. Editing category assignments changes the shared file; selecting files for a run changes only local preferences. Missing assignments remain in the editor for repair and cannot be executed.

## Logs

Each run gets a unique timestamp/profile log inside its own `spec-runner-logs/<run-id>/` directory. Logs are streamed with disk backpressure and are flushed before the run finishes or Stop returns. Files are retained until manually deleted. After a run finishes or stops, **Open log** opens its existing file in your default application. The action is available after queued writes have finished; it does not ask you to save another copy. If the system cannot open the file, the app reports the error. Logs remain separate from the 500,000-character live output buffer. A write failure is reported without changing Cypress's exit result; if a log cannot be created, the run does not start.
