/**
 * Status column renderers for electrical main table (P-BAND-03).
 */
import { Tooltip } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  MinusCircleFilled,
} from '@ant-design/icons';

import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import {
  electricalCalcError,
  electricalCalcHint,
  isElectricalCalcStale,
  isElectricalCalcSuccess,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import type { ElectricalColumnRenderSpec } from '@/pages/electrical/elecCalcPageModel';
import { valueText } from '@/domain/electrical/elecCalcResultValueModel';
import { TltBadge } from '@/components/ui-kit';

export function antColorToTltTone(
  color: string | undefined,
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  switch (color) {
    case 'success':
    case 'green':
      return 'success';
    case 'error':
    case 'red':
    case 'volcano':
    case 'magenta':
      return 'danger';
    case 'warning':
    case 'gold':
    case 'orange':
      return 'warning';
    case 'default':
    case undefined:
      return 'neutral';
    default:
      return 'info';
  }
}

export function buildElecCalcStatusColumnRenderers(
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>,
): Partial<Record<ElectricalColumnKey, ElectricalColumnRenderSpec>> {
  return {
    heat_loss_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        if (obj.is_valid) {
          return (
            <Tooltip title="Рассчитан">
              <TltBadge className="heatloss-status-icon-tag" tone="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        }
        if (obj.validation_errors?.category === 'unsupported') {
          return (
            <Tooltip title={valueText(obj.validation_errors?.message ?? obj.validation_errors)}>
              <TltBadge tone="neutral">Не применимо</TltBadge>
            </Tooltip>
          );
        }
        return (
          <Tooltip
            title={valueText(
              obj.validation_errors?.message ??
              obj.validation_errors,
            )}
          >
            <TltBadge className="heatloss-status-icon-tag" tone="danger" aria-label="Ошибка">
              <CloseCircleFilled />
            </TltBadge>
          </Tooltip>
        );
      },
    },
    electrical_status: {
      align: 'center',
      render: (_: unknown, obj) => {
        const calc = calcByObjectId[obj.id];
        const err = electricalCalcError(calc);
        const unsupported = isElectricalCalcUnsupported(calc);
        const stale = isElectricalCalcStale(calc);
        if (isElectricalCalcSuccess(calc))
          return (
            <Tooltip title="Рассчитан">
              <TltBadge className="electrical-status-icon-tag" tone="success" aria-label="Рассчитан">
                <CheckCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        if (unsupported)
          return (
            <Tooltip title={electricalCalcHint(calc) ?? err ?? 'Не применимо'}>
              <TltBadge
                className="electrical-status-icon-tag"
                tone="neutral"
                aria-label="Не применимо"
              >
                <MinusCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        if (stale)
          return (
            <Tooltip title={electricalCalcHint(calc) ?? 'Требуется пересчёт'}>
              <TltBadge className="electrical-status-icon-tag" tone="warning" aria-label="Требуется пересчёт">
                ↻
              </TltBadge>
            </Tooltip>
          );
        if (err)
          return (
            <Tooltip title={err}>
              <TltBadge className="electrical-status-icon-tag" tone="danger" aria-label="Ошибка">
                <CloseCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        return (
          <Tooltip title="Не рассчитан">
            <TltBadge className="electrical-status-icon-tag" aria-label="Не рассчитан">—</TltBadge>
          </Tooltip>
        );
      },
    },
  };
}
