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
 * ⛔ HARD RULE 4 — MAX 5 FIELDS PER COLUMN + REFLOW
 * ════════════════════════════════════════════════════════════════════
 *    В одном столбце не больше 5 видимых полей.
 *    6-е и далее переносятся в следующий столбец.
 *    CSS: grid-template-rows: repeat(5, auto); grid-auto-flow: column;
 *    Слоты geometry/climate/settings → display:contents (единый поток).
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
import type { ObjectWizardLayoutVariant } from './ObjectWizardPanelTypes';
/** CSS island — only styles under .heat-object-fields (see WIZARD-CSS-ISLANDS.md) */
import './heat-object-fields.css';

export interface HeatCalcObjectFieldsPanelProps {
  layout: ObjectWizardLayoutVariant;
  /** name + geometry + wall material + fittings (wide: local elements) */
  geometry: ReactNode;
  /** placement/ground (wide) + temperature/climate */
  climate: ReactNode;
  /** insulation_layer_count + insulation_temperature_basis */
  insulationSettings: ReactNode;
}

export default function HeatCalcObjectFieldsPanel({
  layout,
  geometry,
  climate,
  insulationSettings,
}: HeatCalcObjectFieldsPanelProps) {
  /* wide: горизонтальные строки [label | control]; side: label над контролом */
  const labelPlacement = layout === 'wide' ? 'left' : 'top';
  return (
    <div
      className={`heat-object-fields heat-object-fields--${layout}`}
      data-testid="heat-object-fields"
      data-protected="heat-object-fields"
      data-wizard-island="heat-object-fields"
      data-layout={layout}
    >
      <CompactFieldGrid
        className="heat-object-fields__geometry"
        data-slot="geometry"
        density="compact"
        flow="columns"
        maxRowsPerColumn={5}
        antFormAdapter
        labelPlacement={labelPlacement}
      >
        {geometry}
      </CompactFieldGrid>
      <CompactFieldGrid
        className="heat-object-fields__climate"
        data-slot="climate"
        density="compact"
        flow="columns"
        maxRowsPerColumn={5}
        antFormAdapter
        labelPlacement={labelPlacement}
      >
        {climate}
      </CompactFieldGrid>
      <CompactFieldGrid
        className="heat-object-fields__settings"
        data-slot="insulation-settings"
        density="compact"
        flow="columns"
        maxRowsPerColumn={5}
        antFormAdapter
        labelPlacement={labelPlacement}
      >
        {insulationSettings}
      </CompactFieldGrid>
    </div>
  );
}
