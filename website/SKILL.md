# Maintaining the und learning website

Read SPEC.md, ../docs/RELIABILITY.md and the current seven-method API before changes.
The site explains the installed library and calls it through a small local adapter.
It must not simulate storage, create a new history API, reinterpret revision names,
or expose arbitrary host paths. No package install, download or publication.

Use the supplied local Bootstrap 6 alpha CSS, module JavaScript and Icons with
their real documented classes. Preserve asset bytes and provenance; inspect the
rendered page because Bootstrap 5 conventions are not interchangeable. Use native
HTML and supplied utility classes, no custom CSS. Keep six discoverable destinations.

Trace one learner through initialize, save, read, update, same-base writes, cleanup,
validation failure and reset. Read actual returned values. Clearly label the writes
ledger as this session's returns, never recovered disk history. Choosing a winner
does not merge fields. Errors, unknown response outcomes and missing data differ.

Keep transport tests, actual browser behavior and human visual inspection separate.
Exercise deliberate unavailable assets/session, invalid input, response loss, stale
completion, duplicate submit and two independent sessions. A failed write response
does not prove rollback; never replay it. Run exact published examples, all required
core regressions and website checks. Inspect actual wide/tablet/compact/320px renders,
200% zoom and keyboard focus; a class, DOM element or changed pixels is insufficient.

Signal and EventEmitter deliver push updates; SignalBinder binds DOM state. Each
subscription/listener belongs to a DisposableScope. Record the revision permitted
to commit after an await; cancellation alone is insufficient. Reentrant signal
updates queue until current revision delivery completes. Close admission on disposal,
attempt every owned cleanup, and dispose late acquisitions immediately. Keep these
small local helpers focused on this website, with their tests and explicit contract.

For a failing check, preserve its reproduction and classify product defect, incorrect
expectation or environment problem before repair. Add a regression for new defects;
never weaken a frozen evaluator. Preserve successful behavior and original library
source sketches. Record tested artifact, runtime, actual checks and untested limits.
Worker completion, independent review, verification and human product acceptance
remain distinct. Do not present a local candidate as an npm release or SOTA proof.
