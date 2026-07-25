# TLT browser state matrix (AF11)

**SLICE_ID:** AF11-BROWSER-CONTRACT-01  
**Status:** CONTRACT (not an ACTIVE queue; not a pass claim)  
**Актуально на:** 2026-07-25  
**Owner:** qa  

This document is the TLT-specific **required state × viewport × evidence**
contract for AF11 browser/Kontur reseal. It does **not** mark any state
passed. Execution is Prompt 14 per area, then Prompt 15 final seal.

Normative inputs:

- [Desktop viewport policy](./viewport-policy.md)
- [Agent development standard](./agent-development-standard.md)
- AF11 origin (historical): [archive/af11-historical.md](./archive/af11-historical.md)
- Machine schema example: [`docs/audit/2026-07-25-af11-browser-contract/evidence.schema.json`](../audit/2026-07-25-af11-browser-contract/evidence.schema.json)

General Kontur UI quality dimensions (page overflow, key bounds, sibling
overlap, focus/keyboard, console, failed network, long Russian text,
empty/one/many data, handled API failure) apply to **every** required row.
Do not import foreign Project/Run entities from other products — only TLT
owners below.

---

## 1. Evidence row schema

Every required `(area, state, viewport)` observation must record:

| Field | Type | Meaning |
|---|---|---|
| `area` | enum | `projects` \| `heat` \| `electrical` \| `specification` \| `reports` |
| `state_id` | string | Stable id from tables below (e.g. `heat.populated_normal`) |
| `state_label` | string | Human label |
| `required` | boolean | Always `true` for rows in this matrix |
| `action_path` | string[] | Visible user actions that reach the state (no silent API-only jump unless documented as seed representing that user path) |
| `url` | string | Settled browser URL after actions |
| `viewport` | `{ width, height }` | Exact CSS viewport |
| `viewport_profile` | string | Profile name (`kontur-desktop`, `kontur-mobile`, `tlt-shell`, …) |
| `screenshot` | path | Same-HEAD PNG under dated audit dir |
| `geometry` | path \| object | Key bounds / layout metrics JSON |
| `overflow` | object | Page and region overflow (`overflowX`/`overflowY`, scrollWidth vs clientWidth) |
| `console` | object | `pageerrors`, `warnings`, `errors` counts + excerpts |
| `failed_network` | object | Unexpected failed requests; empty expected failures must be named |
| `fixture_or_seed` | string \| null | Documented seed/fixture and **which user behavior** it represents |
| `result` | enum | `pass` \| `fail` \| `blocked` \| `not_run` |
| `blocker` | string \| null | FILE / EVIDENCE / DECISION NEEDED when not pass |
| `head` | string | `git rev-parse HEAD` of the tree under test |
| `captured_at_utc` | string | ISO-8601 UTC |

**Rules**

- Missing required row ⇒ area audit `BLOCKED`, not `optional`.
- Screenshots from another HEAD are invalid.
- Reach state through visible user actions; snapshot only after settled async UI.
- Seed/API helpers must document the user-visible behavior they stand in for.

---

## 2. Viewport application

### 2.1 Always required (TLT desktop-only)

| Profile | Viewport | Applies to |
|---|---:|---|
| `kontur-desktop` | `1440×1000` | **Every** selected required state |

TLT is a desktop-only product ([viewport policy](./viewport-policy.md):
`<1000 px` is outside the general contract). `kontur-mobile` `390×844` is
**not** part of acceptance; it runs only in an explicitly ordered responsive
slice and never replaces the desktop contract.

### 2.2 App shell / modal / overflow (TLT)

| Profile | Viewport | When |
|---|---:|---|
| `tlt-shell-1000` | `1000×768` | App shell, modals, overflow-sensitive chrome |
| `tlt-primary-qa` | `1440×900` | Primary TLT visual QA profile |
| `tlt-wide` | `1920×1080` | Wide / max-width behavior |

### 2.3 Dense Heat / Electrical / Specification workflows

| Profile | Viewport |
|---|---:|
| `tlt-dense-1000` | `1000×768` |
| `tlt-dense-1280` | `1280×800` |
| `tlt-dense-1366` | `1366×768` |
| `tlt-dense-1440` | `1440×900` |
| `tlt-wide` (add) | `1920×1080` |

