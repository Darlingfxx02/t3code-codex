# Design workspace and Code Quality

Status: proposed product and architecture contract.

This document is the source of truth for the planned `Design` and `Code Quality`
workspaces. It is intentionally more precise than a feature list: it defines what
is local, what is server-owned, what an agent may infer, and what counts as proof.
Until this document is replaced by an accepted implementation decision, agents
working on either workspace must follow these boundaries.

## Product boundary

`Design` and `Code Quality` are separate entries in the left sidebar.

`Design` is a local-first, Figma-like editor for product design files. It owns a
custom canvas, editable layers, components, assets, layout constraints, and the
conversion pipeline between a running product surface and an editable design
document. It does not replace the application runtime and it does not execute an
application's arbitrary React code inside the canvas.

`Code Quality` is a reusable quality scenario runner. A quality scenario may be
attached to a feature, thread, pull request, design flow, or any other supported
project entity. It owns acceptance criteria, checks, evidence, council reviews,
iterations, waivers, and the final verdict. It is not a tab inside `Design` and it
must remain usable for backend and non-visual work.

The two workspaces may reference one another:

- a design flow can attach a Code Quality scenario;
- a quality scenario can require evidence from a Design document or Preview flow;
- the quality scenario never assumes that a Design document is the implementation
  source of truth for runtime behavior.

## Design document model

The canvas consumes a dependency-free intermediate representation (`Design IR`).
The IR is the only format the editor mutates. It is not a copy of a React tree and
it is not a DOM snapshot.

Each node has a stable `nodeId`, parent and child references, resolved geometry,
layout intent, visual properties, asset references, and optional provenance:

```text
DesignDocument
  metadata
  pages[]
    frames[]
      nodes[]
        nodeId
        kind: frame | group | text | vector | image | component | instance
        children[]
        layoutModel
        resolvedBox
        paint
        typography
        interactions[]
        provenance
```

`layoutModel` preserves both the requested model (`flex`, `grid`, auto-layout,
constraints, or absolute positioning) and the resolved values used to reproduce
the captured frame. Keeping only pixel coordinates would make the canvas look
right once and make later resizing impossible.

The runtime code remains authoritative for behavior, data, event handlers, and
provider integration. The design document is authoritative for its own layers,
geometry, visual tokens, and design annotations. Shared fields such as component
variants and layout constraints require an explicit ownership record.

## Local-first persistence and sync

The editor must work without a connected T3 server.

- The local client keeps the active document, unsent operations, and assets in an
  offline store (OPFS/IndexedDB on web and desktop-local storage where available).
- The desktop/server environment may materialize a portable document package in
  the project workspace. The package contains the serialized IR and content-
  addressed assets, never a live import of the project's `node_modules`.
- When a server is connected, the server stores revisions and sync metadata in the
  environment that owns the project. A remote client never silently substitutes
  its own filesystem for that environment.
- Assets are uploaded by hash and deduplicated. The document operation stream is
  batched at interaction boundaries; pointer-move events are local rendering
  details, not individual server writes.
- A sync request carries the base revision and a transaction of node operations.
  The server accepts it only against that revision or returns a conflict. Conflicts
  are resolved per node/asset with keep-local, keep-server, or duplicate-node
  choices; last-write-wins is not an acceptable default for a design document.

The first implementation may use a single active editor writer per document, but
the wire model must retain revision IDs and operation transactions so that
multi-device sync does not require a format rewrite later.

## Preview to canvas pipeline

`Open in Canvas` is a first-class action on an active Preview frame. It imports the
current state without importing the application's dependency graph:

```text
Preview session
  -> capture route/state/viewport/theme
  -> isolated DOM and computed-style inspection
  -> layout and typography normalization
  -> local asset/font collection
  -> Design IR construction
  -> editable canvas frame
```

The capture must include the route, state fixture, viewport, color scheme, browser
engine, and source revision. These become provenance on the imported frame.

The importer resolves CSS variables and computed styles into portable values while
retaining the original token name when it can be identified. Images, SVGs, and
fonts are copied into the document package by content hash. The importer must not
serialize scripts, event handlers, React closures, or arbitrary executable code.

The Preview action may also expose explicit paste targets:

