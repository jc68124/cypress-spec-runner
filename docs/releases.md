# Releases

Changesets manages npm versions and changelogs. This publishes the npm package; it does not deploy a hosted service or create desktop installers.

## One-time setup

1. In GitHub **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests**. Repository or organization policies may need to allow this option.
2. The npm scope must belong to an npm account or organization you can publish under. For a new package, publish the current version once from a clean checkout of `master` to create its npm settings:

   ```sh
   pnpm install --frozen-lockfile --ignore-scripts
   pnpm build
   pnpm test
   npm pack --ignore-scripts
   pnpm run smoke
   npm login
   npm publish --access public --provenance=false
   ```

   This first local publish uses your npm account and any required two-factor authentication; CI adds provenance on subsequent releases. Check the packed contents before publishing. Complete this setup before merging a generated version PR. If the workflow already tried to publish the initial version before setup, rerun it afterward.
3. In the npm package's **Settings → Trusted Publisher**, select GitHub Actions and enter:

   | Field | Value |
   | --- | --- |
   | Organization or user | `jc68124` |
   | Repository | `cypress-spec-runner` |
   | Workflow filename | `release.yml` |
   | Environment | Leave empty |
   | Allowed actions | Enable publishing with `npm publish` |

   The workflow uses a GitHub-hosted runner and OpenID Connect (OIDC), so no `NPM_TOKEN` secret is needed. The public package includes provenance. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the current npm settings.

## For each change

Run `pnpm changeset`, select the package and version bump, and write a brief user-facing summary. Commit the generated `.changeset/*.md` file with the implementation. Documentation-only changes do not need a package release.

Every push to `master` starts the [Release package workflow](../.github/workflows/release.yml). It calls the reusable validation workflow for Windows and Linux (plus the devcontainer when `.devcontainer/` changes), then opens or updates **Release Cypress Spec Runner**. This PR updates the package version and `CHANGELOG.md` and consumes the pending changesets. Review and merge it when ready. After the merged commit passes those same checks, the job publishes the new npm version and creates a GitHub release.

The release workflow triggers directly on `push` to `master`. Its publishing job depends on all validation jobs succeeding and checks out the exact pushed commit. Pull requests run the same validation workflow independently; pushes to `master` validate through the release workflow, avoiding duplicate CI runs. Failed checks, pull request runs, other branches, and commits superseded on `master` cannot publish. This workflow becomes active once `release.yml` is merged into the default branch. If publication fails, fix the npm trusted publisher settings if needed and rerun the failed release job in GitHub Actions. An already published version is skipped. Version PRs created with GitHub's built-in token may not trigger PR workflows; all checks run again after merge before publication.

`pnpm version-packages` previews the version changes locally and modifies files. `pnpm changeset status` shows the pending release without changing anything. `pnpm release` publishes unpublished versions and is intended for the release job, not for a local preview.
