# Migrating from und 2.13.0 to 3.0.0

The retained migration originated as an isolated trial from source commit
`4e3e90d3ab99e842227f3c5548e4299905fefb4c`. The reviewed 3.0.0 candidate and
subsequent local publication/ownership corrections are now installed in the original
authorized checkout. No application database was migrated. This is not an npm
publication or human acceptance as a production release. Historical trial evidence
remains dated evidence, not a claim that the checkout is unchanged.

## Public API and dependencies

The CommonJS factory and asynchronous `path`, `has`, `all`, `rev`, `get`, `put`
and `clean` methods remain. Await `path(location)` before access. The factory's
configuration argument remains accepted without adding configuration options.
The ESM files and historical test sketches remain byte-identical unfinished source;
they do not provide additional supported features.

All six runtime dependencies and their transitive lock entries are removed:
`mkdirp`, `path-exists` and `pify` become explicit promise-based filesystem calls;
`uuid/v4` becomes `node:crypto.randomUUID`; `commander` becomes a parser for the
single documented command; and `alphanum-sort` becomes the ordering described below.
Node.js 22 or newer is the declared runtime target. The trial tests ran only on
Node.js 26.11.1, so runtime portability across the entire declared range is untested.

`npm test` explicitly runs the frozen contract and additive regression suites via
`node --test test/*.test.cjs`. The broken
AVA declaration is removed; historical sketches are preserved outside that test
selection. `npm run check` checks the published JavaScript entry points. The
legacy `save` script, which combined commits, push, versioning and publication,
is removed. No dependency installation or release script was run.

## Revision ordering and cleanup

The recorded human decision for this trial approved numeric revision ordering,
a deterministic full-filename tie-break and conflict-preserving cleanup.
`get` now chooses the highest numeric revision, then the greatest full filename
under locale-independent JavaScript string comparison. This is an intentional
major-version rule; it is not claimed equivalent to `alphanum-sort`, and can
change the selected same-revision conflict winner.

`clean(depth = 1)` retains all files in the highest N distinct revision groups.
Depth was previously ignored. At default depth all highest-revision conflicts
survive, instead of all but one file being deleted. Older groups are removed only
when cleanup is explicitly called. A returned array contains removed absolute
paths. Validate your data and back up required history before explicitly cleaning;
cleanup is not transactional and must not run concurrently with writes.

A stale positive `data.rev` remains the chosen base, preserving branching history.
Omitted, null or zero revisions use the observed latest revision; an empty or
missing record has revision 0. Invalid or overflowing revisions reject. New writes
use exclusive UUID-v4 files and retain all prior revisions. The input remains
unchanged, and stored data is no longer printed to stdout.

## Validation and CLI differences

- IDs must be nonempty single path components, excluding `.`, `..`, slash,
  backslash and NUL. IDs and storage-location strings with unpaired UTF-16
  surrogates reject before filesystem access, including parent creation. Valid
  Unicode, literal U+FFFD and correctly paired surrogates remain supported without
  normalization. Invalid reconfiguration retains the previous selected database.
  Symlink storage ancestors, records and revision files reject.
- Root-level ordinary files are excluded from `all` and preserved. Permission and
  other I/O errors propagate instead of masquerading as absence.
- Revision filenames must contain a positive safe integer and UUID-v4. Invalid
  names reject. Reading JSON checks identity against the filename and record.
  Corrupt latest JSON rejects instead of selecting an older version.
- Cleanup validates all documents before unlinking. Corrupt old history is an
  error, not disposable data. Serialization and identity errors in `put` occur
  before creating a record or revision.
- `und --version` uses package version 3.0.0. No arguments print help; omitted
  cleanup database means the current directory. Depth must be a positive safe
  integer. Unknown/repeated options, extra operands and missing values fail before
  storage access. Runtime failures produce stderr and a nonzero exit status.
- The unused `--no-tests`/`-T` option is removed.

## Evidence boundaries

The original runtime baseline was unavailable because dependencies were absent;
its failing evaluator output was retained. No claim is made that old behavior
passed the new contract. The suite exercises temporary local files, including
six simultaneous same-base writers. It does not certify concurrent cleanup/write
safety, power-loss durability, hostile-process isolation, network filesystems or
distributed behavior. There is no conflict merging/notification, upsert, view,
deletion, replication or synchronization API. The user explicitly selected ISC; current LICENSE and package metadata agree.
The original GPL bytes are retained at test/fixtures/LICENSE.GPL-3.0.txt as historical
material. Supplied Bootstrap and Icons have separate MIT notices.

## Operation ownership, publication and learning site

Each storage operation now keeps the database selected at admission throughout its
awaits. Complete JSON is staged and exclusively published without overwriting a
competing revision. Failure before publication preserves earlier readable data.
Failure cleaning internal staging after known publication does not report the save
as undone. A lost response remains uncertain; clients must not replay automatically.
These local guarantees do not add power-loss durability or cleanup/write transactions.

`npm run site` runs the optional offline learning companion. It preserves the direct
library CLI and isolates all browser operations in server-owned temporary samples.
No browser runtime or history API is added to und. See website/VALIDATION.md for
the executed checks, runtime and remaining boundaries.
