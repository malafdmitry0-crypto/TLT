#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

current_er_docs=(
  "codex-docs/source-documents.md"
  "codex-docs/project-map.md"
  "codex-docs/requirements-map.md"
  "codex-docs/development-guide.md"
  "docs/api.md"
  "docs/business-logic-contract.md"
  "docs/db_schema.md"
  "docs/srs.md"
  "docs/playbooks/deep-business-logic-qa.md"
  "docs/playbooks/eleccalc-page-decomposition-prompts.md"
  "docs/playbooks/eleccalc-safe-split-nightly-prompt.md"
  "docs/playbooks/electrical-auto-recalculation-scope-prompt.md"
  "docs/qa/automation-coverage.md"
  "docs/qa/test-cases-electrical.md"
  "docs/qa/test-cases-reports.md"
  "docs/tnp/cases/guest-specification/README.md"
  "docs/tnp/cases/guest-specification/phase-5-checkpoint.md"
  "frontend/CLAUDE.MD"
  "ТЗ/README.md"
  "ТЗ/01-obshchie-polozheniya.md"
  "ТЗ/02-funkcionalnye-trebovaniya.md"
  "ТЗ/08-validaciya-dannyh.md"
  "ТЗ/17-checklist-mirovogo-urovnya.md"
)

failed=0

stale_null="$(rg -n 'Пятый ЭР.{0,80}legacy_variant_number=null|legacy_variant_number=null.{0,80}пят' "${current_er_docs[@]}" || true)"
if [[ -n "$stale_null" ]]; then
  echo "Semantic docs drift: fifth ER must not be documented as legacy_variant_number=null" >&2
  echo "$stale_null" >&2
  failed=1
fi

fixed_slots="$(
  rg -n '(СО|CO)[[:space:]]*1[[:space:]]*(…|\.\.)[[:space:]]*(СО|CO)?[[:space:]]*4|CO1\.\.CO4|СО1\.\.СО4' "${current_er_docs[@]}" \
    | rg -vi 'legacy|histor|истор|baseline|fixed|стар|замен|supersed|до реализации' \
    || true
)"
if [[ -n "$fixed_slots" ]]; then
  echo "Semantic docs drift: fixed CO1..CO4 is presented as a current contract" >&2
  echo "$fixed_slots" >&2
  failed=1
fi

old_range="$(
  rg -n '(variant_number|slot|adapter|graph).{0,100}(1…4|1\.\.4)' "${current_er_docs[@]}" \
    | rg -vi 'legacy|histor|истор|baseline|стар|до migration|guard|gap|ошибочно|отклоняют|supersed' \
    || true
)"
if [[ -n "$old_range" ]]; then
  echo "Semantic docs drift: current numeric compatibility range regressed to 1..4" >&2
  echo "$old_range" >&2
  failed=1
fi

for legacy_srs in $(rg -l '(СО|CO)[[:space:]]*[1-4]' docs/srs --glob '*.md' || true); do
  if ! rg -q 'ER-SUPERSESSION' "$legacy_srs"; then
    echo "Semantic docs drift: legacy fixed-CO SRS lacks ER-SUPERSESSION: $legacy_srs" >&2
    failed=1
  fi
done

historical_status_docs=(
  "docs/context/early-stage-status.md"
  "docs/tz-compliance.md"
  "docs/analysis/full-version-status.md"
  "docs/analysis/current-status-and-missing-info.md"
  "docs/analysis/business-logic-strengths-weaknesses.md"
  "docs/tnp/cases/guest-specification/dynamic-er-implementation-super-prompt.md"
  "docs/tnp/cases/guest-specification/verification-log.md"
)
for historical_doc in "${historical_status_docs[@]}"; do
  if ! rg -q '\[!WARNING\]' "$historical_doc"; then
    echo "Semantic docs drift: historical status file lacks warning: $historical_doc" >&2
    failed=1
  fi
done

if (( failed != 0 )); then
  exit 1
fi

echo "semantic docs facts: ok"
