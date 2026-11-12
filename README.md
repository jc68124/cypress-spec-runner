# Cypress Spec Runner

A configurable desktop companion for choosing Cypress specs, organizing categories, and running tests with project-specific environment profiles.

## Use in a Cypress project

Requires Node.js 22.12 or newer and an existing Cypress installation.

```sh
npm install --save-dev @jc68124/cypress-spec-runner
npx cypress-spec-runner init
npm run spec-runner
```

With pnpm, use `pnpm add -D @jc68124/cypress-spec-runner`, `pnpm exec cypress-spec-runner init`, and `pnpm spec-runner`.

The initializer creates project configuration, categories based on spec folders, a launch script, and Git ignore entries. Commit the files listed by the initializer. Other contributors only need to install the project's dependencies and supply their usual local environment values. The published package includes the built interface; consuming projects do not need frontend build tools. Electron downloads its runtime on first launch if necessary.

Open **Settings** to configure project names, run profiles, base URLs, local environment files, available browsers, extra Cypress arguments, and spec patterns. Shared saves show a reminder listing the files to commit. Browser choices, selections, and output preferences are stored locally per checkout.

## Run tests

- Select categories or individual specs; overlapping categories count a file once.
- Use **View specs** to adjust a run selection, or **Edit category** to change shared assignments.
- Choose a profile and browser, then start the run. **Stop run** stops its child processes.
- The output view keeps the latest 500,000 characters. Complete plain-text logs are saved in `spec-runner-logs/`; use **Open log** after a run finishes or stops to open the saved file in your default application.

The runner uses the selected project's Cypress version, plugins, and reporters. It does not add environment flags, recording options, or project-specific services automatically. Configure those through profiles when needed. Custom include/exclude patterns must agree with the Cypress configuration; dynamic Cypress configuration is not executed merely to browse specs.

See [configuration and environment profiles](docs/configuration.md) for examples. `--project <folder>` selects a project explicitly when launching from another directory.

## Develop

```sh
pnpm install
pnpm build
pnpm test
node bin/cypress-spec-runner.cjs --project /path/to/a/cypress-project
```

### Devcontainer

Open this repository in VS Code and choose **Dev Containers: Reopen in Container**. The container supplies Node.js 24, the pinned pnpm version, Linux desktop libraries, and a browser-accessible desktop. First-time setup installs dependencies and builds the app. `node_modules` stays in a container volume, separate from host dependencies.

Run `pnpm build` and `pnpm test` from the container terminal. For interactive desktop testing, open forwarded port **6080** from VS Code's Ports panel and connect using the desktop feature's default password, `vscode`. Then launch against a Cypress project that is available inside the container:

```sh
SPEC_RUNNER_PROJECT=/workspaces/example-project node node_modules/electron/cli.js --no-sandbox .
```

The `--no-sandbox` flag is for this isolated development container; normal project launch commands are unchanged. A Windows host path must be mounted or the project cloned inside the container before using it here. CI also builds the devcontainer and runs the project checks inside it.

`npm pack` builds a ready-to-install package. Run `npm run smoke` afterward to test it in a separate fixture project. CI checks Windows and Linux and uploads the package as an artifact.

## Releases

Run `pnpm changeset` for a user-facing change and commit the generated file. After merging to `master`, CI opens a version and changelog PR. Merging that PR publishes `@jc68124/cypress-spec-runner` to npm after all checks pass. See [one-time npm publishing setup](docs/releases.md).