- `Paste as HTML` parses markup in a sandbox and produces Design IR;
- `Paste as React` renders the submitted JSX through an isolated adapter, then
  produces the same IR;
- `Open in Canvas` captures the already-running Preview and is the preferred path
  for pixel-accurate product screens.

Directly copying HTML or JSX into the canvas is not a supported architecture. It
would bring dependencies, hooks, application state, and non-deterministic runtime
behavior into the editor.

Uninstrumented or dynamic content is imported as a frozen snapshot and marked with
`provenance.mode = snapshot`. It must not be presented as a live linked component.
Instrumented components can additionally carry a stable component ID, source file,
source span, and source revision.

## Canvas to code pipeline

Canvas export reads the same Design IR and uses a target adapter:

```text
Design IR
  -> token and asset resolver
  -> layout adapter
  -> target emitter (HTML/CSS | React | T3 component)
  -> portable files and optional patch/branch
```

Generated code is dependency-light by default. It uses T3 tokens and local assets,
and it must declare any runtime dependency it still needs. Export never silently
overwrites the original application. It creates a generated artifact or an
explicit patch for review.

Round-trip editing is intentionally asymmetric:

- code owns behavior, data, event handlers, and runtime composition;
- the canvas owns geometry, visual properties, and annotations;
- shared layout/variant fields have a declared owner and a merge policy.

Re-import uses `nodeId`, component ID, source span, and source hash before it uses
visual similarity. When both sides changed the same owned field, the editor shows a
conflict with the two values and the captured evidence. It does not guess from
pixels or silently choose the newest version.

The product must distinguish these modes in the UI:

1. **Snapshot import** — one-time editable frame, no source link.
2. **Linked import** — can refresh from a known source revision and report local
   overrides.
3. **Generated export** — produces portable code from the canvas.
4. **Patch export** — proposes changes to a linked source component for review.

“Pixel perfect” means that the imported frame matches its captured viewport and
state within the documented rendering tolerance. It does not promise that arbitrary
runtime logic can be reconstructed from pixels.

## Design editor surface

The editor should follow Figma's information architecture and interaction density:
left navigation/layers, a central infinite canvas, a bottom tool strip, and a right
inspector. T3 owns the tokens, icons, typography, and visual material.

The first editor shell should include:

- pages, frames, layers, selection, pan/zoom, rulers, guides, and multi-select;
- a right inspector for geometry, layout, paint, typography, states, and provenance;
- component/instance relationships and local overrides;
- viewport and theme controls for comparing an imported frame with Preview;
- `Open in Canvas`, `Copy`, `Paste`, `Export`, and `Refresh from source` actions;
- a visible sync state: local, syncing, synced, conflict, or offline.

The canvas renderer must be independent from the app preview renderer. A custom
scene renderer may use Canvas2D/WebGL with DOM overlays for text editing and
accessibility, but it must virtualize large documents and avoid cloning the full
application DOM into the editor.

## Code Quality scenarios

`Code Quality` is configured through a guided quality profile, not through a raw
prompt editor. A designer supplies product intent; the system and developer supply
the technical execution details.

A scenario contains:

```text
QualityScenario
  target: feature | flow | thread | pullRequest | designDocument
  brief
  acceptanceCriteria[]
  nonGoals[]
  riskProfile
  surfaces[]
  requiredEvidence[]
  deterministicChecks[]
  councilProfile
  iterationHistory[]
  waivers[]
  verdict
```

The setup flow asks the designer for:

1. what should change and what must remain true;
2. affected surfaces and user flows;
3. risk signals such as visual, data, auth, performance, or cross-device impact;
4. the evidence they expect to see;
5. whether the scenario is advisory or blocking.

Templates turn those answers into checks. A designer selects `UI feature`,
`interaction flow`, `data/auth`, `performance`, or `refactor`; they do not choose
model prompts, arbitrary reviewer counts, or undocumented scoring formulas.

## Council contract

The existing council skill is a review mechanism. `Code Quality` must wrap it in a
typed evidence contract instead of exposing its internal delegation details to the
designer.

The default council profile has role-based reviewers, selected by risk:

- **Requirements and behavior** — does the implementation satisfy the brief and
  acceptance criteria?
