import { Tag, Tooltip, Typography } from 'antd';
import { CloseCircleFilled } from '@ant-design/icons';

import type { ElectricalErrorSummaryItem } from '@/pages/electrical/elecCalcErrorSummaryModel';
import type { ElectricalErrorGuidance } from '@/utils/electricalErrorGuidance';

const { Text } = Typography;

type ElecCalcErrorSummaryProps = {
  failedCount: number;
  activeRowId: string | null;
  item: ElectricalErrorSummaryItem | null;
  guidance: ElectricalErrorGuidance | null;
};

/** Баннер сообщений об ошибках электрорасчёта на текущей странице таблицы. */
export default function ElecCalcErrorSummary({
  failedCount,
  activeRowId,
  item,
  guidance,
}: ElecCalcErrorSummaryProps) {
  if (failedCount <= 0) return null;
  return (
    <div className="electrical-error-summary" aria-label="Сообщения ошибок электрорасчёта">
      <div className="electrical-error-summary__header">
        <Tag color="error" icon={<CloseCircleFilled />}>
          Ошибок: {failedCount}
        </Tag>
      </div>
      {item?.error ? (
        <div className="electrical-error-summary__record">
          <Tooltip title={item.error}>
            <Text type="secondary" ellipsis className="electrical-error-summary__message">
              {item.error}
            </Text>
          </Tooltip>
          {item.fallback && (
            <Text type="secondary" className="electrical-error-summary__hint">
              Показана первая ошибка на текущей странице. Выберите строку, чтобы переключить сообщение.
            </Text>
          )}
          {guidance && (
            <div className="electrical-error-summary__suggestions" aria-label="Предложения по исправлению ошибки">
              <Tag color={guidance.tagColor} className="electrical-error-summary__kind">
                {guidance.label}
              </Tag>
              <Text type="secondary" className="electrical-error-summary__suggestion-label">
                Что попробовать:
              </Text>
              {guidance.suggestions.map((suggestion) => (
                <Tag key={suggestion} className="electrical-error-summary__suggestion-tag">
                  {suggestion}
                </Tag>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Любое состояние без текста ошибки (нет item, выбранная строка без
        // расчёта, item без error) — иначе пользователь видит счётчик без объяснения.
        <Text type="secondary" className="electrical-error-summary__empty">
          {item || activeRowId
            ? 'Для выбранной строки нет текста ошибки. Выберите строку с ошибкой или найдите её на других страницах таблицы.'
            : 'Ошибки есть вне текущей страницы таблицы.'}
        </Text>
      )}
    </div>
  );
}
