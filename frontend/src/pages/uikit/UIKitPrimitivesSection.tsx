import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  TltAlert,
  TltBadge,
  TltButton,
  TltCard,
  TltEmptyState,
  TltSkeleton,
  TltTable,
  TltTabs,
} from '@/components/ui-kit';
import type { TltTableColumn } from '@/components/ui-kit';
import { CompactSection } from '@/components/ui-kit';
import type { HeatLossRow } from '@/pages/uikit/uiKitModel';

const primitiveTableColumns: TltTableColumn<HeatLossRow>[] = [
  { key: 'id', header: 'Код', width: '74px', render: (row) => <code>{row.id}</code> },
  { key: 'name', header: 'Объект', render: (row) => <strong>{row.name}</strong> },
  { key: 'type', header: 'Тип', width: '90px' },
  { key: 'temperature', header: 't, °C', width: '68px', align: 'right' },
  {
    key: 'status',
    header: 'Статус',
    width: '118px',
    render: (row) => (
      <TltBadge tone={row.status === 'Рассчитан' ? 'success' : row.status === 'Ошибка' ? 'danger' : 'warning'}>
        {row.status}
      </TltBadge>
    ),
  },
];

export interface UIKitPrimitivesSectionProps {
  filteredRows: HeatLossRow[];
  selectedRow: string;
  onSelectedRowChange: (id: string) => void;
}

export function UIKitPrimitivesSection({
  filteredRows,
  selectedRow,
  onSelectedRowChange,
}: UIKitPrimitivesSectionProps) {
  return (
    <CompactSection id="primitives" index="07" title="Компоненты" description="CSS-first примитивы для новых экранов: без API, стора и зависимости от бизнес-модели.">
      <div className="uikit-primitive-grid">
        <TltCard
          title="Действия"
          description="Размеры и варианты кнопок остаются едиными на любом экране."
          actions={<TltBadge tone="info">CSS-first</TltBadge>}
        >
          <div className="uikit-primitive-actions">
            <TltButton variant="primary" icon={<PlusOutlined />}>Добавить</TltButton>
            <TltButton icon={<ReloadOutlined />}>Пересчитать</TltButton>
            <TltButton variant="ghost" icon={<SettingOutlined />}>Настроить</TltButton>
            <TltButton variant="danger" size="icon" icon={<DeleteOutlined />} aria-label="Удалить" />
            <TltButton loading aria-label="Сохранение" />
            <TltButton disabled>Недоступно</TltButton>
          </div>
        </TltCard>

        <TltCard title="Состояния" description="Цвет помогает быстро найти состояние, но всегда сопровождается текстом.">
          <div className="uikit-primitive-badges">
            <TltBadge>Черновик</TltBadge>
            <TltBadge tone="info">В расчёте</TltBadge>
            <TltBadge tone="success">Рассчитан</TltBadge>
            <TltBadge tone="warning">Требует данных</TltBadge>
            <TltBadge tone="danger">Ошибка</TltBadge>
          </div>
          <div className="uikit-primitive-alerts">
            <TltAlert tone="success" title="Расчёт обновлён">Все 24 объекта пересчитаны без ошибок.</TltAlert>
            <TltAlert
              tone="warning"
              title="Не хватает исходных данных"
              action={<TltButton variant="ghost">Показать</TltButton>}
            >
              Заполните температуру для 2 объектов.
            </TltAlert>
          </div>
        </TltCard>
      </div>

      <div className="uikit-primitive-stack">
        <TltCard title="Вкладки" description="Клавиши ← →, Home и End переключают вкладки и сохраняют видимый фокус.">
          <TltTabs
            tabListLabel="Примеры компонентов"
            defaultValue="calculation"
            items={[
              {
                id: 'calculation',
                label: 'Расчёт',
                content: <div className="uikit-primitive-tab-content"><TltBadge tone="success">Готово</TltBadge><strong>24 объекта готовы к запуску</strong><span>Данные проверены, можно переходить к следующему шагу.</span></div>,
              },
              {
                id: 'empty',
                label: 'Пустое состояние',
                content: <TltEmptyState title="Нет выбранных объектов" description="Выберите строку в таблице, чтобы открыть параметры." />,
              },
              {
                id: 'loading',
                label: 'Загрузка',
                content: <TltSkeleton rows={3} variant="panel" label="Загрузка компонентов" />,
              },
              { id: 'disabled', label: 'Недоступно', disabled: true, content: null },
            ]}
          />
        </TltCard>

        <div className="uikit-primitive-data-grid">
          <TltCard title="Таблица" description="Состояние строки доступно мышью и клавиатурой.">
            <TltTable
              aria-label="Пример таблицы UI Kit"
              caption="Теплопотери по объектам"
              columns={primitiveTableColumns}
              rows={filteredRows}
              rowKey="id"
              selectedRowKey={selectedRow}
              onRowSelect={(row) => onSelectedRowChange(row.id)}
              emptyState={<TltEmptyState title="Ничего не найдено" description="Измените запрос в поле поиска выше." />}
            />
          </TltCard>
          <TltCard title="Пустое и загрузка" description="Оба состояния готовы для экранов с асинхронными данными.">
            <div className="uikit-primitive-state-stack">
              <TltEmptyState
                title="Добавьте первый объект"
                description="Создайте трубопровод или резервуар, чтобы начать расчёт."
                action={<TltButton variant="primary" icon={<PlusOutlined />}>Добавить</TltButton>}
              />
              <TltSkeleton rows={2} label="Загрузка списка объектов" />
            </div>
          </TltCard>
        </div>
      </div>
    </CompactSection>
  );
}
