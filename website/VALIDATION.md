# und learning website validation

Elizabeth R-013 bounded reset rework evidence, 2026-11-02 UTC. Runtime: Node.js 26.11.1 on Linux;
installed browser: Chrome 146.0.7680.76. This is a local candidate awaiting fresh
independent review, not npm publication or human product acceptance. Node >=22 is
declared; the full runtime range has not been exercised.

## Final automated checks

- `npm test`: **70 passed**, zero failed/skipped/cancelled/todo: 37 core cases,
  21 frozen website cases, three ownership, five intent and four new request-admission
  regressions. All are in the default command.
- `npm run check`: library, server, browser modules and complete examples parse.
- `node test/release-evaluator.mjs`: exactly 37 required named cases pass across
  four operations, with no harness problems.
- `node test/website-evaluator.mjs`: exactly 21 required named cases pass across
  seven operations, with no missing/skipped/unexpected cases or harness problems.
- The exact standalone tutorial and patterns programs run successfully, including
  actual seven-method calls, same-base edits, handled errors, depth 2/1 cleanup,
  explicit temporary-path CLI cleanup and disposal.

The frozen tests, evaluator inventories, canonical website contracts, core, CLI,
current ISC license, historical sketches/GPL bytes and supplied vendor assets remain
unchanged. New permanent tests and test procedures live under website/test.

## R-012 finding F4 and current repair

Independent R-012 review resolved F1–F3 and completed its prior U08/U13/navigation/
native-zoom observations, but found one additional reset boundary. An original
110-byte put had already delivered 55 bytes to the server before Reset was sent.
Reset completed first; finishing that same original body then wrote revision 1
into the replacement sample. This was an actual HTTP admission defect, distinct
from UI stale-result suppression and intent deduplication. It did not establish
an ordering promise for traffic the server had not received.

Four permanent cases were retained before repair: identified and raw partial puts,
a same-intent retry before the original remainder, and invalid/disconnected body
release. Three failed with actual replacement-sample writes; the failure-release
control passed. There were no skipped/cancelled cases or harness failures.

The server now records request admission before awaiting a body. Reset waits for
earlier admissions to make their queue/duplicate decision, then uses the existing
serialized operation queue. Every error path releases the marker through finally.
The faster duplicate still joins one actual intent in the old sample; Reset waits
for the original admission and clears that write. Later retries are stale, conflicting
payloads still reject, and genuinely new post-reset writes work. No new core API,
identity format, retry, body limit, timeout or queue framework was introduced.

All four admission cases and five existing intent cases pass. The independent R-012
probe was also rerun with only its output directory changed: Reset remains pending
until the remainder, put/reset return 200, final IDs/writes are empty, and close leaves
no owned sample entries. Original red evidence is preserved. Default npm test now
passes all 70 cases. The concise dialog limits its promise to work already received by this
server; OPERATIONS.md explains that requests still in transit can arrive afterward. OPERATIONS.md
and the additive test procedure document the same boundary; frozen contracts remain
unchanged. No universal network FIFO or cancellation of unreceived traffic is claimed.

## Earlier independent browser findings and preserved repairs

The earlier 61-test worker candidate passed its automatic checks but independent
review found three actual browser defects. Its evidence remains historical. Each
finding was reproduced by permanent browser regressions before this rework:

| Finding | Before | Current observed outcome |
| --- | --- | --- |
| Native Docs link, then Back | persisted=true; first keyboard Save sends zero puts and performs default form navigation | Three real cached Back cycles and Forward/Back each reconnect one active view; each first Save performs one put, with no duplicate handlers |
| Zero-byte acknowledgement loss | One logical POST becomes two wire attempts and publishes revisions 1 and 2 | The same two wire attempts retain one intent identity and receive one original revision/UID; only one write exists |
| Compact modal entry | Native shown event leaves BODY active outside the modal even with document.hasFocus=true | Introduction receives native focus inside the actual modal and visibly paints a 3px Bootstrap outline; Escape restores Menu |

The optional mutation identity is session-scoped and in memory. Pending duplicates
join one operation, completed duplicates reuse immutable status/JSON, failed receipts
remain failed without executing again, conflicting reuse rejects, and reset rejects
old-generation identities without recreating erased data. An identical reset cannot
clear a later save. These cases use actual local core stores. This is not a core
transaction, durable delivery or cross-process/restart guarantee. See OPERATIONS.md.

A document now owns its page lifecycle separately from each active view. Cached
return remounts once and initializes before enabling mutations. Disposal invalidates
old requests before cancellation. No pending mutation is replayed on return. The
supplied Bootstrap Drawer remains responsible for native opening/modal/dismissal;
owned shown-event listeners focus the navigation link or reset Cancel.

