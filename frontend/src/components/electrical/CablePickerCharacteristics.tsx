import type { ProjectObject } from '@/types/project';
import type { CSSProperties } from 'react';
import {
  buildCableFields,
  buildObjectFields,
  characteristicsAriaLabel,
  splitIntoColumns,
  type CablePickerCableRow,
  type CablePickerFieldItem,
} from '@/components/electrical/cablePickerCharacteristicsModel';
import '@/components/electrical/CablePickerCharacteristics.css';

interface CablePickerCharacteristicsProps {
  object: ProjectObject;
  cable: CablePickerCableRow | null;
  cableType?: string | null;
  showObject?: boolean;
  showCable?: boolean;
  objectColumnCount?: number;
  cableColumnCount?: number;
}

export default function CablePickerCharacteristics({
  object,
  cable,
  cableType,
  showObject = true,
  showCable = true,
  objectColumnCount = 2,
  cableColumnCount = 2,
}: CablePickerCharacteristicsProps) {
  const objectFields = buildObjectFields(object);
  const cableFields = buildCableFields(cable, cableType);
  const visibleSectionCount = Number(showObject) + Number(showCable);
  const ariaLabel = characteristicsAriaLabel(showObject, showCable);

  const renderList = (
    title: string,
    items: CablePickerFieldItem[],
    columnCount: number,
  ) => (
    <section
      className="cable-picker-characteristics-section"
      role="group"
      aria-label={`Характеристики: ${title.toLowerCase()}`}
    >
      <h3 className="cable-picker-characteristics-title">{title}</h3>
      <div
        className="cable-picker-characteristics-columns"
        style={{
          '--cable-picker-characteristics-column-count': columnCount,
        } as CSSProperties}
      >
        {splitIntoColumns(items, columnCount).map((column, index) => (
          <dl key={`${title}-${index}`} className="cable-picker-characteristics-list">
            {column.map((item) => (
              <div key={item.key} className="cable-picker-characteristics-row">
                <dt className="cable-picker-characteristics-label">
                  <span>{item.label}</span>
                  <span aria-hidden="true">:</span>
                </dt>
                <dd className="cable-picker-characteristics-value">{item.value}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </section>
  );

  return (
    <div
      className={`cable-picker-characteristics${visibleSectionCount === 1 ? ' cable-picker-characteristics--single' : ''}`}
      aria-label={ariaLabel}
    >
      {showObject && renderList('Объект', objectFields, objectColumnCount)}
      {showCable && renderList('Кабель', cableFields, cableColumnCount)}
    </div>
  );
}
