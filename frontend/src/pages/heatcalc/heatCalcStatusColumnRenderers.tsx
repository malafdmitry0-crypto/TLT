/**
 * Status / identity column renderers for heatCalc table (P-BAND-10).
 */
import { Tooltip } from 'antd';
import { TltBadge } from '@/components/ui-kit';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  MinusCircleFilled,
} from '@ant-design/icons';

import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type { ProjectObject } from '@/types/project';
import type { HeatCalcColumnKey } from '@/utils/heatCalcTableColumns';
import {
  heatLossCalcStatus,
  heatLossErrorText,
  heatLossStatusLabel,
} from '@/utils/heatCalcPageUtils';

export function buildHeatCalcStatusColumnRenderers(): Partial<
  Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>
> {
  return {
    index: {
      render: (_: unknown, __: ProjectObject, idx: number) => idx + 1,
      copyValue: (_record, idx) => String(idx + 1),
    },
    heat_loss_status: {
      align: 'center',
      render: (_: unknown, r: ProjectObject) => {
        const status = heatLossCalcStatus(r);
        if (status === 'calculated') {
          return (
            <Tooltip title="Рассчитан">
              <TltBadge className="heatloss-status-icon-tag" aria-label="Рассчитан" tone="success">
                <CheckCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        }
        if (status === 'error') {
          return (
            <Tooltip title={heatLossErrorText(r)}>
              <TltBadge className="heatloss-status-icon-tag" aria-label="Ошибка" tone="danger">
                <CloseCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        }
        if (status === 'unsupported') {
          return (
            <Tooltip title={heatLossErrorText(r)}>
              <TltBadge
                className="heatloss-status-icon-tag"
                aria-label="Не применимо"
                tone="neutral"
              >
                <MinusCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        }
        return (
          <Tooltip title="Не рассчитан">
            <TltBadge className="heatloss-status-icon-tag" aria-label="Не рассчитан" tone="neutral">—</TltBadge>
          </Tooltip>
        );
      },
      copyValue: (r) => heatLossStatusLabel(heatLossCalcStatus(r)),
    },
    type: {
      render: (_: unknown, r: ProjectObject) => (r.object_type === 'pipe' ? 'Тр.' : 'Рез.'),
      copyValue: (r) => (r.object_type === 'pipe' ? 'Труба' : 'Резервуар'),
    },
    name: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject, idx: number) =>
        String(r.params?.name ?? `${OBJECT_TYPE_LABELS[r.object_type]} #${idx + 1}`),
      copyValue: (r, idx) => String(r.params?.name ?? `${OBJECT_TYPE_LABELS[r.object_type]} #${idx + 1}`),
    },
  };
}