## Actual browser regression evidence

`npm run test:browser -- --browser /absolute/installed/chrome --output /evidence/path`
runs permanent first-party CDP/proxy regressions without installing dependencies.
It requires an explicitly supplied browser. The current run passes all three
scenarios: native Back lifecycle, native dialog focus, and actual transport loss.
The fresh R-013 execution passes all three groups with explicit resource teardown.
Current evidence is retained under `.nt/drafts/R-013/`; earlier before/after traces
remain under `.nt/drafts/R-011/` and `.nt/drafts/R-012/`. First-party helper provenance
is in website/test/support/PROVENANCE.json.

The actual forwarding proxy waits for a real committed core response, then drops
it before any response bytes. Chrome makes two actual HTTP attempts for one native
Save and one logical browser request. Both carry the same identity; final state
contains only the first revision/UID. A complementary loss after the exact first
body byte shows unknown outcome, retains the draft and reconciles through explicit
reconnect/read. The read returns the original revision/UID with no write replay.
A real old read held until after reset cannot repaint old data. A separately labeled
synthetic nonpersisted pagehide also discards a later real held response; it is not
substituted for the native cached-navigation checks.

The compact target is brought to front and document.hasFocus is checked. Fresh
shown/hidden events, all seven modal controls, reverse/forward traversal, reset
Cancel and trigger restoration are exercised. The initial strict assumption that
reverse Tab must always leave an element inside the modal was investigated:
a plain native-dialog fixture with no Bootstrap/application code reproduces
Introduction -> Close -> BODY (hasFocus=true) -> Close. No inert background control
is reached. The permanent test retains that boundary and requires the next Tab to
return to Close. It does not install a custom focus trap or call this a new defect.

Genuine native 200% Chrome zoom was exercised in R-011 and independently in R-012. At a fixed
physical 1200×900 window, innerWidth changes 1200→600 and devicePixelRatio 1→2,
while CSS zoom and visualViewport.scale remain 1. The focused compact menu is
visually inspected, keyboard navigation opens Playground, and a real save succeeds.
This is native browser zoom, not CSS enlargement or pinch emulation.

## Preserved prior evidence and remaining review

Earlier worker and independent review inspected wide 1440×900, tablet 768×1024,
compact 390×844 and narrow 320 CSS-pixel renders, real same-base comparisons,
cleanup, literal Unicode, errors and focus. No page-wide overflow was observed;
JSON scrolls in labeled regions. This bounded rework changes the reset explanatory text, with a fresh narrow-dialog
paint and keyboard check. The first narrow check exposed focused Cancel below the
visible body and a horizontally overflowing confirmation label. That failing assertion
and observed geometry were retained; its screenshot was viewed before correction. Supplied Bootstrap h-auto/wrapping/flex utilities now
keep actions outside the scrolling body and visible; a permanent browser assertion
checks painted bounds, fresh shown events and keyboard restoration. No vendor CSS
or native focus implementation changed. The complete
prior viewport/native-zoom matrix is preserved rather than counted as a new run.
No screenshot is treated as proof of a complete operation.

Prior ownership repair remains covered: provisional allocations stay owned after
initialization/cleanup failures; close attempts every owned cleanup and rejects
until removal succeeds. Earlier actual CSP/initialization/oversized-body failures
and their fixes remain in the retained history. No trusted check was weakened.
The initial Drawer-timing probe and filesystem-overlong-ID expectation were
classified separately from those product defects.

Independent R-012 closed F1–F3 and completed the previously open actual two-browser/
sentinel isolation, rendered initialization failure, missing-asset refusal, navigation
and native-zoom observations. Its complete U01–U14 matrix records the successful
specific journeys alongside F4. Fresh independent review must verify this submitted
F4 correction and preserved behavior; worker tests do not grant approval. Frozen
adapter gates freshly recheck session isolation, invalid input/Origin/Host, missing
assets, store failure, startup fallback/reuse and exact supplied bytes.

Not established: screen-reader certification, exhaustive browser or Node matrices,
power-loss/crash durability, hostile-process or OS trust isolation, network
filesystems, concurrent cleanup/write safety, distributed use, performance or
long-running multi-user resource quotas. Identity receipts are process-local and
released with their cookie sessions on close. No dependency/provider installation,
commit, deployment, publication or product acceptance occurred. Private coordination
and evidence are excluded from the package; Bootstrap/Icons retain separate MIT
notices and exact supplied bytes, alongside the library's ISC license.
