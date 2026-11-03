# und 3.0 storage and release contract

This contract defines required behavior; executed verification and human release
acceptance are recorded separately. It strengthens two reproduced ownership and
publication boundaries without claiming a distributed database or crash durability.

## One operation, one selected database

Each public storage operation captures its selected database before its first
asynchronous suspension and retains that identity throughout the operation.
A successful path(location) affects subsequent calls, never redirects an already
admitted read, write or cleanup. Validation must return the same location it checked.
Failed reconfiguration preserves the prior selection. Callers must await initial
path configuration; concurrent reconfiguration completion ordering is not a queue.

## Complete, exclusive revision publication

Readers must observe complete published JSON revisions, never a prefix still being
written. A failure before publication rejects without publishing a corrupt revision,
advancing rev(), poisoning get()/clean(), or changing prior revision bytes.
Internal staging must not appear as record IDs or invalid revision files.
Publication may not replace a final filename created by another writer. Collision
may reject with EEXIST or retry a new identity. Independent same-base writers keep
all complete documents and the existing numeric/filename winner remains unchanged.
Once publication is known to have committed, failure of internal staging cleanup
must not turn it into an ordinary failed put. Successful put keeps its current
returned-document shape. A stopped process or lost response may leave the caller
uncertain; consumers must not blindly replay writes.

These guarantees concern normal local filesystem calls and injected failures. They
do not establish fsync/power-loss durability, cleanup/write transactions, protection
against hostile filesystem mutation, network-filesystem behavior or replication.
Cleanup still requires writers to be stopped and may be partial after unlink error.
Preserve unknown root files and all conflicts in retained revision groups.

## Compatibility and licensing

Keep all seven CommonJS methods, CLI behavior, 3.0.0 version, dependency-free package,
original storage format, 28 existing test assertions and historical source. The
user explicitly selected ISC for this release. Current LICENSE and package/lock
metadata must agree; the old GPL bytes stay at test/fixtures/LICENSE.GPL-3.0.txt,
verified by the unchanged historical-content assertion at its new recorded path.
This explicit license decision changes that path contract, not the historical bytes.

## Required evidence

test/release-boundaries.test.cjs contains eight independently authored cases; the
unchanged starting core fails three. Two legitimate publication controls passed
all eight; an unsafe overwriting rename failed collision preservation. Required
canonical verification runs these, both original suites and the current ISC check.
Missing, skipped, duplicate, unexpected or failed cases and harness failures fail.
No source-only inspection or passing aggregate count replaces named case evidence.
