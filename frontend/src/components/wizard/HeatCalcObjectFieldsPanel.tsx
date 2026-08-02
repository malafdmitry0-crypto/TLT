/**
 * ============================================================================
 * PROTECTED COMPONENT — HeatCalcObjectFieldsPanel
 * ============================================================================
 *
 * Верхний блок полей теплорасчёта:
 *   • геометрия / материал / локальные элементы
 *   • размещение / климат / температуры
 *   • settings: кол-во слоёв + режим tm
 *
 * ⛔ МЕНЯТЬ ТОЛЬКО ПО ЖЁСТКОМУ ПРЯМОМУ ЗАПРОСУ.
 *    Не править «заодно» при dual-form densify, cable-panel, typography
 *    соседних блоков. Не трогать InsulationLayersTable из этого файла.
 *
 * ════════════════════════════════════════════════════════════════════
 * ⛔ HARD RULE 1 — HORIZONTAL FIELD ROW (эталон: CableAlgorithmPanel)
 * ════════════════════════════════════════════════════════════════════
 *    Каждое видимое поле — ОДНА горизонтальная строка:
 *
 *        [ label слева ]  [ control справа ]
 *
 *    Как «Температура пропарки | [____] °C» на правой форме.
 *    Запрещено: label НАД control (vertical Form layout) как default.
 *    Label может быть 1–2 строки текста, но блок label остаётся СЛЕВА.
 *    CSS: UI kit adapter `.tlt-compact-field-grid--ant-form .ant-form-item-row`
 *         → `grid-template-columns: var(--tlt-compact-label-width)
 *            var(--tlt-compact-control-width)` (ui-kit/compact-fields.css).
 *
 * ════════════════════════════════════════════════════════════════════
 * ⛔ HARD RULE 2 — UNIFIED TYPE SCALE (эталон: Алгоритм выбора кабеля)
 * ════════════════════════════════════════════════════════════════════
 *    Один набор токенов dual-form на heat + cable + inline forms:
 *      label:   8.5px / line-height 1.0 / #53667b / weight 600
 *      control: 12px / height 26px
 *      banner:  9px
 *    Источник значений — глобальные --tlt-field-* токены (styles.css :root);
 *    --dual-form-* здесь только алиасы на них.
 *    Запрещено: локальные font-size 10–11px «для читаемости» на heat.
 *
 * ════════════════════════════════════════════════════════════════════
 * ⛔ HARD RULE 3 — CONTENT-SIZED CONTROLS
 * ════════════════════════════════════════════════════════════════════
 *    Ширина CONTROL ≈ longest realistic value + chrome: пофилдовые
 *    --tlt-compact-control-width в heat-object-fields.css (значения —
 *    :root --tlt-field-ctrl-*). Не растягивать form-item на 1fr «для красоты».
 *
 * ════════════════════════════════════════════════════════════════════
 * ⛔ HARD RULE 4 — SEMANTIC GROUPS
 * ════════════════════════════════════════════════════════════════════
 *    Wide text/select идут первыми. Geometry и environment numeric живут
 *    в двух компактных колонках. Hidden-поле сжимает только свою группу;
 *    поля не мигрируют между группами.
 *
 *    CSS: heat-object-fields.css only.
 *
 * Границы:
 *   ✅ этот компонент + CSS scoped на `.heat-object-fields`
 *   ⛔ `.insulation-layers-table` / InsulationLayersTable.tsx
 *   ⛔ CableAlgorithmPanel (эталон horizontal row — не ломать)
 *
 * Слоты (composition) — содержимое полей приходит снаружи из ObjectWizard,
 * layout/DOM-границы живут здесь.
 * ============================================================================
 */

import type { ReactNode } from 'react';
import { CompactFieldGrid } from '@/components/ui-kit';
import type { HeatCalcObjectType } from '@/types/project';
import type { ObjectWizardLayoutVariant } from './ObjectWizardPanelTypes';
/** CSS island — only styles under .heat-object-fields (see WIZARD-CSS-ISLANDS.md) */
import './heat-object-fields.css';

export interface HeatCalcObjectFieldsPanelProps {
  layout: ObjectWizardLayoutVariant;
  objectType: HeatCalcObjectType;
  wideLeft: ReactNode;
  wideRight: ReactNode;
  compactLeft: ReactNode;
  compactRight: ReactNode;
  geometry: ReactNode;
  climate: ReactNode;
  insulationSettings: ReactNode;
}

export default function HeatCalcObjectFieldsPanel({
  layout,
  objectType,
  wideLeft,
  wideRight,
  compactLeft,
  compactRight,
  geometry,
  climate,
  insulationSettings,
}: HeatCalcObjectFieldsPanelProps) {
  const labelPlacement = layout === 'wide' ? 'left' : 'top';
  return (
    <div
      className={`heat-object-fields heat-object-fields--${layout}`}
      data-testid="heat-object-fields"
      data-protected="heat-object-fields"
      data-wizard-island="heat-object-fields"
      data-layout={layout}
      data-object-type={objectType}
    >
      {layout === 'wide' ? (
        <>
          <CompactFieldGrid
            className="heat-object-fields__geometry"
            data-slot="wide-left"
            density="compact" flow="columns" maxRowsPerColumn={4}
            antFormAdapter labelPlacement={labelPlacement}
          >
            {wideLeft}
          </CompactFieldGrid>
          <CompactFieldGrid
            className="heat-object-fields__geometry"
            data-slot="wide-right"
            density="compact" flow="columns" maxRowsPerColumn={4}
            antFormAdapter labelPlacement={labelPlacement}
          >
            {wideRight}
          </CompactFieldGrid>
          <CompactFieldGrid
            className="heat-object-fields__geometry"
            data-slot="compact-left"
            density="compact" flow="columns" maxRowsPerColumn={5}
            antFormAdapter labelPlacement={labelPlacement}
          >
            {compactLeft}
          </CompactFieldGrid>
          <CompactFieldGrid
            className="heat-object-fields__geometry"
            data-slot="compact-right"
            density="compact" flow="columns" maxRowsPerColumn={5}
            antFormAdapter labelPlacement={labelPlacement}
          >
            {compactRight}
          </CompactFieldGrid>
        </>
      ) : (
        <>
          <CompactFieldGrid
            className="heat-object-fields__geometry"
            data-slot={layout === 'wide' ? 'wide' : 'geometry'}
            density="compact" flow="columns" maxRowsPerColumn={5}
            antFormAdapter labelPlacement={labelPlacement}
          >
            {geometry}
          </CompactFieldGrid>
          <CompactFieldGrid
            className="heat-object-fields__climate"
            data-slot={layout === 'wide' ? 'geometry-numeric' : 'climate'}
            density="compact" flow="columns" maxRowsPerColumn={5}
            antFormAdapter labelPlacement={labelPlacement}
          >
            {climate}
          </CompactFieldGrid>
          <CompactFieldGrid
            className="heat-object-fields__settings"
            data-slot={layout === 'wide' ? 'environment-numeric' : 'insulation-settings'}
            density="compact" flow="columns" maxRowsPerColumn={5}
            antFormAdapter labelPlacement={labelPlacement}
          >
            {insulationSettings}
          </CompactFieldGrid>
        </>
      )}
    </div>
  );
}
