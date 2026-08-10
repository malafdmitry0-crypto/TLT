import { Tooltip, Typography } from 'antd';
import { CloseCircleFilled } from '@ant-design/icons';
import { TltBadge } from '@/components/ui-kit';

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
  const displayError = guidance?.message ?? item?.error;
  return (
    <div className="electrical-error-summary" aria-label="Сообщения ошибок электрорасчёта">
      <div className="electrical-error-summary__header">
        <TltBadge tone="danger">
          <CloseCircleFilled /> Ошибок: {failedCount}
        </TltBadge>
      </div>
      {displayError ? (
        <div className="electrical-error-summary__record">
          <Tooltip title={displayError}>
            <Text type="secondary" ellipsis className="electrical-error-summary__message">
              {displayError}
            </Text>
          </Tooltip>
          {item?.fallback && (
            <Text type="secondary" className="electrical-error-summary__hint">
              Показана первая ошибка на текущей странице. Выберите строку, чтобы переключить сообщение.
            </Text>
          )}
          {guidance && (
            <div className="electrical-error-summary__suggestions" aria-label="Предложения по исправлению ошибки">
              <TltBadge
                tone={
                  guidance.tagColor === 'error'
                  || guidance.tagColor === 'red'
                  || guidance.tagColor === 'magenta'
                  || guidance.tagColor === 'volcano'
                    ? 'danger'
                    : guidance.tagColor === 'warning'
                      || guidance.tagColor === 'orange'
                      || guidance.tagColor === 'gold'
                      ? 'warning'
                      : guidance.tagColor === 'success' || guidance.tagColor === 'green'
                        ? 'success'
                        : guidance.tagColor === 'blue'
                          || guidance.tagColor === 'processing'
                          || guidance.tagColor === 'cyan'
                          ? 'info'
                          : 'neutral'
                }
                className="electrical-error-summary__kind"
              >
                {guidance.label}
              </TltBadge>
              <Text type="secondary" className="electrical-error-summary__suggestion-label">
                Что попробовать:
              </Text>
              {guidance.suggestions.map((suggestion) => (
                <TltBadge key={suggestion} className="electrical-error-summary__suggestion-tag">
                  {suggestion}
                </TltBadge>
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
