# Frontend audit via Storybook MCP (React)

**Status:** **PASS** (read-only audit) → **follow-up applied 2026-07-26** (P0–P2 stories + docgen + coverage gate)  
**UTC:** 2026-07-26  
**HEAD:** see `git rev-parse HEAD` at review time  
**Storybook:** `http://127.0.0.1:6006` + MCP `/mcp` (`@storybook/addon-mcp`)  
**Method:** Storybook MCP docs tools only for public UI-kit surface; filesystem used only for export/story coverage gaps.

## Commands / tools

```text
storybook list-all-documentation (withStoryIds)
storybook get-documentation (CompactField, TltButton, TltTable, …)
storybook preview-stories (sample storyIds)
# FS cross-check:
ls frontend/src/components/ui-kit/*.stories.tsx
cat frontend/src/components/ui-kit/index.ts
```

## MCP component index (documented)

| Component ID | Stories (count) | Notes |
|---|---:|---|
| `ui-kit-compactfield` | 4 | Number Required, With Error, Text And Select, Disabled |
| `ui-kit-tltalert` | 5 | tones + dismissible |
| `ui-kit-tltbadge` | 2 | Default, Tones |
| `ui-kit-tltbutton` | 6 | variants + loading/disabled |
| `ui-kit-tltcard` | 3 | Default, With Actions, Soft |
| `ui-kit-tltemptystate` | 2 | Default, With Action |
| `ui-kit-tltskeleton` | 2 | Default, Panel |
| `ui-kit-tlttable` | 3 | Default, Empty, Selectable |
| `ui-kit-tlttabs` | 2 | Default, Second Tab |

**Total documented components:** 13 (was 9; +Grid, Text/Number/Select)  
**Manifest present:** `/manifests/components.json` live  
**Coverage gate:** `npm run storybook:coverage:strict` → **100%** public barrel

## Public barrel vs Storybook coverage

Exported from `@/components/ui-kit` (index.ts):

| Export | Stories via MCP | Gap |
|---|---|---|
| CompactField | yes | — |
| CompactFieldGrid | **yes** (`ui-kit-compactfieldgrid`) | closed |
| TltTextField | **yes** (`ui-kit-tlttextfield`) | closed |
| TltNumberField | **yes** (`ui-kit-tltnumberfield`) | closed |
| TltSelect | **yes** (`ui-kit-tltselect`) | closed |
| TltAlert / Badge / Button / Card / Empty / Skeleton / Table / Tabs | yes | — |

**Coverage score (public primitives with own stories):**  
13 story-backed / 13 public components = **100%**.

## Doc quality (MCP-extracted props)

| Component | Props docs quality | Issue |
|---|---|---|
| CompactField | usable + JSDoc | props documented for agents |
| CompactFieldGrid / form fields | first-class MCP IDs | options shape + layout props in stories |
| TltButton | good variants | `type?: 'button' \| 'submit' \| 'reset'` (fixed; was `any`) |
| TltTable | structural + JSDoc | default generic + column docs; docgen may still show `columns`/`rows` as `unknown` (generic limit) — stories show real shapes |
| TltBadge | thin | few stories (acceptable) |

Import path shown in generated snippets: `from "heatcalc-frontend"` (package name) — agents need project alias `@/components/ui-kit` (already in AGENTS / README).

## Architecture signals (from stories + docs)

**Strengths**

1. Clear ownership: CompactField owns label/hint/error chrome; feature supplies control + data.
2. Real usage patterns in stories: required, error, disabled, Russian labels, tokenized widths (`--tlt-field-ctrl-*`).
3. CompactFieldGrid appears in composition story (form-grid contract in action).
4. Table stories cover empty + selection — good agent priors.
5. Button variants/loading/disabled covered.

**Risks for agents**

1. **Hallucination risk** on form controls without dedicated docs IDs (TltSelect options shape only via nested story).
2. **CompactFieldGrid** not listable as component → agents may invent props (`columns`, `flow`, `antFormAdapter`) from source instead of MCP.
3. Weak typed props on Table in MCP output (`unknown`) vs real `TltTableColumn`.
4. Stories scope = **ui-kit only** (`main.ts` stories glob). Feature Heat/Elec shells not in Storybook MCP knowledge graph.
5. No story-level a11y/test tool exercise in this audit (`run-story-tests` not run — needs Storybook Test config).

## Agent-friendliness (UI-kit via Storybook)

| Axis | Score | Comment |
|---|:---:|---|
| Discoverability (MCP index) | **9.5** | 13 components listed cleanly |
| Prop safety (no hallucination) | **8.5** | form controls + grid first-class; Button/Table types tightened |
| Composition examples | **9.0** | Grid variants + field states + composition |
| Feature coverage beyond kit | **4.0** | feature pages not in Storybook (out of scope) |
| Overall UI-kit MCP readiness | **9.0** | public kit fully story-backed + coverage gate |

## Recommended next slices (not auto-queued)

1. ~~Stories for first-class IDs~~ **done** — Grid + Text/Number/Select CSF.
2. ~~Docgen quality~~ **done** — JSDoc + Button `type` + Table generics/docs.
3. ~~Coverage gate~~ **done** — `storybook:coverage:strict` (100%).
4. Optional: heat form reference stories under ui-kit only (no domain imports).
5. Optional: wire Storybook Test / interaction tests into agent DoD for kit changes.

## Sample preview URLs (when Storybook running)

- http://127.0.0.1:6006/?path=/story/ui-kit-compactfieldgrid--default  
- http://127.0.0.1:6006/?path=/story/ui-kit-tlttextfield--default  
- http://127.0.0.1:6006/?path=/story/ui-kit-tltnumberfield--default  
- http://127.0.0.1:6006/?path=/story/ui-kit-tltselect--default  
- http://127.0.0.1:6006/?path=/story/ui-kit-compactfield--text-and-select  
- http://127.0.0.1:6006/?path=/story/ui-kit-tltbutton--all-variants  
- http://127.0.0.1:6006/?path=/story/ui-kit-tlttable--selectable  

## Residual

- Feature pages still outside Storybook MCP knowledge graph (intentional scope).
- postgres MCP still failing handshake in environment (unrelated).
- This audit is UI-kit / Storybook surface only — not full frontend architecture score.
