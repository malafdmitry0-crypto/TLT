/**
 * @module specification/candidate-selection
 * Minimal UI for SPEC-CANON-03 multi-candidate accessory selection.
 */
import type { ReactNode } from 'react';
import { TltButton, TltCard } from '@/components/ui-kit';
import {
  candidateGroupNeedsUserChoice,
  type SpecificationCandidateGroup,
} from '@/api/specifications';
import './specification-candidate-selection.css';

const CATEGORY_LABELS: Record<string, string> = {
  cable: 'Кабель',
  connection_kit: 'Соединительный комплект',
  repair_kit: 'Ремонтный комплект',
  sealant: 'Герметик',
  fiberglass_tape: 'Стеклолента',
  aluminium_tape: 'Алюминиевая лента',
};

export type SpecCandidateSelectionPanelProps = {
  groups: SpecificationCandidateGroup[];
  /** Draft picks for groups that still need a choice (no preselect). */
  draftSelections: Record<string, string>;
  onSelect: (groupKey: string, catalogItemId: string) => void;
  onConfirm: () => void;
  confirming?: boolean;
  disabled?: boolean;
};

function formatConditions(conditions: Record<string, unknown>): string | null {
  const parts = Object.entries(conditions)
    .filter((entry): entry is [string, string | number | boolean] => (
      ['string', 'number', 'boolean'].includes(typeof entry[1])
    ))
    .map(([key, value]) => `${key}: ${String(value)}`);
  return parts.length ? parts.join(' · ') : null;
}

function formatParameters(
  label: string,
  parameters: Record<string, unknown> | undefined,
): string | null {
  const values = Object.entries(parameters ?? {})
    .filter((entry): entry is [string, string | number | boolean] => (
      ['string', 'number', 'boolean'].includes(typeof entry[1])
    ))
    .map(([key, value]) => `${key}=${String(value)}`);
  return values.length ? `${label}: ${values.join(', ')}` : null;
}

export function SpecCandidateSelectionPanel({
  groups,
  draftSelections,
  onSelect,
  onConfirm,
  confirming = false,
  disabled = false,
}: SpecCandidateSelectionPanelProps): ReactNode {
  const choosable = groups.filter(candidateGroupNeedsUserChoice);
  if (choosable.length === 0) return null;

  const allChosen = choosable.every((group) => Boolean(draftSelections[group.group_key]));

  return (
    <TltCard
      className="specification-candidate-panel"
      padding="compact"
      data-testid="spec-candidate-selection"
    >
      <strong className="specification-candidate-title">
        Выбор комплектующих
      </strong>
      <span className="specification-candidate-intro">
        Для нескольких позиций каталога требуется явный выбор. Первый кандидат не
        предвыбирается.
      </span>
      <ul className="specification-candidate-groups">
        {choosable.map((group) => {
          const conditionLabel = formatConditions(group.conditions);
          const selectedId = draftSelections[group.group_key] ?? null;
          return (
            <li key={group.group_key} className="specification-candidate-group">
              <div className="specification-candidate-group-head">
                <strong>
                  {CATEGORY_LABELS[group.category] ?? group.category}
                </strong>
                <span className="specification-candidate-conditions">
                  ЭР: {group.electrical_variant_id}
                </span>
                {conditionLabel ? (
                  <span className="specification-candidate-conditions">
                    {conditionLabel}
                  </span>
                ) : null}
              </div>
              <ul className="specification-candidate-list" role="group" aria-label={group.category}>
                {group.candidates.map((candidate) => {
                  const isSelected = selectedId === candidate.catalog_item_id;
                  const packageLabel = formatParameters(
                    'поставка',
                    candidate.package_parameters,
                  );
                  const formulaLabel = formatParameters(
                    'формула',
                    candidate.formula_parameters,
                  );
                  return (
                    <li key={candidate.catalog_item_id}>
                      <button
                        type="button"
                        className={
                          isSelected
                            ? 'specification-candidate-option is-selected'
                            : 'specification-candidate-option'
                        }
                        aria-pressed={isSelected}
                        disabled={disabled || confirming}
                        onClick={() => onSelect(group.group_key, candidate.catalog_item_id)}
                      >
                        <span className="specification-candidate-option-name">
                          {candidate.name}
                        </span>
                        <span className="specification-candidate-option-meta">
                          {candidate.mark}
                          {' · '}
                          {candidate.nomenclature_code}
                          {' · '}
                          {candidate.supply_unit}
                        </span>
                        {packageLabel ? (
                          <span className="specification-candidate-option-meta">{packageLabel}</span>
                        ) : null}
                        {formulaLabel ? (
                          <span className="specification-candidate-option-meta">{formulaLabel}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      <div className="specification-candidate-actions">
        <TltButton
          variant="primary"
          disabled={!allChosen || disabled || confirming}
          loading={confirming}
          onClick={onConfirm}
        >
          Применить выбор и сформировать
        </TltButton>
      </div>
    </TltCard>
  );
}
