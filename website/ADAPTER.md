# Proposed website adapter gate contract

This is pre-implementation test preparation for the accepted R-005 U01-U14 contract.
Only .nt/drafts/website-gate files were authored. The coordinator must review,
promote and register the final closure before a worker claims implementation.

website/server.cjs exports async startSite({port=0,assetRoot?,createStore?,
maxSessions=32,sessionIdleMs=6h,maxIntents=256,maxWrites=100}={})
and returns {url,close}. The default factory is the actual ../index.js; createStore
is an internal factory injection used only for fault testing. Each session gets
a new server-owned temporary sample. All session operations, including reads and
reset, serialize; close drains admitted work, removes owned samples and is idempotent.
It must not report successful shutdown while admitted writes remain able to commit.

Success JSON is {ok:true,result,state:{ids,writes}}. Extra state fields are allowed
and ignored by these tests. ids is the current real all() result; writes is the
ordered ledger of successful put return documents from this sample session.
clean preserves the ledger; reset clears both the sample and ledger.
The ledger is not a full persisted-history API. selected is optional.
Failure uses HTTP non-2xx and {ok:false,error:{code:string,message:string}};
input/origin/Host/session failures are 4xx, initialization and I/O failures are 5xx.

GET /api/session initializes or reuses an opaque HttpOnly SameSite=Strict Path=/
cookie and returns result:null. GET /api/state requires a valid cookie and returns
result:null plus the snapshot. Repeating /api/session with its cookie preserves
the existing sample. /state and /operation never allocate implicit samples.

Samples are bounded. Creating a session first retires sessions idle for
sessionIdleMs, then the least recently used idle session while maxSessions are
held. Retirement removes that sample directory behind its queued work; its cookie
then receives 401 SESSION_REQUIRED and /api/session starts an empty sample. A
session with a request in progress is never retired: when every place is busy, a
new session is refused with 503 SESSION_LIMIT and Retry-After. No timer runs.

state.writes lists at most maxWrites of the newest successful put returns;
state.omittedWrites counts older returns dropped from the list since the last
reset. Dropping a list entry never removes a stored revision.

POST /api/operation takes exactly {method,args}, where args is an array:
put:[document], get/has/rev:[id], all/reset:[], clean:[] or [depth].
Result is the actual core return value; reset returns null.
No arbitrary path, import, method prototype, eval or extra request-envelope key.
Bound bodies below 1 MiB, require JSON, exact local Host and either absent Origin
(non-browser automation) or exact local Origin. Reject foreign and null origins.
No automatic replay after disconnected/unknown-response writes. Session ledger
records actual successful completion even if that request's client disconnected.

assetRoot overrides only the vendor directory. It contains bootstrap/bootstrap.min.css,
bootstrap/bootstrap.bundle.min.js, icons/bootstrap-icons.min.css and icons/fonts/*,
served at /vendor/<relative>. Tests check exact user-supplied hashes. Missing assets
may reject startup with a useful error or serve readable docs with a failing session
endpoint; they may not report an initialized Playground.

The CLI entry is node website/server.cjs [--port N] or --help. Default preferred port
is 8080; explicit 0 permits an available port. Invalid/duplicate/unknown arguments
fail before startup with stderr and no success output. Success stdout is one local URL.
Use loopback and fall back without killing an unrelated port owner. Repeated startup
reuses only a verified same-checkout/same-runtime-directory instance.
UND_SITE_RUNTIME_DIR is optional local startup-receipt metadata, not an HTTP-selected
database path; tests use a fresh owned directory. Verify per-start identity before
reuse; never steal locks or blindly trust stale receipts. Close removes only its
own still-matching receipt. These are cooperative-local identity checks, not OS isolation.

website/examples/tutorial.cjs and patterns.cjs run directly without installs.
Tutorial executes all seven methods, at least two edits from one base, and a handled
error. Patterns exercises depth 2/1 cleanup and invokes actual cli.js clean with an
explicit temporary path. Examples explain results on stdout and remove their samples.
A small test-only preload observes actual core calls; it supplies no mock store and
rejects accidental non-sample path use before access. No custom stdout JSON is required.

The draft has 17 named tests grouped as adapter, safety, readiness, lifecycle, assets,
cli and examples. Root may add its independently prepared state/UI cases before
registration; afterward no frozen gate changes to make implementation pass.
Missing implementation is a failing baseline, not a harness pass.
Browser focus, keyboard, layout, text rendering, duplicate-submit controls and
discarding obsolete UI responses still require the separate U01-U14 browser evidence.
No crash/power-loss, hostile-process, network-filesystem, screen-reader certification
or supported Node-version matrix is established by these local tests.
