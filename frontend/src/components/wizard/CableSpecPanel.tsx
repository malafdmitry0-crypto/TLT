import { Form } from "antd";

import UnitInputNumber from "@/components/common/UnitInputNumber";
import { CompactFieldGrid } from "@/components/ui-kit";
import { TltSelect } from "@/components/form-controls";
import FieldLabel from "@/components/wizard/FieldLabel";
import { TltNumberField } from "@/components/ui-kit";

/** CSS island — same styling as cable-algorithm-panel (shared root class). */
import "./cable-algorithm-panel.css";

export default function CableSpecPanel() {
  return (
    <div
      className="object-wizard-cable-spec-panel cable-island"
      data-panel="cable-spec"
      data-testid="heat-cable-spec-form"
      data-protected="heat-cable-spec"
      data-wizard-island="cable-spec"
    >
      <h4 className="inline-form-section-banner inline-form-section-banner--cable">
        <span>Подбор спецификации</span>
      </h4>
      <div className="cable-algorithm-grid" data-layout="cable-algorithm">
        <CompactFieldGrid
          className="cable-algorithm-fields"
          columns={2}
          flow="columns"
          maxRowsPerColumn={4}
          antFormAdapter
          labelPlacement="left"
        >
          <Form.Item
            className="cable-algorithm-field helped-form-item"
            label={<FieldLabel text="Тип зон по взрывоопасности" />}
            name="explosion_zone_type"
          >
            <TltSelect
              data-testid="explosion-zone-type-select"
              options={[
                { value: "yes", label: "Да" },
                { value: "no", label: "Нет" },
              ]}
            />
          </Form.Item>

          <Form.Item
            className="cable-algorithm-field helped-form-item"
            label={<FieldLabel text="Индикация питающих на коробках" />}
            name="power_indication_on_boxes"
          >
            <TltSelect
              data-testid="power-indication-on-boxes-select"
              options={[
                { value: "yes", label: "Да" },
                { value: "no", label: "Нет" },
              ]}
            />
          </Form.Item>

          <Form.Item
            className="cable-algorithm-field helped-form-item"
            label={<FieldLabel text="Дополнительная индикация в конце нагревательной секции" />}
            name="end_of_section_indication"
          >
            <TltSelect
              data-testid="end-of-section-indication-select"
              options={[
                { value: "yes", label: "Да" },
                { value: "no", label: "Нет" },
              ]}
            />
          </Form.Item>

          <Form.Item
            className="cable-algorithm-field helped-form-item"
            label={<FieldLabel text="Дополнительная индикация сверху коробки" />}
            name="top_of_box_indication"
          >
            <TltSelect
              data-testid="top-of-box-indication-select"
              options={[
                { value: "yes", label: "Да" },
                { value: "no", label: "Нет" },
              ]}
            />
          </Form.Item>

          <Form.Item
            className="cable-algorithm-field helped-form-item cable-spec-number-field"
            label={<FieldLabel text="Минимальная длина нагревательной секции для К2i" />}
            name="min_length_for_k2i"
          >
            <UnitInputNumber
              data-testid="min-length-for-k2i-input"
              min={0}
              max={10000}
              step={0.1}
              aria-label="Минимальная длина секции для К2i"
              unit="L"
            />
          </Form.Item>

          <Form.Item
            className="cable-algorithm-field helped-form-item cable-spec-number-field"
            label={<FieldLabel text="Коэффициент горячего резервирования, группа" />}
            name="hot_reserve_coefficient"
          >
            <TltNumberField
              data-testid="hot-reserve-coefficient-input"
              min={1}
              max={10}
              step={0.1}
              aria-label="Коэффициент горячего резервирования"
              className="cable-algorithm-number"
              unit="R"
            />
          </Form.Item>
        </CompactFieldGrid>
      </div>
    </div>
  );
}
