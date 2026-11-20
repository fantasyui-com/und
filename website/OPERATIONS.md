# Website operation and document ownership

This website-local supplement explains the implementation of the existing learning
contract. It adds no und method, storage-format change or durable job service.
Canonical SPEC.md, ADAPTER.md, SKILL.md and ../docs/RELIABILITY.md remain unchanged.

## Browser mutation intent

One explicit `put`, `clean` or `reset` action creates one UUID-v4 `X-Und-Intent`
header immediately before fetch. Guided lessons create a distinct identity for
each of their actual operations. The request body remains exactly `{method,args}`.
The application does not replay failed/unknown writes. An explicit new user action
gets a new identity. A read for reconciliation is a separate read operation.

A browser can resend the same POST below JavaScript after receiving no response
bytes. Therefore lack of a JavaScript retry loop does not establish one effect per
intent. The local adapter reserves a receipt in the existing cookie session before
queueing an identified request. A matching pending request joins the same promise;
a completed request receives the original status and serialized response. The
serialization fixes the returned snapshot so later ledger writes cannot alter it.
Failures are retained too: an identical request never re-executes after an I/O or
validation error. An explicitly new intent may attempt a corrected operation.

The header is optional for existing raw HTTP clients. When supplied, it must be a
UUID-v4. A SHA-256 fingerprint of the parsed JSON envelope serialized by JSON.stringify
binds it to the method and arguments, including JSON object-key order. Reusing the
identity with another envelope rejects with HTTP 409 / INTENT_CONFLICT before
execution. Invalid header syntax rejects with HTTP 400 / INVALID_INTENT. These
identities are cooperative local request correlation, not authentication or an OS
trust boundary. Raw clients that omit the identity retain the original call contract
and cannot obtain this duplicate-request protection.

## Reset and close

Reset clears its sample and public writes ledger after earlier received requests
have reached an operation-queue or duplicate decision. Each valid session/POST route
gets an admission marker before awaiting its body. Reset captures the earlier
markers, waits for their decisions, then enters the existing session queue. Work
already queued finishes first. Parsing, validation, disconnection and timeout
failures release their markers through finally. Body/envelope failures never queue
a store call.
Close continues draining these admitted handlers and their queued operations.

This prevents an earlier partial body from writing into the replacement sample.
A faster complete retry with the same identity can execute in the old sample while
the original body is held, but Reset still waits for that original admission and
then clears the single write. Existing identity receipts/tombstones prevent later
retry from resurrecting it. No new identity or automatic write replay is introduced.
Requests the server has not received can arrive later; there is no universal network
FIFO or claim that Reset cancels traffic still in transit. The dialog states this
boundary. The existing 256 KiB body limit and request timeout remain in force.

A successful reset advances the sample generation. Completed receipts
from earlier generations release their response payloads but retain small identity
and fingerprint tombstones; repeating an old identity rejects with HTTP 409 /
STALE_INTENT rather than recreating erased data. The reset's own receipt belongs to
the new generation, so retransmitting it does not erase a subsequent save. A new
request queued after reset is admitted into the generation in which it executes.

Identity records are owned by the cookie session and released when the server closes.
They are in memory only, with no cross-process/restart/durable or crash guarantee.
Each session keeps at most `maxIntents` identity records (default 256). When a new
identity would exceed that, the oldest settled records are forgotten first; pending
operations are never dropped, so a transport retry still joins its original. A retry
arriving after its record was forgotten is treated as a new intent, which is why the
bound is far larger than any retry window the browser uses.
This is a small local teaching service without a general resource-quota claim.
Existing sample allocation ownership, drain-before-close and honest cleanup failures
are preserved. Pending duplicate handlers are admitted work and close drains them.

## Document and active view

A cached browser document can survive navigation to Docs and native Back/Forward.
The document owns one DisposableScope containing pagehide/pageshow listeners. Each
active view separately owns its DOM listeners, subscriptions, request controllers
and Bootstrap instances. pagehide disposes that view, invalidates its request revision
before cancellation, disables its controls and dates the old display. For an actual
noncached departure, the document's lifecycle scope is disposed as well.

A persisted pageshow creates exactly one fresh active view and explicitly initializes
or reconnects its existing sample before enabling mutations. It restores the draft,
never replays a pending write, and treats selected-document content as requiring a
fresh read. Any completion belonging to the old disposed view remains unauthorized
to change the display, even if an aborted transport later resolves.

## Native modal focus

The supplied Bootstrap 6 ESM Drawer and its native dialog remain responsible for
opening, dismissal and modal behavior. A view-owned shown.bs.drawer listener focuses
the first navigation link; the reset dialog focuses Cancel. These native controls
have visible existing Bootstrap focus treatment. Escape/hidden restores the original
trigger. In the inspected Chrome build, Shift-Tab past the first modal control reports BODY
as activeElement even while document.hasFocus() is true; the next Tab returns to
Close. An unmodified native-dialog control fixture reproduces that same boundary.
No background application control is reached, and no custom focus trap is added.

## Reproduce and verify

Run from the source checkout, without an install:

```sh
npm test
npm run check
npm run test:browser -- --browser /absolute/path/to/installed/chrome --output /tmp/und-browser-evidence
```

The Node tests under website/test include pending/completed/failed/conflicting
identity use, immutable receipts, session isolation and reset behavior. The admission
regressions observe actual server body callbacks before sending Reset, cover both
identified and raw requests, a faster same-identity retry, malformed/disconnected
bodies, close and a genuinely new post-reset write. They do not infer receipt from
a client-side send or substitute a stubbed store. The default
npm test includes them alongside the unchanged frozen core and website tests.
The browser command requires an explicit installed Chrome path and uses only Node
built-ins plus the project-owned helpers under website/test/support. It launches
owned disposable profiles, actual local servers and an HTTP forwarding proxy; it
closes all owned resources and writes exact traces and screenshots to the requested
output directory. PROVENANCE.json records helper origins and adaptations.

The browser regression checks native persisted Back three times plus Forward and a
first keyboard save after each restoration; focused compact modal entry, all modal
controls, Shift-Tab/native traversal classification and Escape/cancel restoration;
actual zero-byte acknowledgement loss with transparent browser retransmission but
one core write; later-body loss with an unknown outcome and explicit read; and an
actual old read released after reset. A separate synthetic nonpersisted pagehide
checks stale delivery after disposal and is explicitly labeled synthetic. No fetch
stub or invented library response stands in for transport-loss evidence.

Do not treat a missing browser, unavailable BFCache or failure to exercise the
specified wire retry as a pass. Classify the environment and retain the failure.
Review the native event/network traces and painted screenshots separately. The
frozen evaluators remain necessary but do not replace these browser checks or the
independent U01–U14 review and its remaining observations.
