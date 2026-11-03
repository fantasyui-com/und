# Verify the learning website's transport and browser lifecycle

Read ../SPEC.md, ../OPERATIONS.md, ../SKILL.md and the review finding before changing
these tests. Use only owned temporary samples and explicitly supplied installed
Chrome; never install a browser/provider or touch application data. Run npm test
for the default Node regressions, then test:browser as documented in OPERATIONS.md
when changing the active-view lifecycle, mutation identity or native dialog focus.

Keep the actual HTTP proxy distinct from controlled JavaScript responses. Record
one native action, logical browser requests, actual forwarded HTTP attempts, original
core receipts and final state. A transport retry may exist despite no fetch loop;
multiple wire attempts must not become multiple writes for one identified intent.
Retain failed cases before product repairs and preserve both zero-byte and body-loss
positions. Verify pending, cached failure, conflicting use, reset and close ownership.
For incomplete-request/reset races, observe the actual server body callback before
sending Reset; retain the exact original request and finish its remaining bytes.
Verify identified/raw requests, a same-intent retry before the original remainder,
invalid/disconnected body release and genuinely new post-reset work. Distinguish
server admission from traffic still in transit; never claim universal network FIFO.

Use real navigation and persisted pageshow for cached-page claims. A reload or a
synthetic event does not replace native Back. Verify first and repeated actions,
draft retention and old completion rejection. For modals, bring the actual target
to front, inspect document.hasFocus, await fresh native shown/hidden events, inspect
painted focus, traverse all controls, and preserve Escape/trigger restoration.
Browser-chrome focus is distinct from entry into inert background application controls.

Inspect actual screenshots at relevant sizes and preserve exact artifacts, environment
failures and untested boundaries. Test completion never grants publication or human
product acceptance. The frozen test/* evaluators/contracts are not editable here.
