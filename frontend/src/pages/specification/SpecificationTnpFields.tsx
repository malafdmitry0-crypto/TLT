/**
 * @module specification/tnp-fields
 * @owner specification
 * Two-state generation fields: every value is always explicit Да or Нет.
 */
import {
  CompactField,
  CompactFieldGrid,
  TltNumberField,
  TltSelect,
} from '@/components/ui-kit';
import type {
  SpecGenerateField,
  SpecGenerateFieldErrors,
} from '@/pages/specification/specGenerateOptionsModel';

type BinaryField = {
  field: SpecGenerateField;
  id: string;
  label: string;
  value: boolean;
  setValue: (value: boolean) => void;
  ariaLabel: string;
};

type SpecificationTnpFieldsProps = {
  disabled: boolean;
  errors: SpecGenerateFieldErrors;
  fields: BinaryField[];
  minLengthK2i: string;
  reserveCoeff: string;
  setMinLengthK2i: (value: string) => void;
  setReserveCoeff: (value: string) => void;
};

export function SpecificationTnpFields({
  disabled,
  errors,
  fields,
  minLengthK2i,
  reserveCoeff,
  setMinLengthK2i,
  setReserveCoeff,
}: SpecificationTnpFieldsProps) {
  return (
    <CompactFieldGrid columns={2} flow="rows" sizing="equal" density="comfortable" antFormAdapter={false}>
      {fields.map(({ field, id, label, value, setValue, ariaLabel }) => (
        <CompactField
          key={id}
          layout="vertical"
          label={label}
          controlWidth="100%"
          required
          error={errors[field] ? <span id={`${id}-error`}>{errors[field]}</span> : undefined}
        >
          <TltSelect
            id={id}
            className="specification-settings-field-full"
            required
            status={errors[field] ? 'error' : ''}
            aria-describedby={errors[field] ? `${id}-error` : undefined}
            value={value ? 'yes' : 'no'}
            disabled={disabled}
            onChange={(next) => setValue(next === 'yes')}
            options={[
              { value: 'yes', label: 'Да' },
              { value: 'no', label: 'Нет' },
            ]}
            aria-label={ariaLabel}
          />
        </CompactField>
      ))}
      <CompactField
        layout="vertical"
        label="L,К2i — мин. длина секции, м"
        controlWidth="100%"
        required
        error={errors.minLengthK2i
          ? <span id="spec-l-k2i-error">{errors.minLengthK2i}</span>
          : undefined}
      >
        <TltNumberField
          id="spec-l-k2i"
          required
          status={errors.minLengthK2i ? 'error' : ''}
          aria-describedby={errors.minLengthK2i ? 'spec-l-k2i-error' : undefined}
          aria-label="Параметр L К2i"
          min={0}
          step={0.1}
          disabled={disabled}
          value={minLengthK2i === '' ? null : Number(minLengthK2i)}
          onChange={(value) => setMinLengthK2i(value == null ? '' : String(value))}
          className="specification-settings-field-full"
          unit="м"
        />
      </CompactField>
      <CompactField
        layout="vertical"
        label="R,гр — горячее резервирование"
        controlWidth="100%"
        required
        error={errors.reserveCoeff
          ? <span id="spec-r-gr-error">{errors.reserveCoeff}</span>
          : undefined}
      >
        <TltNumberField
          id="spec-r-gr"
          required
          status={errors.reserveCoeff ? 'error' : ''}
          aria-describedby={errors.reserveCoeff ? 'spec-r-gr-error' : undefined}
          aria-label="Параметр R гр"
          step={0.1}
          disabled={disabled}
          value={reserveCoeff === '' ? null : Number(reserveCoeff)}
          onChange={(value) => setReserveCoeff(value == null ? '' : String(value))}
          className="specification-settings-field-full"
        />
      </CompactField>
    </CompactFieldGrid>
  );
}