### 2.4 Per-area minimum viewport set

| Area | Minimum required viewports per state |
|---|---|
| Projects | `1440×1000`, plus shell set for list/modal: `1000×768`, `1440×900`, `1920×1080` |
| Heat | `1440×1000`, plus dense set (+ `1920×1080` for wide/side form) |
| Electrical | `1440×1000`, plus dense set (+ `1920×1080` for wide grid) |
| Specification | `1440×1000`, plus dense set |
| Reports | `1440×1000`, plus shell set; long content also `1920×1080` |

---

## 3. Required states by owner

### 3.1 Projects (`area: projects`)

| state_id | Required state | Typical action path (document actual) |
|---|---|---|
| `projects.loading` | loading | Open projects list before data settles |
| `projects.error_retry` | handled error + retry | Force list failure; assert UI error + retry control |
| `projects.empty` | empty | Authenticated user/project set with zero projects |
| `projects.populated` | populated | List with ≥1 project |
| `projects.filters` | filters | Apply name/status/filter controls |
| `projects.create_pending_modal` | create pending/modal | Open create project modal (pending submit if applicable) |
| `projects.bulk_selection_actions` | bulk selection/actions | Multi-select + bulk action affordances |
| `projects.long_names` | long names | Project with long Russian/identifier name |
| `projects.permission_variants` | permission variants | Role-constrained vs full permissions |

### 3.2 Heat (`area: heat`)

| state_id | Required state | Notes |
|---|---|---|
| `heat.no_project` | no project | Workspace without selected project |
| `heat.loading` | loading | Objects/workspace loading |
| `heat.error_retry` | handled error + retry | Handled load failure + retry |
| `heat.empty` | empty | Project with zero objects |
| `heat.populated_normal` | populated normal | Objects in normal (non-Excel) table mode |
| `heat.populated_excel` | populated Excel | Excel/virtual table mode with data |
| `heat.project_switch_a_to_b` | A→B project switch | No stale rows/draft from A after switch to B |
| `heat.dirty_draft_selection_reset` | dirty draft/selection reset | Dirty cell/draft cleared or confirmed on selection change per product rules |
| `heat.wizard_pipe` | pipe wizard | Open pipe object wizard |
| `heat.wizard_tank` | tank wizard | Open tank object wizard |
| `heat.placement_above` | above ground | Placement = above |
| `heat.placement_underground` | underground | Placement = underground |
| `heat.climate_wind` | climate/wind | Climate and wind fields visible/settled |
| `heat.form_wide` | wide form | Wide form layout |
| `heat.form_side` | side form | Side form layout |

### 3.3 Electrical (`area: electrical`)

| state_id | Required state | Notes |
|---|---|---|
| `electrical.no_variant` | no variant | Project without electrical variant / empty tabs |
| `electrical.readiness_loading` | readiness loading | Readiness probe in flight |
| `electrical.readiness_error` | readiness error | Handled readiness failure |
| `electrical.readiness_not_ready` | readiness not-ready | Explicit not-ready UI |
| `electrical.readiness_ready` | readiness ready | Ready for calculation workflow |
| `electrical.variant_create` | create | Create electrical variant |
| `electrical.variant_rename` | rename | Rename variant |
| `electrical.variant_copy` | copy | Copy variant |
| `electrical.variant_delete` | delete | Delete variant (confirm path) |
| `electrical.selected_uuid` | selected UUID | Selection by UUID identity |
| `electrical.selected_legacy_number` | selected legacy number | Selection/display with legacy number |
| `electrical.view_unassigned` | unassigned view | Unassigned objects view |
| `electrical.view_system` | system view | Calculation system view |
| `electrical.populated_grid` | populated grid | Grid with assigned/calculated rows |
| `electrical.candidate_flow` | candidate flow | Candidate cable picker / selection flow |
| `electrical.settings_modal` | settings/modal | Column/settings modal |
| `electrical.batch_action` | batch action | Batch action on selection |
| `electrical.permission_variants` | permission variants | Role-constrained vs full |

