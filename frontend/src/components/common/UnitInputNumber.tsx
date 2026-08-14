import type { CSSProperties, ReactNode } from 'react';
import type { InputNumberProps } from 'antd';
import { TltNumberField } from '@/components/form-controls';
import type { TltNumberFieldProps } from '@/components/form-controls';

type UnitInputNumberProps = Omit<InputNumberProps, 'addonAfter' | 'addonBefore'> & {
  unit: ReactNode;
  addonClassName?: string;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
} & Pick<TltNumberFieldProps, 'preserveOutOfRangeDraft'>;

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

export default function UnitInputNumber({
  unit,
  addonClassName,
  wrapperClassName,
  wrapperStyle,
  ...inputProps
}: UnitInputNumberProps) {
  return (
    <TltNumberField
      {...inputProps}
      addonClassName={joinClassNames('unit-input-number__addon', addonClassName)}
      className={joinClassNames('unit-input-number', wrapperClassName)}
      unit={unit}
      wrapperStyle={wrapperStyle}
    />
  );
}
