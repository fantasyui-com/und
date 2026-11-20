# und 3.0.0 behavior contract

This contract originated in the independently prepared migration from commit
4e3e90d3ab99e842227f3c5548e4299905fefb4c. The user-approved numeric revision
ordering, filename tie-break and conflict-preserving cleanup are now installed
in the authorized checkout. This document specifies behavior; execution evidence
and human product acceptance are separate. The current ownership/publication
contract is in docs/RELIABILITY.md. Historical trial reports remain unchanged.

## Published and unfinished interfaces

The supported migration target is the CommonJS factory in index.js, with the
path, has, all, rev, get, put and clean methods implemented by core.js. Calling
the factory does not touch storage. Call and await path(location) before using it.
Factory configuration remains accepted; this milestone invents no configuration API.

index.mjs and util.mjs are retained unfinished get/set sketches. test.mjs and
old-test.js are retained historical, syntactically invalid sketches of additional
APIs. They are not production tests. Do not claim upsert, conflict enumeration,
views, deletion, replication or synchronization are implemented. The migration
documentation must explicitly distinguish these sketches from the published API.

## Storage behavior

- path(location) creates missing directories recursively. It rejects an invalid
  location, a file collision or a symlink storage location. Other methods reject
  until storage has been configured.
- A record ID is a nonempty string naming one path component. Dot/dot-dot, slash,
  backslash and NUL are invalid. IDs do not escape the selected storage directory.
  Record directories and revision files must not be symlinks. I/O failures remain
  errors rather than being reported as absence.
- has(id) returns false for a missing record directory and true for an existing
  ordinary record directory. all() returns record-directory IDs in deterministic
  lexical order; unrelated ordinary files at the database root are preserved and
  excluded. Symlink records are errors.
- get(id) returns null when the record is absent or contains no revisions. rev(id)
  returns 0 in those cases. A stored revision is a JSON document named
  <positive-safe-integer>-<UUID-v4>.json. Reject malformed revision names, corrupt
  JSON and inconsistent document identity when reading a document; do not silently
  substitute an older record for a corrupt latest document.
- Revision ordering is numeric. Among files at the same revision, the greatest
  complete filename under JavaScript's locale-independent string comparison wins.
  This tie-break is an approved major-version choice, not a proven reproduction of
  alphanum-sort. A machine's locale must not affect the selected document.
- put(data) accepts a non-array JSON-serializable object with a valid id. It creates
  a new UUID-v4 file and returns a copied object with numeric rev and uid. It does
  not mutate the caller's object or print stored data. Positive safe-integer rev
  explicitly identifies the base revision, including stale bases; the new revision
  is base+1. Omitted, null or zero rev uses the observed latest revision (or zero).
  Negative, fractional, nonnumeric, nonfinite and overflowing revisions reject.
- A put that fails leaves no record behind: a record directory it created is
  withdrawn if no revision was published, so has() stays false and all() omits
  the ID. A directory that already existed, or that holds another writer's
  revision, is never removed.
- Every successful write retains prior revision files. Concurrent writes from the
  same base may create several files at the same next revision. All must remain;
  the program does not pretend that choosing one winner merges conflicting data.
- clean(depth=1) retains every file in the highest depth distinct revision groups
  of each record. It returns removed absolute file paths. Positive safe-integer
  depth is required. At default depth, all files tied at the highest revision are
  retained. Repeated cleanup is idempotent. An invalid/corrupt/symlink record must
  fail before deleting any of that record's files. Errors reject promptly. The
  formerly ignored depth option becomes functional in this major version.

These tests do not certify power-loss durability, hostile-process isolation,
network filesystems, distributed replication or concurrent cleanup/write safety.
All tests use newly created temporary directories and remove only those fixtures.

## Command line

The CLI supports help, package-derived version, and clean [db] [-d|--depth N].
An omitted db means the current directory; depth defaults to 1. --depth=N is
equivalent to --depth N, and -- ends option parsing so a path may begin with a
dash. clean requires an existing database directory: a missing path fails with a
nonzero exit code and creates nothing (the library's path() still creates missing
directories for writers). Help/version have
exit code 0. Unknown commands/options, repeated options, extra operands, missing
option values and invalid depths fail with a nonzero exit code, actionable stderr
and no success output or storage mutation. No-argument invocation prints help.
Runtime filesystem failures also produce nonzero status. No install, save, publish,
network operation or prompt is part of these commands. The previously unused
--no-tests flag is retired in this major version and should be documented.

## Packaging and verification

package.json and package-lock.json identify 3.0.0, contain no third-party runtime,
development, optional, peer or bundled dependencies, and retain a consistent root
lockfile record. npm test uses node:test with an explicit test/ selection so the
historical sketches are not mistaken for working tests. No dependency installation
is required or permitted. The user selected ISC for this candidate. Current license and package metadata
agree; original GPL material remains byte-identical at test/fixtures/LICENSE.GPL-3.0.txt.

test/migration.test.cjs is the frozen, independently prepared public evaluator.
test/migration-evaluator.mjs runs its package, storage and CLI groups and emits the
existing nt operation-report format. Baseline failures must be retained. A missing
dependency during baseline execution is an unavailable baseline, not evidence that
the original library passed behavioral checks. Final verification does not grant human product acceptance. The candidate is
installed in the original checkout; retained trial evidence describes its dated run.
