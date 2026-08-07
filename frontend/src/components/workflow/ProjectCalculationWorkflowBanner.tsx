import { useNavigate } from 'react-router-dom';

import type { CalculationWorkflow } from '@/api/calculationWorkflows';
import { TltAlert, TltButton } from '@/components/ui-kit';
import { ROUTES } from '@/routes/routes';

const STAGE_LABELS: Record<string, string> = {
  queued: 'в очереди',
  heat: 'тепловой расчёт',
  electrical: 'электротехнический расчёт',
  specification_preflight: 'проверка спецификации',
  waiting_input: 'ожидание выбора спецификации',
  specification: 'формирование спецификации',
};

export function ProjectCalculationWorkflowBanner({
  workflow,
  cancelPending,
  onCancel,
}: {
  workflow: CalculationWorkflow;
  cancelPending: boolean;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const waiting = workflow.status === 'waiting_input';
  const progress = workflow.progress.percent == null
    ? null
    : ` · ${Math.round(workflow.progress.percent)}%`;

  return (
    <TltAlert
      tone={waiting ? 'warning' : 'info'}
      title={waiting ? 'Расчёт ожидает вашего ответа' : 'Проект временно заблокирован расчётом'}
      action={(
        <>
          {waiting && (
            <TltButton size="compact" variant="primary" onClick={() => navigate(ROUTES.specification)}>
              Открыть спецификацию
            </TltButton>
          )}
          {waiting && ' '}
          <TltButton size="compact" loading={cancelPending} onClick={onCancel}>
            Отменить
          </TltButton>
        </>
      )}
    >
      Этап: {STAGE_LABELS[workflow.stage] ?? workflow.stage}{progress}.
      Изменения расчётных данных заблокированы на frontend и backend.
    </TltAlert>
  );
}
