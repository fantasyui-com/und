# und remaining work

Updated 2026-11-03. The target remains **3.0.0**; nothing has been published or
accepted by the human as a finished product. A Git commit preserves work; it does
not grant product acceptance or replace verification against the committed artifact.

## Saved foundation

- The main checkout contains the reviewed dependency-free CommonJS repair, the
  seven-method API, numeric revision ordering and conflict-preserving cleanup,
  operation ownership and exclusive publication repairs, and the learning website.
- The website provides Introduction, described Features, Docs, a real Playground,
  Tutorial and runnable Examples using the supplied local Bootstrap assets.
- The user-selected ISC license and original GPL historical fixture are retained.
- Native ESM modernization is implemented separately on local branch
  `wip/native-esm-20261103`. It is a checkpoint of unfinished work, not merged into
  `master`. Both branches descend from the original `4e3e90d` baseline; integrate
  deliberately after review rather than assuming a ready fast-forward.
- Private `.nt/` journals and evidence stay outside Git. Report acceptance,
  executable verification and human product acceptance remain separate decisions.

## Next: establish the missing browser observation

- [ ] Investigate the zero-byte acknowledgement-loss fixture with a known positive
  control in an owned disposable checkout. Two unchanged ESM browser runs observed
  one logical POST, one wire attempt and one correctly committed revision/UID, then
  `ERR_EMPTY_RESPONSE`; neither observed the required transparent wire retry.
  Classify the missing precondition before changing application code. Preserve
  both failed traces, and do not repeat the same trial or weaken its assertions.
- [ ] Once that precondition is established, complete the required U09/U14 browser
  checks against the candidate, including duplicate-write protection, uncertain
  outcomes, retained drafts, explicit read/reconciliation, reset and stale results.
  Reject a genuinely defective implementation and permit legitimate alternatives.
  Existing partial-body and Node intent/reset checks do not replace the missing
  full browser scenario. Retain actual render and keyboard inspection where needed.
- [ ] Obtain independent Lilith product review of the complete ESM candidate and
  its evidence. The isolated task T-008 remains blocked with paused report R-028;
  a Git checkpoint does not unblock it, reset attempts or authorize another retry.

## Finish native ESM integration and release verification

- [ ] Integrate the reviewed ESM candidate into the main checkout. Preserve
  `path`, `has`, `all`, `rev`, `get`, `put`, `clean`, errors, filesystem effects,
  CLI effects, sample-data ownership/cleanup, public consumers and all **37 core,
  21 website and 12 additional named obligations**. Keep functional correctness
  separate from native-ESM and house-preference conformance.
- [ ] Keep package exports, CLI, server, downloadable examples, documentation,
  tests and XML manifest consistent with the native ESM public API. Preserve
  historical sketches and frozen evaluator inputs; do not introduce a CommonJS
  facade to satisfy an obsolete loader or filename assumption.
- [ ] Run required tests, syntax checks, registered application verification and
  complete browser verification against the integrated artifact. Record its actual
  revision/content identity; historical receipts do not certify a changed HEAD.
- [ ] Verify a real locally packed archive's contents and consumers, including
  package import, bin and exact downloadable examples, without installation or
  network access. Earlier package checks copied the `npm pack --dry-run` file list;
  they did not exercise extraction of an actual tarball.
- [ ] Review migration/release documentation and obtain explicit human product
  acceptance. Keep 3.0.0 unchanged. Publication remains a separate authorized action.

## Known coverage limits to assess before broader support claims

- [ ] Exercise the declared Node >=22 range on appropriate available runtimes, or
  explicitly resolve the support declaration. Actual runs currently use Node
  26.11.1; Node 22/24 have not been executed. Do not install runtimes implicitly.
- [ ] Decide which additional browser/accessibility checks are needed for release;
  only Chrome 146.0.7680.76 has recorded browser execution. Screen-reader
  certification and other browsers are unverified, not established product defects.

Power-loss durability, hostile-process isolation, network filesystems, concurrent
cleanup/write safety, replication and performance guarantees remain outside the
verified contract. Do not turn these into promises or silently enlarge this release.
Missing deletion/views/upsert/replication APIs are documented limitations, not
accepted requirements to invent for this milestone.

## Evidence and fresh commit checks

The main journal at revision 66 records T-003/T-004 verified and R-014's independent
review. The ESM journal at revision 132 records T-008 blocked/R-028 paused. These
are pre-commit identities, not new acceptance events. See `BEHAVIOR.md`,
`docs/RELIABILITY.md`, `MIGRATION.md`, and `website/VALIDATION.md`. The ESM branch's
`VALIDATION.md` and `website/VALIDATION.md` describe its incomplete browser gate.

On 2026-11-03, fresh pre-commit checks on Node 26.11.1 passed:

- Main checkout: `npm test` **70 passed, zero skipped**; `npm run check` passed.
- ESM checkpoint: `npm test` **71 passed, zero skipped**; `npm run check` passed
  (29 maintained files). These suites overlap; their counts are not additive.

The whitespace check reports existing final blank lines in the frozen
`test/website-cli.test.cjs` (and its ESM copy). They were preserved to avoid
changing historical evaluator bytes during a commit-only task.

The registered gate and browser checks were not rerun for this commit-only task.
No implementation, test expectation, evaluator, nt task state or historical
evidence was changed. Only this TODO and the private-record ignore rule were added
before committing the existing work.

Local commit/checkpoint manifests and fresh test logs are retained under
`.git/und-checkpoints/20261103/` in the main repository. Detailed private ESM evidence
remains in its `.nt/drafts/R-028-implementation/` and `.nt/drafts/R-028-browser/`.
The previously retained full recovery checkpoint is
`/home/meow/AI/next-turn/local-checkpoints/und-esm-application-20261103T010627Z`.
