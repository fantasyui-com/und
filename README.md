# und

A small CommonJS JSON document store. Each write creates a new revision file;
existing revisions remain until cleanup is explicitly requested. Version 3 uses
Node.js built-ins and has no third-party dependencies. Node.js 22 or newer is the
declared runtime target; local verification was exercised on Node.js 26.11.1.

```js
const und = require('und')({});

async function example() {
  await und.path('./database');
  const first = await und.put({ id: 'alice', name: 'Alice' });
  const second = await und.put({ ...first, name: 'Alice Smith' });
  console.log(await und.get('alice')); // second document
}
```

The factory accepts a configuration argument for compatibility; no configuration
options are implemented. Creating an instance performs no filesystem operations.
All methods return promises. Await `path(location)` before calling other methods.

| Method | Behavior |
| --- | --- |
| `path(location)` | Select an absolute or relative directory, creating missing directories. Reject invalid paths, file collisions and symlink components. |
| `has(id)` | Return whether an ordinary record directory exists. A root-level file is not a record. |
| `all()` | Return record-directory IDs in locale-independent lexical order. Preserve and exclude ordinary root-level files. |
| `rev(id)` | Read revision filenames and return the highest numeric revision, or 0 for an absent/empty record. |
| `get(id)` | Read the winning JSON document, or return null for an absent/empty record. |
| `put(data)` | Write and return a JSON copy with numeric `rev` and a fresh UUID-v4 `uid`, leaving the input and prior files unchanged. |
| `clean(depth = 1)` | Keep all files in the highest `depth` distinct revision groups. Return absolute paths of removed files. |

An ID must be a nonempty string naming one path component: `.`, `..`, slash,
backslash and NUL are rejected. IDs and storage-location strings must be well-formed
Unicode: unpaired UTF-16 surrogates reject before filesystem access or parent
creation. Valid Unicode, including literal U+FFFD and surrogate pairs, is retained
without normalization. Record and revision symlinks are rejected. I/O
errors remain errors; they are not reported as missing records.

A file has the form `database/alice/10-<UUID-v4>.json`. Revision numbers are
positive safe integers and sort numerically. When several files share the highest
revision, `get` selects the greatest complete filename using JavaScript string
comparison, independently of locale. It verifies that the JSON object's `id`,
`rev` and `uid` match the directory and filename. Invalid revision names, symlinks,
corrupt selected JSON or mismatched identity cause errors, without falling back
to an older document. `rev` inspects filenames; it does not parse JSON bodies.

A positive safe-integer `data.rev` is the base revision for `put`, even when stale.
The saved revision is that base plus one. An omitted, null or zero revision uses
the observed latest revision instead. Negative, fractional, nonnumeric,
nonfinite or overflowing revisions are errors. Data must serialize to a JSON
object with the generated identity intact; serialization failure creates no record.
The library does not print documents to stdout.

Concurrent writers using the same base can produce several files at the same
next revision. The unique files are retained, and choosing a winner does not merge
their data or notify users of conflicts. Cleanup keeps **every** file in each
retained revision group, including all highest-revision conflicts at depth 1.
It validates revision names and every JSON document before deleting files. Invalid
or corrupt records prevent cleanup; repeated successful cleanup is idempotent.

Cleanup deliberately removes older revision groups. Back up needed history and
stop concurrent writes before running it. Filesystem errors during unlinking can
leave a partially completed cleanup. There is no cleanup/write transaction,
power-loss durability, replication, network-filesystem or hostile-process safety
guarantee. Path checks and UUIDs are not an operating-system isolation boundary.

## Command line

```text
und --help
und --version
und clean [db] [-d|--depth N]
```

The database defaults to the current directory; depth defaults to 1. No arguments
print help. Successful cleanup is silent. Invalid commands, options, duplicates,
extra operands and missing/invalid depth values fail before accessing storage,
with an explanation on stderr and a nonzero exit status. Filesystem failures also
return nonzero status. The unused `--no-tests` flag is retired.

## Verification and historical source

Run `npm test` for the explicit `node:test` contract and regression suites in
`test/*.test.cjs`, and `npm run check`
for published-source syntax checks. No dependency installation is needed.
`test/migration-evaluator.mjs` is the frozen trial evaluator; its structured test
event compatibility was exercised on Node.js 26.11.1 only. Tests use temporary
databases, including simultaneous same-base writers, and do not establish the
concurrency or durability guarantees excluded above.

`index.js` and `core.js` provide the published API. `index.mjs` and `util.mjs` are
retained **unfinished** ESM sketches. `old-test.js` and `test.mjs` are historical,
syntactically invalid sketches, excluded from the production test command.
Upsert, conflict enumeration, views, deletion, replication and synchronization
are unimplemented. The older design narrative described possibilities beyond
this API; this release does not implement them.

See [MIGRATION.md](MIGRATION.md) for breaking changes from 2.13.0. This candidate
is installed in the original authorized checkout and has not been published or
accepted as a production release. The user selected ISC: LICENSE and package
metadata agree; original GPL bytes remain in test/fixtures/LICENSE.GPL-3.0.txt.
Bootstrap and Icons used by the optional website retain separate MIT notices.

## Local learning website

Run `npm run site` and open the printed loopback URL. Optional `-- --port 0`
selects an available port. Introduction, Features, Docs, Playground, Tutorial and
Examples explain the installed seven-method API. All assets are supplied local
Bootstrap 6 alpha and Icons; no dependency install or external asset request is needed.
The Playground calls this real library in isolated temporary browser sessions.
Refresh keeps a session while the server runs; reset/restart discards sample data.
Its writes ledger is application-owned return evidence, not recovered disk history.
Run `node website/examples/tutorial.cjs` and `node website/examples/patterns.cjs`
for complete disposable examples. See website/VALIDATION.md for actual checks and limits.

## Local publication boundary

Each operation retains its selected database across awaits. Writes stage complete
JSON and publish exclusively; prepublication failure preserves prior revisions.
After known publication, staging cleanup failure does not turn success into an
ordinary failed save. An orphan staging file can remain at the database root and
is ignored by record enumeration. A lost response is uncertain: explicitly read
to reconcile and never blindly retry a write. See docs/RELIABILITY.md.

The local Playground assigns a session-scoped identity to each mutation intent so
a browser transport retransmission reuses its original receipt instead of executing
the write again. This does not add durable/cross-process delivery guarantees to und.
Cached browser Back/Forward reconnects one active view without replaying writes.
See [website/OPERATIONS.md](website/OPERATIONS.md) for the bounded mechanism and
reproducible native-browser tests from this checkout.
