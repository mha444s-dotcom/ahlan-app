# Working on Ahlan

Keep the current application design, content, original category images, icons,
170 heritage records, 11 eras and all native Discover interactions intact unless
the user explicitly authorizes a change. Never use an iframe for Discover.

Source is `dist/`; deployment output is **only `release/ahlan/`**. Do not publish
the project directory, development inputs, backups, credentials or browser profiles.
Keep original rollback files local. Do not alter the user's Codex/VS Code data.

The user has requested automatic delivery of completed, tested application changes.
After the requested app work is finished, run:

`npm run ship -- --message "Clear description of the completed change"`

This checks files, tests, builds, runs actual Chrome, commits, pushes to the reviewed
`mha444s-dotcom/ahlan-app` main branch, and waits for Pages. Never trigger it on each
save or while work is incomplete. Respect any newer user instruction to avoid
publishing. Stop on any test/build/auth/push/deployment failure; report the failure.
Do not claim a successful deployment without checking the exact commit's Actions run
and the live URL. Local-only reports can stay ignored. Do not overwrite unrelated
unfinished changes. Never force push or rewrite published history.

`safer-app` is explicitly outside scope: do not read, modify, delete, push to,
configure, or otherwise operate on that repository.

`npm run test:ci` works on a clean checkout. `tests/discover-package.cjs` is an
additional historical local audit and requires ignored rollback snapshots; do not
pretend it runs in CI. Real-browser QA uses isolated profiles in ignored
`tests/browser-artifacts/`. No screenshots contain the user's personal browser data.
