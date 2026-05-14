import type { CSSProperties, ReactNode } from 'react';
import { InputNumber, Space, type InputNumberProps } from 'antd';

type UnitInputNumberProps = Omit<InputNumberProps, 'addonAfter' | 'addonBefore'> & {
  unit: ReactNode;
  addonClassName?: string;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
};

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
    <Space.Compact
      className={joinClassNames('unit-input-number', wrapperClassName)}
      style={wrapperStyle}
    >
      <InputNumber {...inputProps} />
      <span
        className={joinClassNames('unit-input-number__addon', addonClassName)}
        aria-hidden="true"
      >
        {unit}
      </span>
    </Space.Compact>
  );
}
