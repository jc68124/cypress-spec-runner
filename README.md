# Cypress Spec Runner

A configurable desktop companion for choosing Cypress specs, organizing categories, and running tests with project-specific environment profiles.

## Use in a Cypress project

Requires Node.js 22.12 or newer and an existing Cypress installation.

```sh
npm install --save-dev cypress-spec-runner
npx cypress-spec-runner init
npm run spec-runner
```

With pnpm, use `pnpm add -D cypress-spec-runner`, `pnpm exec cypress-spec-runner init`, and `pnpm spec-runner`.

The initializer creates project configuration, categories based on spec folders, a launch script, and Git ignore entries. Commit the files listed by the initializer. Other contributors only need to install the project's dependencies and supply their usual local environment values. The published package includes the built interface; consuming projects do not need frontend build tools. Electron downloads its runtime on first launch if necessary.

Open **Settings** to configure project names, run profiles, base URLs, local environment files, extra Cypress arguments, and spec patterns. Shared saves show a reminder listing the files to commit. Browser choices, selections, and output preferences are stored locally per checkout.

## Run tests

- Select categories or individual specs; overlapping categories count a file once.
- Use **View specs** to adjust a run selection, or **Edit category** to change shared assignments.
- Choose a profile and browser, then start the run. **Stop run** stops its child processes.
- The output view keeps the latest 500,000 characters. Complete plain-text logs are saved in `spec-runner-logs/`; use **Save full log** after a run finishes or stops.

The runner uses the selected project's Cypress version, plugins, and reporters. It does not add environment flags, recording options, or project-specific services automatically. Configure those through profiles when needed. Custom include/exclude patterns must agree with the Cypress configuration; dynamic Cypress configuration is not executed merely to browse specs.

See [configuration and environment profiles](docs/configuration.md) for examples. `--project <folder>` selects a project explicitly when launching from another directory.

## Develop

```sh
pnpm install
pnpm build
pnpm test
node bin/cypress-spec-runner.cjs --project /path/to/a/cypress-project
```

`npm pack` builds a ready-to-install package. Run `npm run smoke` afterward to test it in a separate fixture project. CI checks Windows and Linux and uploads the package as an artifact. Publishing is a separate release step; no credentials belong in this repository.