- **UI, accessibility, and responsive behavior** — does the runtime evidence hold
  across the declared surfaces, themes, and viewports?
- **Architecture and maintainability** — is the change placed at the correct
  service/component boundary and is complexity justified?
- **Testing and regression** — are the changed behaviors covered by meaningful
  checks, and are known regressions closed?
- **Performance, security, or permissions** — added only when the risk profile
  requires it.

Each reviewer receives the same revision, the quality profile, the relevant diff,
deterministic check results, and only the design frames or runtime evidence that
belong to the target. A reviewer must cite evidence for every finding.

The council output is structured:

```text
verdict: pass | needs_changes | blocked | insufficient_evidence
findings[]:
  severity: blocker | major | minor | note
  claim
  evidenceRefs[]
  sourceRefs[]
  reproducibleSteps[]
  suggestedNextStep
missingEvidence[]
contractChanges[]
```

Rules that prevent hallucinated quality judgments:

- no evidence reference means no accepted finding;
- missing evidence produces `insufficient_evidence`, never an inferred pass;
- deterministic checks are authoritative for their own result;
- the council may identify a missing test or a risk, but it may not invent a test
  result;
- numeric scores are secondary diagnostics and never replace the verdict;
- a synthesis step may deduplicate findings but may not manufacture agreement;
- a waiver records owner, reason, scope, and expiry.

## Iterative quality lifecycle

The intended feature path is:

```text
Draft brief
  -> profile generated
  -> implementation iteration
  -> deterministic checks
  -> council review
  -> findings and evidence
  -> fixes
  -> impacted recheck
  -> full acceptance run
  -> accepted / blocked / waived
```

Every run records the commit, environment, profile revision, checks executed,
evidence artifacts, council findings, and the previous run it supersedes. A second
iteration must show which findings were closed and which new regressions appeared.
The final verdict cannot be based only on the latest text response from an agent.

Fast checks may run after an agent turn; the blocking profile runs on pull request
open/update; a broader matrix may run on demand or on a schedule. If impact cannot
be determined safely, the system falls back to the full declared profile.

## Agent context

Agents receive a typed context bundle, not an instruction to “look at the design and
figure it out”. The bundle contains:

- the brief, acceptance criteria, and non-goals;
- locked decisions and unresolved questions;
- selected document/frame/node IDs and provenance;
- relevant source files and source revision;
- active quality scenario, prior findings, and required evidence;
- explicit `known`, `assumption`, `unknown`, and `must-not-invent` fields.

The agent must treat `unknown` as a request for clarification or evidence. It must
not infer hidden behavior from a screenshot, invent a component API, or turn an
advisory council suggestion into an accepted requirement without a recorded change
to the quality scenario.

The context bundle should be exposed through the existing typed context/MCP path so
chat, scheduled tasks, and future Design actions all consume the same source. Raw
large document files should be loaded by reference and narrowed to the active
frame, nodes, and evidence.

## Server and client boundaries

The server owns durable document revisions, sync transactions, asset metadata,
quality scenario state, run records, permissions, and external side effects. The
client owns canvas interaction, local offline edits, selection, viewport rendering,
and optimistic presentation.

Cross-boundary behavior belongs in typed contracts. The server exposes service
methods for document sync, revision queries, quality scenario lifecycle, run
creation, evidence queries, and verdict acknowledgement. WebSocket handlers and
MCP tools remain thin adapters.

Quality execution runs in an isolated checkout and uses the existing Preview
automation and source-control boundaries where applicable. The Design editor never
gets direct access to provider credentials or arbitrary server filesystem paths.

## Delivery order

1. Define and validate Design IR plus portable asset packaging.
2. Add local document persistence and the infinite canvas shell.
3. Implement Preview `Open in Canvas` for snapshot imports.
4. Add provenance, component IDs, and linked refresh.
5. Add portable React/HTML export and explicit patch export.
6. Add Code Quality scenario storage and guided profiles.
7. Add deterministic runners, evidence artifacts, and structured council review.
8. Add server sync, multi-device conflict UI, and broader surface coverage.

Do not begin with arbitrary React-to-canvas parsing, live dependency execution in
the canvas, or a global quality score. Those choices would make the result slow,
non-deterministic, and impossible to explain when the generated design diverges
from the source.
