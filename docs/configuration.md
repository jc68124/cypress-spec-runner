# Project configuration

Run `cypress-spec-runner init`, then use **Settings**. The runner saves shared settings in `spec-runner.config.json` and category definitions in `.spec-runner/categories.json`. Commit both files, the launch script in `package.json`, the package-manager lockfile, and Git ignore changes.

The app never commits or pushes files automatically. A save reminder identifies the files written by the app. Personal preferences are stored locally and do not trigger commit reminders.

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

## Custom launch options

Profiles have an optional JSON list of `args`, available under **Advanced arguments and environment variables**. Each item is a separate Cypress argument, for example `["--config", "video=false"]`. Arguments are passed directly without a shell. Choose flags supported by the project's installed Cypress version. The runner controls `--spec` and `--project`; profiles cannot override them. The app always runs end-to-end specs in this first release.

The optional profile `baseUrl` overrides the Cypress setting for that run. Leave it blank to use Cypress's own value. `configFile` is relative to the project root; `null` leaves Cypress's default discovery in place.

## Spec discovery and categories

The standard Cypress end-to-end pattern is the default. For custom layouts, set `specPattern` and `excludeSpecPattern` in Settings to match the Cypress configuration. The runner deliberately does not execute arbitrary Cypress configuration or setup hooks while displaying files. Literal relative spec paths are stored in categories; new files appear as uncategorised until assigned.

Categories can overlap. Unticking a category removes its files from the next selection, including shared files. Editing category assignments changes the shared file; selecting files for a run changes only local preferences. Missing assignments remain in the editor for repair and cannot be executed.

## Logs

Each run gets a unique timestamp/profile log under `spec-runner-logs/`. Logs are streamed with disk backpressure and are flushed before the run finishes or Stop returns. Files are retained until manually deleted. After a run finishes or stops, **Open log** opens its existing file in your default application. The action is available after queued writes have finished; it does not ask you to save another copy. If the system cannot open the file, the app reports the error. Logs remain separate from the 500,000-character live output buffer. A write failure is reported without changing Cypress's exit result; if a log cannot be created, the run does not start.
