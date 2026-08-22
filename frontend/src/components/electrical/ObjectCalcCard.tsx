import { Descriptions, Popconfirm, Space, Tooltip, Typography } from 'antd';
import { appMessage as message } from '@/feedback/appFeedback';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  DeleteOutlined,
  MinusCircleFilled,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteObject } from '@/api/projects';
import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import {
  isElectricalCalcSuccess,
  electricalCalcError,
  electricalCalcHint,
  isElectricalCalcStale,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import CableSelector from './CableSelector';
import type { CableInfo, CableSource } from '@/api/calculations';
import type { ProjectObject } from '@/types/project';
import type { ElectricalCalcSummary } from '@/types/calculation';
import { TltAlert, TltBadge, TltButton, TltCard } from '@/components/ui-kit';
import './object-calc-card.css';

const { Text } = Typography;

interface ObjectCalcCardProps {
  obj: ProjectObject;
  index: number;
  calc: ElectricalCalcSummary | undefined;
  cables: CableInfo[];
  cableSource?: CableSource;
  projectId: string;
}

/**
 * Карточка одного объекта на странице электрорасчёта.
 * Показывает статус (ок / не рассчитан / ошибка), параметры подобранного
 * кабеля, объяснение для ошибочных случаев, и дропдаун ручного выбора кабеля.
 */
export default function ObjectCalcCard({
  obj,
  index,
  calc,
  cables,
  cableSource,
  projectId,
}: ObjectCalcCardProps) {
  const qc = useQueryClient();
  const typeLabel = OBJECT_TYPE_LABELS[obj.object_type] ?? obj.object_type;
  const r = calc?.results;
  const errorMsg = electricalCalcError(calc);
  const hasSuccess = isElectricalCalcSuccess(calc);
  const isUnsupported = isElectricalCalcUnsupported(calc);
  const isStale = isElectricalCalcStale(calc);
  const unsupportedText = electricalCalcHint(calc) ?? errorMsg ?? 'Не применимо';
  const objectName = String(obj.params?.name ?? `${typeLabel} #${index + 1}`);
  const canManualPick = obj.is_valid;

  const delMut = useMutation({
    mutationFn: () => deleteObject(projectId, obj.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'electrical-calcs'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
      message.success('Объект и связанный электрорасчёт удалены');
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <TltCard
      padding="compact"
      className="object-calc-card"
      title={
        <Space>
          <TltBadge tone="info">{typeLabel}</TltBadge>
          <Text strong>{objectName}</Text>
          {hasSuccess ? (
            <CheckCircleFilled className="object-calc-card__ok-icon" />
          ) : isUnsupported ? (
            <TltBadge tone="neutral">
              <MinusCircleFilled /> не применимо
            </TltBadge>
          ) : isStale ? (
            <TltBadge tone="warning">требуется пересчёт</TltBadge>
          ) : errorMsg ? (
            <TltBadge tone="danger">
              <CloseCircleFilled /> ошибка
            </TltBadge>
          ) : (
            <TltBadge tone="neutral">не рассчитан</TltBadge>
          )}
        </Space>
      }
      actions={
        <Popconfirm
          title="Удалить объект?"
          description="Будут удалены сам объект (из шага «Теплопотери») и связанный электрорасчёт."
          okText="Удалить"
          cancelText="Отмена"
          okButtonProps={{ danger: true, loading: delMut.isPending }}
          onConfirm={() => delMut.mutate()}
        >
          <Tooltip title="Удалить объект вместе с электрорасчётом">
            <TltButton size="compact" variant="danger" icon={<DeleteOutlined />} aria-label="Удалить объект" />
          </Tooltip>
        </Popconfirm>
      }
    >
      {isUnsupported ? (
        <TltAlert
          tone="info"
          title="Электрорасчёт не применим"
        >
          <div className="object-calc-card__block">
            <Text code>{unsupportedText}</Text>
          </div>
          <Text type="secondary" className="object-calc-card__hint">
            Объект остаётся валидным по теплопотерям, но выбранная
            геометрия не имеет утверждённой формулы укладки кабеля.
          </Text>
        </TltAlert>
      ) : isStale ? (
        <TltAlert
          tone="warning"
          title="Электрорасчёт требует пересчёта"
        >
          {electricalCalcHint(calc) ?? errorMsg ?? 'Изменились теплопотери объекта.'}
        </TltAlert>
      ) : errorMsg ? (
        <TltAlert
          tone="danger"
          title="Электрорасчёт не выполнен"
        >
          <div className="object-calc-card__block">
            <Text code>{errorMsg}</Text>
          </div>
          <Text
            type="secondary"
            className="object-calc-card__hint--block"
          >
            Объект <strong>валидный по теплопотерям</strong> (этап 1 прошёл),
            но не укладывается в выбранный тип кабеля на этапе электрорасчёта.
            В текущей поставке есть расчётные формулы для ТЛТ, ТТН/ТТВ/ТТХ,
            ТТ Р1 и ТТ Р3. Новые типы систем подключаются вместе со своей
            формулой и каталогом.
          </Text>
          <Text type="secondary" className="object-calc-card__hint">
            Можно также попробовать изменить параметры объекта (снизить
            T_продукта, увеличить толщину изоляции, разбить объект на части)
            на шаге «Теплопотери» — после чего нажать «Пересчитать» или
            выбрать кабель вручную ниже.
          </Text>
        </TltAlert>
      ) : hasSuccess && r ? (
        <Descriptions column={3} size="small" bordered>
          <Descriptions.Item label="Марка кабеля" span={2}>
            <Text strong className="object-calc-card__cable-mark">
              {String(r.selected_cable ?? '—')}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Напряжение">
            {String(r.voltage ?? 220)} В
          </Descriptions.Item>
          <Descriptions.Item label="Расчётная длина кабеля">
            {Number(r.installed_cable_length ?? 0).toFixed(1)} м
          </Descriptions.Item>
          <Descriptions.Item label="Заказная длина кабеля">
            {Number(r.order_cable_length ?? 0).toFixed(1)} м
          </Descriptions.Item>
          <Descriptions.Item label="Суммарная мощность">
            {Number(r.total_power ?? 0).toFixed(0)} Вт
          </Descriptions.Item>
          <Descriptions.Item label="Ток">
            {Number(r.current ?? 0).toFixed(2)} А
          </Descriptions.Item>
          <Descriptions.Item label="Уд. мощность при раб. T°" span={2}>
            {Number(
              r.power_at_operating_temp ?? r.required_power_per_meter ?? 0,
            ).toFixed(1)}{' '}
            Вт/м
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <Text type="secondary">
          {obj.is_valid
            ? 'Отметьте объект и нажмите «Пересчитать выбранные», чтобы подобрать кабель'
            : 'Объект не рассчитан — проверьте параметры на шаге «Теплопотери»'}
        </Text>
      )}

      {canManualPick && cables.length > 0 && (
        <CableSelector
          objectId={obj.id}
          currentMark={calc?.cable_mark ?? null}
          cables={cables}
          cableSource={cableSource}
        />
      )}
    </TltCard>
  );
}
