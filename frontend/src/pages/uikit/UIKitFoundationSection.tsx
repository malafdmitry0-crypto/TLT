import { message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { CompactSection } from '@/components/ui-kit/CompactUi';
import { colorTokens } from '@/pages/uikit/uiKitModel';

function Swatch({ name, value, className }: (typeof colorTokens)[number]) {
  const copy = () => {
    void navigator.clipboard?.writeText(value);
    void message.success(`${value} скопирован`);
  };

  return (
    <button className="uikit-swatch" type="button" onClick={copy} aria-label={`Скопировать ${name}: ${value}`}>
      <span className={`uikit-swatch__color uikit-swatch__color--${className}`} />
      <span className="uikit-swatch__meta">
        <strong>{name}</strong>
        <code>{value}</code>
      </span>
      <CopyOutlined aria-hidden="true" />
    </button>
  );
}

export function UIKitFoundationSection() {
  return (
    <CompactSection id="foundation" index="01" title="Основа" description="Цвет, типографика и системные интервалы.">
      <div className="uikit-grid uikit-grid--colors">
        {colorTokens.map((token) => <Swatch key={token.value} {...token} />)}
      </div>
      <div className="uikit-foundation-grid">
        <div className="uikit-specimen">
          <span className="uikit-card-label">Типографика</span>
          <div className="uikit-font-contract">
            <strong>System UI</strong>
            <code>-apple-system · BlinkMacSystemFont · Segoe UI · system-ui</code>
          </div>
          <div className="uikit-type-row"><span>14 / 16 · 800</span><strong className="uikit-type-display">Расчёт теплопотерь</strong></div>
          <div className="uikit-type-row"><span>12 / 16 · 600</span><strong className="uikit-type-heading">Параметры объекта</strong></div>
          <div className="uikit-type-row"><span>11 / 14 · 400</span><p>Расчётная температура наружного воздуха</p></div>
          <div className="uikit-type-row"><span>10 / 12 · 600</span><code>Q = 184,6 Вт/м</code></div>
        </div>
        <div className="uikit-specimen">
          <span className="uikit-card-label">Сетка и радиусы</span>
          <div className="uikit-spacing-scale">
            {[4, 8, 12, 16, 24, 32].map((value) => (
              <div key={value}><span style={{ width: `${value * 2}px` }} /><code>{value}</code></div>
            ))}
          </div>
          <div className="uikit-radius-row"><span className="radius-2">2</span><span className="radius-4">4</span><span className="radius-8">8</span><span className="radius-round">∞</span></div>
        </div>
      </div>
    </CompactSection>
  );
}
