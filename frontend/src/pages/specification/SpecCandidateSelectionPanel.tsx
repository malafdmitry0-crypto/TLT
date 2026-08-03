/**
 * @module specification/candidate-selection
 * Minimal UI for SPEC-CANON-03 multi-candidate accessory selection.
 */
import type { ReactNode } from 'react';
import { Typography } from 'antd';
import { TltButton, TltCard } from '@/components/ui-kit';
import type { SpecificationCandidateGroup } from '@/api/specifications';

const { Text } = Typography;

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

function needsUserChoice(group: SpecificationCandidateGroup): boolean {
  return group.candidates.length > 1 && !group.selected_catalog_item_id;
}

function formatConditions(conditions: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof conditions.temperature_group === 'string') {
    parts.push(`T: ${conditions.temperature_group}`);
  }
  if (typeof conditions.mark === 'string') {
    parts.push(`марка: ${conditions.mark}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function SpecCandidateSelectionPanel({
  groups,
  draftSelections,
  onSelect,
  onConfirm,
  confirming = false,
  disabled = false,
}: SpecCandidateSelectionPanelProps): ReactNode {
  const choosable = groups.filter(needsUserChoice);
  if (choosable.length === 0) return null;

  const allChosen = choosable.every((group) => Boolean(draftSelections[group.group_key]));

  return (
    <TltCard
      className="specification-candidate-panel"
      padding="compact"
      data-testid="spec-candidate-selection"
    >
      <Text strong className="specification-candidate-title">
        Выбор комплектующих
      </Text>
      <Text type="secondary" className="specification-candidate-intro">
        Для нескольких позиций каталога требуется явный выбор. Первый кандидат не
        предвыбирается.
      </Text>
      <ul className="specification-candidate-groups">
        {choosable.map((group) => {
          const conditionLabel = formatConditions(group.conditions);
          const selectedId = draftSelections[group.group_key] ?? null;
          return (
            <li key={group.group_key} className="specification-candidate-group">
              <div className="specification-candidate-group-head">
                <Text strong>
                  {CATEGORY_LABELS[group.category] ?? group.category}
                </Text>
                {conditionLabel ? (
                  <Text type="secondary" className="specification-candidate-conditions">
                    {conditionLabel}
                  </Text>
                ) : null}
              </div>
              <ul className="specification-candidate-list" role="listbox" aria-label={group.category}>
                {group.candidates.map((candidate) => {
                  const isSelected = selectedId === candidate.catalog_item_id;
                  return (
                    <li key={candidate.catalog_item_id}>
                      <button
                        type="button"
                        className={
                          isSelected
                            ? 'specification-candidate-option is-selected'
                            : 'specification-candidate-option'
                        }
                        aria-selected={isSelected}
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
          disabled={!allChosen || disabled}
          loading={confirming}
          onClick={onConfirm}
        >
          Применить выбор и сформировать
        </TltButton>
      </div>
    </TltCard>
  );
}
