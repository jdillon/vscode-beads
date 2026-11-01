> Author: Codex; 2026-10-31; branch: jdillon/issue-98-events-api-exploration.

# Beads events and HTTP API: shelved implementation checkpoint

**Paused at the maintainer's request. Draft only; not ready to merge or release.**
This checkpoint preserves the first implementation pass for [the events/HTTP API request (#98)](https://github.com/jdillon/vscode-beads/issues/98).
Resume only when the maintainer asks. Publishing this checkpoint does not approve further implementation, installation, migration, or release.

The implementation was developed against released Beads 1.3.0. The branch starts
from `95ae7dc` (close-reason support); it has not been rebased onto newer main during
shelving. Revalidate upstream release contracts and reconcile main when resuming.
Do not interpret September research as evidence of the latest October release.

## Intended value and current choices

Replace direct database reads with supported Beads interfaces, and detect external
changes in embedded projects as well as server projects. Events invalidate views;
authoritative reads still determine their contents. Periodic refresh covers writes
that do not emit journal events, including some sync/restore/direct-SQL paths.

The draft sets a stable Beads 1.3.0 minimum, uses HTTP reads for server/proxied
storage, retains CLI reads for embedded storage, and retains CLI writes everywhere
to preserve hooks. Treat the floor and migration UX as draft release decisions,
not a published support policy. No work depends on unreleased features.

Embedded HTTP remains deliberately excluded. The original issue forecasts future
support, while [released serve.go](https://github.com/gastownhall/beads/blob/v1.3.0/cmd/bd/serve.go)
describes a permanent refusal because embedded commits cannot satisfy the HTTP
transaction contract. Do not assume this discrepancy has been resolved. Verify
new released source on resumption; the CLI path makes a future HTTP change optional.

## Implementation map

| Area | Files and behavior |
| --- | --- |
| Compatibility and selection | `src/backend/BeadsBackend.ts`, `BeadsBackendFactory.ts`: stable version floor before mode selection; embedded CLI, known server/proxied HTTP; failed/unknown discovery stays an error. |
| HTTP ownership | `src/backend/beads-serve-session.ts`: lazy owned `bd serve --addr 127.0.0.1:0`, bounded stdout handshake, context/capability/readiness checks, pinned logical identity, bounded shutdown. |
| HTTP reads | `beads-http-client.ts`, `beads-http-backend.ts`: loopback-only requests, project header where supported, cancellation, typed failures, all-status pagination, detail/dependency/comment mapping, generation-safe in-flight deduplication. |
| Change notifications | `beads-change-source.ts`: framed CLI JSON/SSE, safe sequence checks, disabled/truncated handling, bounded retry, coalesced invalidation, new-client cursor reset, owned follower disposal. |
| CLI mutation/cache | `BeadsCommandRunner.ts`: invalidate on local writes, including uncertain failed responses; no automatic mutation replay/server-start recovery; prevent old reads repopulating caches; cancel commands on disposal. |
| Active project lifecycle | `BeadsProjectManager.ts`: activation generation checks, old backend/follower disposal, recoverable activation errors, periodic reconciliation and update-state notifications. |
| View refresh | `refresh-coordinator.ts`, `src/extension.ts`, `src/providers/`: awaitable background refresh with one trailing pass; backend identity checks; retain detail/comments during transient read failure. |
| User controls | `package.json`, extension command/status menu: explicit journal enablement confirmation; live/periodic/manual tooltip; 30-second default reconciliation, zero disables background updates. |

The journal is not enabled automatically. Enabling it changes the selected
project's Beads configuration; other long-running writers may need restarting.
The owned HTTP child exposes Beads' write-capable API on loopback even though this
extension uses only HTTP reads. Do not describe the child as a read-only server.

## Validation at shelving

On October 31, the following **49 focused tests passed using Bun 1.4.4**, without
installing project dependencies. Run each block in a separate process: the manager
tests mock modules, and combining all files under Bun can leak those mocks.

```sh
bun test src/backend/__tests__/BeadsCommandRunner.test.ts src/backend/__tests__/BeadsBackendFactory.test.ts src/backend/__tests__/refresh-coordinator.test.ts
bun test src/backend/__tests__/beads-project-manager.test.ts
bun test src/backend/__tests__/beads-change-source.test.ts
bun test src/backend/__tests__/beads-http-client.test.ts src/backend/__tests__/beads-http-backend.test.ts src/backend/__tests__/beads-serve-session.test.ts
```

Counts respectively: 15, 5, 11, 18. `git diff --check` also passed.
These checks do not establish TypeScript, configured Jest, or UI correctness.

Historical September 30 fixture evidence against installed Beads 1.3.0:

- Embedded: an independent CLI create succeeded while the journal follower was
  running, and the follower received the create. The owned follower was terminated.
- Proxied: readiness, list, detail, comments, and SSE delivery during an independent
  CLI create passed. HTTP disposal and scoped proxy stop were verified.
- Disposable fixture scripts/output were local ignored scratch, not portable PR
  evidence. Recreate those checks; do not require the original scratch directory.
- A Bun attempt at provider tests hit two loader errors resolving Jest's `vscode`
  mapping. Eight pure update tests passed, but provider coverage did not pass.

Not performed: locked dependency installation, full configured Jest suite, lint,
TypeScript check, extension/webview build, fixture-backed code-server browser
verification, screenshots, direct-server runtime parity, or final independent review.
Dependencies remain absent locally. No Beads/Dolt upgrade or shared-database
migration was performed for this checkpoint.

## Known gaps and review targets

- SQL backend files/tests and `mysql2` remain, although the factory no longer
  selects SQL. Remove them only after parity; do not leave three backends permanently.
- HTTP-to-CLI fallback is not implemented. HTTP failures remain visible. Decide
  whether a bounded same-version fallback is worth its complexity; identity,
  authentication, and migration failures must never silently select another target.
- SSE saturation retries with backoff and periodic full refresh; paged-events
  fallback is not implemented. Startup follows from zero and coalesces backlog,
  rather than first capturing a head through paged events. Measure large backlogs.
- Existing explicit `beads.refreshInterval` values now schedule full reads rather
  than cheap SQL change-token probes. Qualify migration/performance, especially
  explicit 3000-ms settings and large embedded workspaces; changing only the
  default does not change existing user settings.
- Status labels describe the notification transport, not proof that the last
  authoritative view load succeeded. Qualify degraded/stale UX and error visibility.
- Extend lifecycle coverage to activation failure, same-project reactivation,
  removal after activation error, status-request races, disposal during paging,
  and late local-write completion. Inspect async shutdown completion on deactivation.
- Extend provider tests to retained comments/details, genuine not-found clearing,
  hidden/reopened surfaces, and stale results after switching/recreating backends.
- Manual Dolt start/stop controls still need topology qualification. In particular,
  do not assume direct-server lifecycle commands manage proxied mode correctly.
- Git branch changes alone are not evidence of Beads branch drift. Released-source
  research found writers using main and SQL checkout being session-local; vc/branch
  commands reject proxy mode. No Git-HEAD restart was added. Establish a supported
  branch-switch workflow before adding detection; that acceptance remains unverified.

## How to continue

1. **Reestablish scope and checkout.** Read current project/canonical rules, inspect
   status and the draft PR, and preserve unrelated edits. Fetch via the configured
   origin and compare main before deciding merge/rebase strategy. Keep this checkpoint
   available. Do not resume implementation merely because this document was opened.
2. **Refresh released contracts.** Verify the issue, release tags, installed executable,
   [versioned OpenAPI](https://github.com/gastownhall/beads/blob/v1.3.0/internal/httpapi/spec/openapi.v0.yaml),
   and [journal documentation](https://github.com/gastownhall/beads/blob/v1.3.0/docs/reference/events-journal.md).
   Pay attention to capabilities, identity, embedded refusal, journal repairs,
   schema readiness, comments/dependencies, and truncation envelopes. Do not migrate
   real project data while investigating.
3. **Restore the normal validation environment.** Obtain any installation permission
   required by active rules, then run `bun install --frozen-lockfile`. This restores
   existing locked project dependencies; no global installs or Beads/Dolt upgrades
   are implied. Run `bun run test -- --runInBand`, `bun run lint`, and
   `bun run compile:quiet`; run the installed TypeScript compiler against
   `tsconfig.json` with no emit as well. Resolve failures before relying on Bun-only results.
4. **Qualify read parity with disposable releases.** Exercise embedded, direct-server,
   and proxied modes; multiple pages, all/custom statuses, configured infra exclusions,
   labels, typed dependencies both ways, comments, close reasons, empty results,
   malformed/omitted fields, invalid/repeated cursors, identity/auth failures, and
   cancellation. No partially read generation should replace a good view.
5. **Qualify updates and recovery.** Cover journal off/on, external and local writes,
   unknown ops, fragmented UTF-8, duplicate/unsafe sequences, initial/midstream
   truncation, saturation, abrupt EOF, child restart, cursor reset after restore,
   and mutations bypassing the journal. Confirm bounded retry and no child/timer
   leaks or cross-project updates. Measure burst/backlog cost and convergence.
6. **Verify the user workflow.** Follow `.agents/skills/vscode-server/SKILL.md` and
   `docs/code-server-testing.md`. Use its isolated fixtures and Chrome DevTools MCP;
   preserve any other worktree's server ownership. Check Dashboard/Issues/Details,
   opt-in confirmation, tooltip status, external updates, hidden/reopened views,
   manual refresh, auto-refresh disabled, and project switching. Capture and inspect
   screenshots. Stop only the environment owned by this test run.
7. **Finish the migration and review.** Resolve fallback/settings policy, remove SQL
   and its unused dependencies after parity, update the lockfile and docs, and obtain
   independent review. Re-run affected checks. Keep the PR draft until acceptance
   is complete; merging/releasing is a separate maintainer decision.

Completion requires normal build/tests/lint/typecheck, runtime parity/recovery,
browser evidence, cleanup and review. A passing focused test count is insufficient.

Disposal: retain this dated checkpoint while the draft is shelved. Before merge,
move only validated architectural/setup guidance into maintained docs and remove
or archive this temporary continuation record.
