# Project guidance

This is a generic Cypress companion package. Keep source code, examples, tests, UI text, metadata, and documentation independent of any client or organization. Use fictional example projects and reserved example domains. Do not add personal names, contact details, private project references, production addresses, credentials, or project-specific environment assumptions.

Keep consuming-project setup small. Distribute compiled application files through npm; build tooling belongs only to this repository. Shared project configuration and categories belong in the consuming repository. Preferences and environment values stay local.

Preserve project-local Cypress execution, validated literal spec paths, process-tree stopping, bounded live output, complete log streaming, explicit shared saves, and commit reminders. Run `pnpm build` and `pnpm test` before proposing changes. Check the packed npm artifact when changing distribution or launch behavior.