### 3.4 Specification (`area: specification`)

| state_id | Required state | Notes |
|---|---|---|
| `specification.no_project_variant` | no project/variant | Missing project or variant scope |
| `specification.loading` | loading | Spec query loading |
| `specification.error_retry` | handled error + retry | Handled failure + retry |
| `specification.empty` | empty | No generated specification |
| `specification.generated_full` | generated full | Full generation success |
| `specification.partial_preflight` | partial/preflight | Partial preflight confirm path |
| `specification.stale` | stale | Stale after upstream change |
| `specification.settings_defaults` | settings/defaults | Project defaults / settings |
| `specification.manual_add` | manual add | Manual item add |
| `specification.manual_delete` | manual delete | Manual item delete |
| `specification.permission_variants` | permission variants | Role-constrained vs full |

### 3.5 Reports (`area: reports`)

| state_id | Required state | Notes |
|---|---|---|
| `reports.loading` | loading | Report workspace loading |
| `reports.error_retry` | handled error + retry | Handled failure + retry |
| `reports.empty` | empty | No report content / nothing to show |
| `reports.populated` | populated | Populated report content |
| `reports.wizard` | wizard | Report wizard open |
| `reports.preview` | preview | Preview settled |
| `reports.long_content` | long content | Long Russian content / overflow contract |
| `reports.export_disabled` | export/action disabled | Disabled export/action state |
| `reports.export_success` | export/action success | Successful export/action |

---

## 4. Coverage dimensions (every row)

For each required `(state_id, viewport)` after settled UI:

1. **Screenshot** — full page or defined workspace region; path in evidence.
2. **Geometry** — key control bounds; no clipped primary actions.
3. **Overflow** — no unexpected page-level horizontal overflow; table scroll only inside explicit regions.
4. **Sibling overlap** — no unintended overlaps of primary chrome.
5. **Focus / keyboard** — focus not lost off-screen; essential actions keyboard-reachable where product requires.
6. **Console** — `pageerrors` = 0; application warnings/errors = 0 unless explicitly accepted and named.
7. **Failed network** — unexpected failures = 0; intentional fault-injection named in `failed_network`.
8. **Data cardinality** — exercise empty / one / many where the state implies data.
9. **Long text** — long Russian labels/identifiers do not break layout contract.
10. **Handled API failure** — visible UI, no uncaught error (for error/retry states).

---

## 5. Fixture / seed documentation rule

If a state is reached with seed, guest HTML, or API helper:

```text
fixture_or_seed: "<command or fixture id> — represents user behavior: <description>"
```

Examples:

- `seed:guest:playwright — represents guest completed heat objects before electrical`
- `manual employee login petrov@… — represents employee projects list`

Silent DB bypass without user-behavior mapping ⇒ invalid evidence.

---

## 6. Audit layout (Prompt 14 / 15)

```text
docs/audit/<date>-af11-browser-<area>/
  snapshot.md
  evidence.json          # array of evidence rows (schema)
  browser/
    <state_id>-<viewport>.png
    <state_id>-<viewport>-geometry.json
    ...

docs/audit/<date>-af11-browser-final/
  snapshot.md            # same HEAD; all five areas; BLOCKED if any required row missing
  manifest.json          # optional index of area evidence paths
```

Statuses:

| Status | When |
|---|---|
| `pass` | All required rows for area on one HEAD green |
| `fail` | Defect found (UI/console/network/geometry) |
| `blocked` | Tooling, stack, auth, or required state unreachable — **DECISION NEEDED** |
| `not_run` | Only inside in-progress drafts; final seal treats as blocked |

---

## 7. Non-goals

- This matrix is **not** an ACTIVE backlog and does not route `pending`.
- Source inspection alone cannot mark a state `pass`.
- Historical AF10 screenshots must not be re-labeled as AF11 seal.

---

## 8. Execution order

1. AF11-BROWSER-CONTRACT-01 — this document + schema (done when links + schema validate).
2. AF11-BROWSER-{PROJECTS|HEAT|ELEC|SPEC|REPORTS}-01 — one area per run.
3. AF11-BROWSER-FINAL-SEAL-01 — aggregate same HEAD only.
