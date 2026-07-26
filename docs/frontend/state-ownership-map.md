# State ownership map (agent quick reference)

**Статус:** ACTIVE short map — not a second queue  
**Актуально на:** 2026-07-26  

One page for coding agents: who owns server data, shared client state, and
local workflow UI. For path-level routing use `npm run agent:scope -- <path>`.

## Legend

| Layer | Meaning |
|---|---|
| **Server** | Backend + react-query keys / mutations |
| **Shared client** | zustand / localStorage that survives route changes |
| **Workflow** | page-local hooks, form drafts, selection, modals |

---

## Heat

| Concern | Owner |
|---|---|
| Objects list / CRUD | Server: heat/project APIs + RQ in heat page models |
| Heat-loss calculation results | Server: calculations API; invalidation from heat mutations |
| Table column prefs / density | Shared: heat preferences hooks + guest localStorage / server prefs |
| Inline edit / excel draft | Workflow: heatCalc excel/normal models (page hooks) |
| Object wizard form | Workflow: wizard form sync hooks; submit → server mutations |
| Navigation “continue to electrical” | Workflow: heat continue hook → route + optional batch |

**Do not:** put heat formulas in UI-kit; deep-import electrical into heat components.

---

## Electrical

| Concern | Owner |
|---|---|
| ER variants / assignments | Server: electricalVariants API + assignment controller |
| Cable candidates / apply | Server: candidate mutations; workflow: selection modals |
| Batch recalc / job tracker | Workflow: batch job tracker hooks; server: calc tasks |
| Main / candidate column prefs | Shared: column persistence hooks + guest/registered caches |
| Table selection / clipboard | Workflow: selection state hooks |

**Do not:** heat object geometry rules in electrical column renderers.

---

## Specification

| Concern | Owner |
|---|---|
| Spec lines / rebuild | Server: specification API + page model |
| Manual items | Workflow: manual items controller + mutations |
| Filters / chrome | Workflow: spec page chrome hooks |

---

## Projects / shell / auth

| Concern | Owner |
|---|---|
| Session / role | Shared: `authStore` (localStorage hydrate) |
| Current project | Shared: project selection storage + RQ |
| Layout chrome | Shell components; no domain calc state |

---

## Feedback (global)

| Concern | Owner |
|---|---|
| Toasts / confirm | `@/feedback/appFeedback` bound by `AntdAppShell` |

---

## Agent checklist

1. `npm run agent:scope -- <file>` → `state_owner`; затем
   `npm run agent:scope -- --changed --json` → diff-wide minimum proof.
2. Change **one** layer per slice when possible (server *or* workflow).  
3. Characterization first if mutating RQ keys / invalidation / form payload.
