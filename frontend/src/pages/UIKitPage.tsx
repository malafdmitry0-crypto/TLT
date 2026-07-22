import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  Form,
  Input,
  Progress,
  Segmented,
  Slider,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CheckCircleFilled,
  CheckOutlined,
  CloseCircleFilled,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FilterOutlined,
  FireFilled,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
  TableOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CompactField,
  CompactFieldGrid,
  TltAlert,
  TltBadge,
  TltButton,
  TltCard,
  TltEmptyState,
  TltNumberField,
  TltSelect,
  TltSkeleton,
  TltTable,
  TltTabs,
  TltTextField,
} from '@/components/ui-kit';
import type { TltTableColumn } from '@/components/ui-kit';
import {
  CompactMetric,
  CompactSection,
  StatusChip,
} from '@/components/ui-kit/CompactUi';
import CableAlgorithmPanel from '@/components/wizard/CableAlgorithmPanel';
import ReferencePicker from '@/components/wizard/ReferencePicker';
import { PipeTypeIcon, TankTypeIcon } from '@/pages/heatcalc/HeatCalcObjectTypeIcons';
import '@/components/wizard/insulation-layers-table.css';
import './ui-kit.css';

type Density = 'compact' | 'comfortable';
type HeatScope = 'pipe' | 'tank' | 'all';

interface HeatLossRow {
  id: string;
  name: string;
  type: string;
  objectType: Exclude<HeatScope, 'all'>;
  temperature: string;
  heatLoss: string;
  insulation: string;
  status: string;
}

/* Реальная палитра приложения: --color-primary / --color-primary-light,
   --tlt-field-label-color и семантические цвета тулбаров HeatCalc. */
const colorTokens = [
  { name: 'Primary 700', value: '#1a5276', className: 'primary' },
  { name: 'Primary 500 · Link', value: '#2e86c1', className: 'link' },
  { name: 'Label 600', value: '#53667b', className: 'label' },
  { name: 'Success 700', value: '#1f6f3e', className: 'green' },
  { name: 'Warning 700', value: '#d46b08', className: 'amber' },
  { name: 'Danger 600', value: '#d9363e', className: 'red' },
];

/* Статусы = реальные статусы теплового расчёта (heatLossCalcStatus) */
const rows: HeatLossRow[] = [
  { id: 'Т-101', name: 'Подающий трубопровод', type: 'Труба', objectType: 'pipe', temperature: '+95', heatLoss: '184,6', insulation: 'Минвата · 60 мм', status: 'Рассчитан' },
  { id: 'Е-204', name: 'Резервуар технической воды', type: 'Резервуар', objectType: 'tank', temperature: '+40', heatLoss: '—', insulation: 'ППУ · 80 мм', status: 'Не рассчитан' },
  { id: 'Т-118', name: 'Дренажная линия', type: 'Труба', objectType: 'pipe', temperature: '+12', heatLoss: '—', insulation: 'Минвата · 40 мм', status: 'Ошибка' },
];

const primitiveTableColumns: TltTableColumn<HeatLossRow>[] = [
  { key: 'id', header: 'Код', width: '74px', render: (row) => <code>{row.id}</code> },
  { key: 'name', header: 'Объект', render: (row) => <strong>{row.name}</strong> },
  { key: 'type', header: 'Тип', width: '90px' },
  { key: 'temperature', header: 't, °C', width: '68px', align: 'right' },
  {
    key: 'status',
    header: 'Статус',
    width: '118px',
    render: (row) => <TltBadge tone={row.status === 'Рассчитан' ? 'success' : row.status === 'Ошибка' ? 'danger' : 'warning'}>{row.status}</TltBadge>,
  },
];

/* Иконка-статус как в реальной таблице HeatCalc (heatloss-status-icon-tag) */
function HeatLossStatusTag({ status }: { status: string }) {
  if (status === 'Рассчитан') {
    return (
      <Tooltip title="Рассчитан">
        <Tag className="heatloss-status-icon-tag" color="success" aria-label="Рассчитан"><CheckCircleFilled /></Tag>
      </Tooltip>
    );
  }
  if (status === 'Ошибка') {
    return (
      <Tooltip title="Ошибка расчёта">
        <Tag className="heatloss-status-icon-tag" color="error" aria-label="Ошибка"><CloseCircleFilled /></Tag>
      </Tooltip>
    );
  }
  return (
    <Tooltip title="Не рассчитан">
      <Tag className="heatloss-status-icon-tag" aria-label="Не рассчитан">—</Tag>
    </Tooltip>
  );
}

const pipeMaterialOptions = [
  { label: 'Углеродистая сталь', value: 'steel' },
  { label: 'Нержавеющая сталь', value: 'stainless' },
  { label: 'Полиэтилен', value: 'plastic' },
];

const climateCityOptions = [
  { label: 'Москва', value: 'moscow', description: 'Расчётная температура −25 °C' },
  { label: 'Санкт-Петербург', value: 'spb', description: 'Расчётная температура −24 °C' },
  { label: 'Норильск', value: 'norilsk', description: 'Расчётная температура −46 °C' },
];

const insulationMaterialOptions = [
  { label: 'Минеральная вата', value: 'mineral-wool', description: 'λ = 0,040 Вт/(м·К)' },
  { label: 'Пенополиуретан (ППУ)', value: 'pur', description: 'λ = 0,027 Вт/(м·К)' },
  { label: 'Вспененный каучук', value: 'rubber', description: 'λ = 0,036 Вт/(м·К)' },
];

const navigation = [
  ['foundation', 'Основа'],
  ['actions', 'Действия'],
  ['forms', 'Поля'],
  ['states', 'Состояния'],
  ['data', 'Данные'],
  ['heatcalc', 'Теплопотери'],
  ['primitives', 'Компоненты'],
  ['patterns', 'Паттерны'],
] as const;

function Swatch({ name, value, className }: typeof colorTokens[number]) {
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

export default function UIKitPage() {
  const navigate = useNavigate();
  const [density, setDensity] = useState<Density>('compact');
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState('Т-101');
  const [heatScope, setHeatScope] = useState<HeatScope>('pipe');
  const [showHeatForm, setShowHeatForm] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [material, setMaterial] = useState<string | number | undefined>('steel');
  const [heatMaterial, setHeatMaterial] = useState<string | number | undefined>('steel');
  const [climateCity, setClimateCity] = useState<string | number | undefined>();
  const [heatClimateCity, setHeatClimateCity] = useState<string | number | undefined>();
  const [insulationMaterial, setInsulationMaterial] = useState<string | number | undefined>();
  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('ru');
    if (!normalized) return rows;
    return rows.filter((row) => `${row.id} ${row.name} ${row.type}`.toLocaleLowerCase('ru').includes(normalized));
  }, [search]);
  const heatLossRows = heatScope === 'all'
    ? rows
    : rows.filter((row) => row.objectType === heatScope);
  const heatLossColumns: TableColumnsType<HeatLossRow> = [
    { title: 'Поз.', dataIndex: 'id', key: 'id', width: 70, render: (value: string) => <code>{value}</code> },
    { title: 'Наименование', dataIndex: 'name', key: 'name', width: 220 },
    { title: 'Тип', dataIndex: 'type', key: 'type', width: 90 },
    { title: 'Изоляция', dataIndex: 'insulation', key: 'insulation', width: 140 },
    { title: 't, °C', dataIndex: 'temperature', key: 'temperature', width: 70, align: 'right' },
    { title: 'Q, Вт/м', dataIndex: 'heatLoss', key: 'heatLoss', width: 85, align: 'right' },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 70,
      align: 'center',
      render: (status: string) => <HeatLossStatusTag status={status} />,
    },
  ];

  return (
    <ConfigProvider componentSize={density === 'compact' ? 'small' : 'middle'}>
      <div className={`uikit-page uikit-page--${density}`}>
        <header className="uikit-header">
          <div className="uikit-header__brand">
            <span className="uikit-header__mark"><FireFilled /></span>
            <div>
              <span className="uikit-eyebrow">TLT / SYSTEM 01</span>
              <h1>Инженерный UI Kit</h1>
            </div>
          </div>
          <div className="uikit-header__tools">
            <span className="uikit-header__hint">Плотность</span>
            <Segmented<Density>
              aria-label="Плотность интерфейса"
              options={[
                { label: 'Компактно', value: 'compact' },
                { label: 'Свободно', value: 'comfortable' },
              ]}
              value={density}
              onChange={setDensity}
            />
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>В приложение</Button>
          </div>
        </header>

        <div className="uikit-shell">
          <aside className="uikit-nav" aria-label="Разделы UI Kit">
            <span className="uikit-nav__label">Навигация</span>
            {navigation.map(([id, label], index) => (
              <a href={`#${id}`} key={id}><span>{String(index + 1).padStart(2, '0')}</span>{label}</a>
            ))}
            <div className="uikit-nav__note">
              <StatusChip tone="success">v1.0</StatusChip>
              <p>HeatCalc SC-03<br />26 px · 8.5 / 12 / 9<br />num 4rem · name 7.5rem</p>
            </div>
          </aside>

          <main className="uikit-main">
            <div className="uikit-intro">
              <div>
                <span className="uikit-kicker">Функция прежде формы</span>
                <p>Компоненты для расчётных экранов, где важны скорость чтения, точность ввода и максимум данных без визуального шума.</p>
              </div>
              <div className="uikit-intro__spec">
                <span>Базовый модуль</span><strong>4 px</strong>
                <span>Высота контроля</span><strong>26 px</strong>
                <span>Радиус</span><strong>2 px</strong>
                <span>Label track</span><strong>98 px</strong>
              </div>
            </div>

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

            <CompactSection id="actions" index="02" title="Действия" description="Один главный акцент, короткие глаголы, иконка только когда ускоряет распознавание.">
              <div className="uikit-component-row">
                <div className="uikit-demo-group">
                  <span className="uikit-card-label">Кнопки</span>
                  <Space size={6} wrap>
                    <Button type="primary" icon={<PlusOutlined />}>Добавить</Button>
                    <Button icon={<ReloadOutlined />}>Пересчитать</Button>
                    <Button type="text" icon={<SettingOutlined />}>Настроить</Button>
                    <Tooltip title="Удалить выбранный объект"><Button danger aria-label="Удалить" icon={<DeleteOutlined />} /></Tooltip>
                    <Button disabled>Недоступно</Button>
                  </Space>
                </div>
                <div className="uikit-demo-group">
                  <span className="uikit-card-label">Панель таблицы</span>
                  <Space.Compact className="uikit-toolbar">
                    <Input aria-label="Поиск объекта" prefix={<SearchOutlined />} placeholder="Поиск" value={search} onChange={(event) => setSearch(event.target.value)} />
                    <Button icon={<FilterOutlined />}>Фильтр</Button>
                    <Button aria-label="Дополнительные действия" icon={<MoreOutlined />} />
                  </Space.Compact>
                </div>
              </div>
            </CompactSection>

            <CompactSection id="forms" index="03" title="Поля ввода" description="Контракт HeatCalc SC-03: label 98px · control 26px · шрифт 8.5/12/9 · ширины num/name/climate.">
              <CompactFieldGrid className="uikit-form-grid" columns={3} flow="columns" maxRowsPerColumn={5}>
                <CompactField label="Наименование" required controlWidth="var(--tlt-field-ctrl-name)">
                  <TltTextField id="uikit-object-name" defaultValue="Трубопровод Т-101" required aria-label="Наименование" />
                </CompactField>
                <CompactField label="Наружный диаметр" required controlWidth="var(--tlt-field-ctrl-num)">
                  <TltNumberField id="uikit-diameter" unit="мм" required aria-label="Наружный диаметр" />
                </CompactField>
                <CompactField label="Длина трубопровода" required controlWidth="var(--tlt-field-ctrl-num)">
                  <TltNumberField id="uikit-length" unit="м" required aria-label="Длина трубопровода" />
                </CompactField>
                <CompactField label="Толщина стенки" required controlWidth="var(--tlt-field-ctrl-num)">
                  <TltNumberField id="uikit-wall" unit="мм" required aria-label="Толщина стенки" />
                </CompactField>
                <CompactField label="Материал трубы" required controlWidth="var(--tlt-field-ctrl-name)">
                  <ReferencePicker
                    aria-label="Материал"
                    required
                    value={material}
                    onChange={setMaterial}
                    modalTitle="Материал трубы"
                    searchPlaceholder="Поиск материала"
                    options={pipeMaterialOptions}
                  />
                </CompactField>
                <CompactField label={<span className="field-label-two-line"><span>Количество</span><span>локальных элементов</span></span>} controlWidth="var(--tlt-field-ctrl-num)">
                  <TltNumberField id="uikit-local-elements" unit="шт" aria-label="Количество локальных элементов" />
                </CompactField>
                <CompactField label="Размещение" required controlWidth="var(--tlt-field-ctrl-climate)">
                  <TltSelect
                    id="uikit-placement"
                    aria-label="Размещение"
                    required
                    defaultValue="open-air"
                    options={[
                      { label: 'На открытом воздухе', value: 'open-air' },
                      { label: 'В помещении', value: 'inside' },
                      { label: 'Под землей', value: 'buried' },
                    ]}
                  />
                </CompactField>
                <CompactField label="Климат" controlWidth="var(--tlt-field-ctrl-climate)">
                  <ReferencePicker
                    aria-label="Климат"
                    value={climateCity}
                    onChange={setClimateCity}
                    placeholder="Выберите город"
                    modalTitle="Климатический справочник"
                    searchPlaceholder="Поиск города"
                    options={climateCityOptions}
                  />
                </CompactField>
                <CompactField label={<span className="field-label-two-line"><span>Температура</span><span>окружающей среды</span></span>} required controlWidth="var(--tlt-field-ctrl-num)">
                  <TltNumberField id="uikit-ambient" unit="°C" required aria-label="Температура окружающей среды" />
                </CompactField>
                <CompactField label={<span className="field-label-two-line"><span>Требуемая</span><span>температура объекта</span></span>} required controlWidth="var(--tlt-field-ctrl-num)">
                  <TltNumberField id="uikit-process" unit="°C" required aria-label="Требуемая температура объекта" />
                </CompactField>
                <CompactField label="Скорость ветра" controlWidth="var(--tlt-field-ctrl-num)">
                  <TltNumberField id="uikit-wind" unit="м/с" aria-label="Скорость ветра" />
                </CompactField>
                <CompactField label={<span className="field-label-two-line"><span>Режим температуры</span><span>изоляции (tm)</span></span>} required controlWidth="var(--tlt-field-ctrl-tm)">
                  <TltSelect
                    id="uikit-temperature-mode"
                    aria-label="Режим температуры изоляции"
                    required
                    defaultValue="open-air-winter"
                    options={[
                      { label: 'Открытый воздух, зима', value: 'open-air-winter' },
                      { label: 'Открытый воздух, лето', value: 'open-air-summer' },
                    ]}
                  />
                </CompactField>
              </CompactFieldGrid>
              <div className="uikit-options-row">
                <Checkbox defaultChecked>Учитывать арматуру</Checkbox>
                <Switch aria-label="Уведомления" size="small" checked={notificationsEnabled} onChange={setNotificationsEnabled} />
                <span>{notificationsEnabled ? 'Уведомления включены' : 'Уведомления выключены'}</span>
                <Slider ariaLabelForHandle="Коэффициент запаса" min={0} max={30} defaultValue={10} tooltip={{ formatter: (value) => `${value}%` }} />
              </div>
            </CompactSection>

            <CompactSection id="states" index="04" title="Состояния" description="Статус читается по цвету, маркеру и тексту — не только по одному признаку.">
              <div className="uikit-status-row">
                <StatusChip>Черновик</StatusChip>
                <StatusChip tone="info">В расчёте</StatusChip>
                <StatusChip tone="success">Рассчитан</StatusChip>
                <StatusChip tone="warning">Требует данных</StatusChip>
                <StatusChip tone="danger">Ошибка</StatusChip>
              </div>
              <div className="uikit-alerts">
                <Alert showIcon type="success" message="Расчёт обновлён" description="Все 24 объекта пересчитаны без ошибок." />
                <Alert showIcon type="warning" message="Не хватает исходных данных" description="Заполните температуру для 2 объектов." action={<Button>Показать</Button>} />
                <Alert showIcon type="error" message="Расчёт не выполнен" description="Проверьте подключение к справочнику коэффициентов." action={<Button icon={<ReloadOutlined />}>Повторить</Button>} />
              </div>
            </CompactSection>

            <CompactSection id="data" index="05" title="Данные" description="Числа выровнены, строка выбирается целиком, горизонтальный скролл остаётся внутри таблицы.">
              <div className="uikit-metrics">
                <CompactMetric label="Объектов" value="24" />
                <CompactMetric label="Без ошибок" value="21" accent />
                <CompactMetric label="Теплопотери" value="184,6" unit="кВт" />
                <CompactMetric label="Длина кабеля" value="1 248" unit="м" />
              </div>
              <div className="uikit-table-wrap">
                <table className="uikit-table" role="grid">
                  <thead><tr><th>Код</th><th>Объект</th><th>Тип</th><th className="number">t, °C</th><th>Статус</th><th aria-label="Действия" /></tr></thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={row.id}
                        aria-selected={selectedRow === row.id}
                        className={selectedRow === row.id ? 'is-selected' : undefined}
                        tabIndex={0}
                        onClick={() => setSelectedRow(row.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedRow(row.id);
                          }
                        }}
                      >
                        <td><code>{row.id}</code></td><td><strong>{row.name}</strong></td><td>{row.type}</td><td className="number">{row.temperature}</td>
                        <td><StatusChip tone={row.status === 'Рассчитан' ? 'success' : row.status === 'Ошибка' ? 'danger' : 'warning'}>{row.status}</StatusChip></td>
                        <td><Button type="text" aria-label={`Открыть ${row.id}`} icon={<MoreOutlined />} onClick={(event) => event.stopPropagation()} /></td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 ? <tr><td className="uikit-table__empty" colSpan={6}>Ничего не найдено. Измените запрос.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </CompactSection>

            <CompactSection id="heatcalc" index="06" title="Расчёт теплопотерь" description="Эталон использует те же классы, размеры и состояния, что рабочий экран HeatCalc.">
              <div className="uikit-heatcalc-contract" aria-label="Контракт интерфейса расчёта теплопотерь">
                <div><span>Шрифт</span><strong>System UI</strong></div>
                <div><span>Контролы</span><strong>26 px</strong></div>
                <div><span>Таблица</span><strong>10 px</strong></div>
                <div><span>Сетка</span><strong>#d9d9d9</strong></div>
                <div><span>Заголовок</span><strong>#f3f6f4</strong></div>
              </div>

              <div className="uikit-heatcalc-reference">
                <div className="uikit-heatcalc-reference__caption">
                  <div>
                    <span className="uikit-card-label">Рабочий эталон</span>
                    <strong>Объекты и тепловые потери</strong>
                  </div>
                  <StatusChip tone="success">Стили синхронизированы</StatusChip>
                </div>

                <div className="actionbar-srs actionbar-type-row" role="toolbar" aria-label="Тип объекта в эталоне HeatCalc">
                  <div className="actionbar-group actionbar-type-group" aria-label="Тип объекта">
                    <Button className="action-type-button" type={heatScope === 'pipe' ? 'primary' : 'default'} icon={<PipeTypeIcon />} aria-pressed={heatScope === 'pipe'} onClick={() => setHeatScope('pipe')}>Трубопровод: <strong className="action-type-count">2</strong></Button>
                    <Button className="action-type-button" type={heatScope === 'tank' ? 'primary' : 'default'} icon={<TankTypeIcon />} aria-pressed={heatScope === 'tank'} onClick={() => setHeatScope('tank')}>Резервуар: <strong className="action-type-count">1</strong></Button>
                    <Button className="action-type-button" type={heatScope === 'all' ? 'primary' : 'default'} icon={<AppstoreOutlined />} aria-pressed={heatScope === 'all'} onClick={() => setHeatScope('all')}>Все: <strong className="action-type-count">3</strong></Button>
                    <Tooltip title="Пол — будущее расширение PDF; расчёт не входит в MVP">
                      <Button className="action-type-button" disabled aria-label="Пол (недоступно)" aria-disabled>Пол</Button>
                    </Tooltip>
                  </div>
                  <div className="actionbar-group actionbar-form-state-group">
                    {showHeatForm ? (
                      <Tag className={`actionbar-mode-tag ${selectedRow ? 'edit' : 'new'}`}>
                        {selectedRow ? 'Режим: изменение' : 'Режим: добавление'}
                      </Tag>
                    ) : null}
                    <Checkbox className="actionbar-form-toggle" checked={showHeatForm} onChange={(event) => setShowHeatForm(event.target.checked)}>Показать блок заполнения параметров</Checkbox>
                    <Tooltip title="Перейти к электротехническому расчёту">
                      <span className="action-tooltip-wrap">
                        <Button type="primary" disabled aria-label="Далее. Электротехнический расчёт">Далее → Электротехнический расчёт</Button>
                      </span>
                    </Tooltip>
                  </div>
                </div>

                {showHeatForm ? (
                  <div className="inline-form-srs">
                    {/* Реальная оболочка dual-form: слева теплопотери, справа
                        настоящая CableAlgorithmPanel (остров wizard) */}
                    <Form
                      layout="vertical"
                      requiredMark={false}
                      className="inline-object-form inline-object-form--wide uikit-heatcalc-form"
                      data-layout="wide"
                      initialValues={{
                        environment: 'normal',
                        temperature_group: 'T1',
                        supply_voltage: 220,
                        winding_coefficient: 1,
                      }}
                    >
                      <div className="heatcalc-dual-forms heatcalc-dual-forms--wide">
                        <div className="heatcalc-dual-forms__heat">
                          <h4 className="inline-form-section-banner"><span>Расчёт теплопотерь</span></h4>
                          <CompactFieldGrid className="uikit-heatcalc-form__grid" columns={3} flow="columns" maxRowsPerColumn={5}>
                      <CompactField label="Наименование" controlWidth="var(--tlt-field-ctrl-name)">
                        <TltTextField id="uikit-heat-name" aria-label="Наименование эталона" />
                      </CompactField>
                      <CompactField label="Наружный диаметр" required controlWidth="var(--tlt-field-ctrl-num)">
                        <TltNumberField id="uikit-heat-diameter" unit="мм" required aria-label="Наружный диаметр эталона" />
                      </CompactField>
                      <CompactField label="Длина трубопровода" required controlWidth="var(--tlt-field-ctrl-num)">
                        <TltNumberField id="uikit-heat-length" unit="м" required aria-label="Длина трубопровода эталона" />
                      </CompactField>
                      <CompactField label="Толщина стенки" required controlWidth="var(--tlt-field-ctrl-num)">
                        <TltNumberField id="uikit-heat-wall" unit="мм" required aria-label="Толщина стенки эталона" />
                      </CompactField>
                      <CompactField label="Материал трубы" required controlWidth="var(--tlt-field-ctrl-name)">
                        <ReferencePicker
                          aria-label="Материал трубы эталона"
                          required
                          value={heatMaterial}
                          onChange={setHeatMaterial}
                          modalTitle="Материал трубы"
                          searchPlaceholder="Поиск материала"
                          options={pipeMaterialOptions}
                        />
                      </CompactField>
                      <CompactField label={<span className="field-label-two-line"><span>Количество</span><span>локальных элементов</span></span>} controlWidth="var(--tlt-field-ctrl-num)">
                        <TltNumberField id="uikit-heat-local-elements" unit="шт" aria-label="Количество локальных элементов эталона" />
                      </CompactField>
                      <CompactField label="Размещение" required controlWidth="var(--tlt-field-ctrl-climate)">
                        <TltSelect
                          id="uikit-heat-placement"
                          aria-label="Размещение эталона"
                          required
                          defaultValue="open-air"
                          options={[
                            { label: 'На открытом воздухе', value: 'open-air' },
                            { label: 'В помещении', value: 'inside' },
                          ]}
                        />
                      </CompactField>
                      <CompactField label="Климат" controlWidth="var(--tlt-field-ctrl-climate)">
                        <ReferencePicker
                          aria-label="Климат эталона"
                          value={heatClimateCity}
                          onChange={setHeatClimateCity}
                          placeholder="Выберите город"
                          modalTitle="Климатический справочник"
                          searchPlaceholder="Поиск города"
                          options={climateCityOptions}
                        />
                      </CompactField>
                      <CompactField label={<span className="field-label-two-line"><span>Температура</span><span>окружающей среды</span></span>} required controlWidth="var(--tlt-field-ctrl-num)">
                        <TltNumberField id="uikit-heat-ambient" unit="°C" required aria-label="Температура окружающей среды эталона" />
                      </CompactField>
                      <CompactField label={<span className="field-label-two-line"><span>Требуемая</span><span>температура объекта</span></span>} required controlWidth="var(--tlt-field-ctrl-num)">
                        <TltNumberField id="uikit-heat-process" unit="°C" required aria-label="Требуемая температура объекта эталона" />
                      </CompactField>
                      <CompactField label="Скорость ветра" controlWidth="var(--tlt-field-ctrl-num)">
                        <TltNumberField id="uikit-heat-wind" unit="м/с" aria-label="Скорость ветра эталона" />
                      </CompactField>
                      <CompactField label={<span className="field-label-two-line"><span>Режим температуры</span><span>изоляции (tm)</span></span>} required controlWidth="var(--tlt-field-ctrl-tm)">
                        <TltSelect
                          id="uikit-heat-temperature-mode"
                          aria-label="Режим температуры изоляции эталона"
                          required
                          defaultValue="open-air-winter"
                          options={[
                            { label: 'Открытый воздух, зима', value: 'open-air-winter' },
                            { label: 'Открытый воздух, лето', value: 'open-air-summer' },
                          ]}
                        />
                      </CompactField>
                    </CompactFieldGrid>
                    <div className="insulation-layers-table uikit-heatcalc-layers" data-layer-count={1} aria-label="Слои изоляции в эталоне HeatCalc">
                      <div className="insulation-layers-header">
                        <span className="insulation-layers-header__index">
                          <span className="insulation-layers-header__index-label">Слой</span>
                          <button type="button" className="insulation-layer-add-btn" aria-label="Добавить слой изоляции" title="Добавить слой">
                            <PlusOutlined />
                          </button>
                        </span>
                        <span className="insulation-layers-header__material">Материал изоляции</span>
                        <span className="insulation-layers-header__thickness">Толщина</span>
                        <span className="insulation-layers-header__lambda">λ слоя</span>
                        <span className="insulation-layers-header__range">Диапазон температур</span>
                      </div>
                      <div className="insulation-layers-grid insulation-layers-grid--1">
                        <div className="insulation-layer-group insulation-layer-group--active" data-layer="1" data-active="true">
                          <div className="insulation-layer-cell insulation-layer-cell--index" data-ins-cell="index">
                            <div className="insulation-layer-index-wrap">
                              <span className="insulation-layer-index" aria-hidden="true">1</span>
                            </div>
                          </div>
                          <div className="insulation-layer-cell insulation-layer-cell--material" data-ins-cell="material">
                            <ReferencePicker
                              aria-label="Материал изоляции"
                              required
                              value={insulationMaterial}
                              onChange={setInsulationMaterial}
                              placeholder="Выберите материал"
                              modalTitle="Материал изоляции"
                              searchPlaceholder="Поиск материала"
                              options={insulationMaterialOptions}
                            />
                          </div>
                          <div className="insulation-layer-cell insulation-layer-cell--thickness" data-ins-cell="thickness">
                            <TltNumberField id="uikit-heat-layer-thickness" unit="мм" required aria-label="Толщина слоя" />
                          </div>
                          <div className="insulation-layer-cell insulation-layer-cell--lambda" data-ins-cell="lambda">
                            <span className="insulation-reference-value">—</span>
                          </div>
                          <div className="insulation-layer-cell insulation-layer-cell--range" data-ins-cell="range">
                            <span className="insulation-reference-value">—</span>
                          </div>
                        </div>
                      </div>
                    </div>
                        </div>
                        <div className="heatcalc-dual-forms__cable">
                          <CableAlgorithmPanel objectType="pipe" />
                        </div>
                      </div>
                    </Form>
                  </div>
                ) : null}

                <div className="actionbar-srs actionbar-actions-row" aria-label="Действия эталона HeatCalc">
                  <div className="actionbar-form-actions-row" role="toolbar" aria-label="Действия блока заполнения">
                    <div className="actionbar-group actionbar-form-actions-group">
                      <Tooltip title="Добавить">
                        <Button type="primary" className="action-icon-button action-add-button add" icon={<PlusOutlined />} aria-label="Добавить объект в эталоне" />
                      </Tooltip>
                      <Tooltip title="Сохранить изменения">
                        <span className="action-tooltip-wrap">
                          <Button className="action-icon-button action-save-button save" icon={<SaveOutlined />} aria-label="Сохранить объект в эталоне" />
                        </span>
                      </Tooltip>
                      <Tooltip title={selectedRow === '' ? 'Выберите строки для удаления' : 'Удалить выбранные'}>
                        <span className="action-tooltip-wrap">
                          <Button danger disabled={selectedRow === ''} className="action-icon-button action-secondary-button" icon={<DeleteOutlined />} aria-label="Удалить объект в эталоне" />
                        </span>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="actionbar-table-actions-row" role="toolbar" aria-label="Действия таблицы объектов">
                    <div className="actionbar-group actionbar-table-actions-group">
                      <Segmented size="small" defaultValue="normal" options={[{ label: 'Обычный режим', value: 'normal' }, { label: 'Excel-режим', value: 'excel' }]} />
                      <Tooltip title="Пересчитать выбранный тип">
                        <span className="action-tooltip-wrap">
                          <Button className="action-icon-button action-secondary-button" icon={<ReloadOutlined />} aria-label="Пересчитать выбранный тип" />
                        </span>
                      </Tooltip>
                      <Tooltip title="Пересчитать все объекты">
                        <span className="action-tooltip-wrap">
                          <Button className="action-secondary-button action-recalc-all-button" icon={<ReloadOutlined />} aria-label="Пересчитать все">Пересчитать все</Button>
                        </span>
                      </Tooltip>
                      <Tooltip title="Настройки отображения">
                        <span className="action-tooltip-wrap">
                          <Button className="action-icon-button action-secondary-button" icon={<TableOutlined />} aria-label="Настройки отображения эталона" />
                        </span>
                      </Tooltip>
                      <Tooltip title="Фильтры не активны">
                        <span className="action-tooltip-wrap">
                          <Button className="action-icon-button action-secondary-button" icon={<CloseCircleOutlined />} aria-label="Сбросить фильтры таблицы" disabled />
                        </span>
                      </Tooltip>
                      <Tooltip title={selectedRow ? 'Добавить копии выбранных объектов: 1' : 'Выберите галочками один или несколько объектов для копирования'}>
                        <span className="action-tooltip-wrap">
                          <Button className="action-icon-button action-secondary-button" icon={<CopyOutlined />} aria-label="Добавить копии выбранных" disabled={selectedRow === ''} />
                        </span>
                      </Tooltip>
                      <Space className="import-actions-compact" size={2} wrap>
                        <Tooltip title="Импорт XLSX/CSV">
                          <Button className="action-icon-button action-secondary-button import-upload-button" icon={<UploadOutlined />} aria-label="Импорт XLSX/CSV" size="small" />
                        </Tooltip>
                        <Tooltip title="Скачать шаблон XLSX">
                          <Button icon={<DownloadOutlined />} aria-label="Скачать шаблон XLSX" size="small" type="link" className="template-download-button">.xlsx</Button>
                        </Tooltip>
                        <Tooltip title="Скачать шаблон CSV">
                          <Button icon={<DownloadOutlined />} aria-label="Скачать шаблон CSV" size="small" type="link" className="template-download-button">.csv</Button>
                        </Tooltip>
                      </Space>
                    </div>
                  </div>
                </div>

                <div className="calc-spreadsheet heatcalc-spreadsheet calc-spreadsheet--compact uikit-heatcalc-table">
                  <Table<HeatLossRow>
                    columns={heatLossColumns}
                    dataSource={heatLossRows}
                    pagination={false}
                    rowKey="id"
                    rowClassName={(row) => selectedRow === row.id ? 'row-selected' : ''}
                    rowSelection={{
                      selectedRowKeys: selectedRow ? [selectedRow] : [],
                      onChange: (keys) => setSelectedRow(String(keys[0] ?? '')),
                    }}
                    scroll={{ x: 795 }}
                    size="small"
                    onRow={(row) => ({ onClick: () => setSelectedRow(row.id) })}
                  />
                </div>
              </div>
            </CompactSection>

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
                      onRowSelect={(row) => setSelectedRow(row.id)}
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

            <CompactSection id="patterns" index="08" title="Рабочие паттерны" description="Готовые композиции для основных расчётных сценариев.">
              <Tabs
                defaultActiveKey="calculation"
                items={[
                  { key: 'calculation', label: 'Расчёт', children: (
                    <div className="uikit-pattern">
                      <div className="uikit-pattern__head"><div><StatusChip tone="info">Шаг 2 из 4</StatusChip><h3>Проверка исходных данных</h3></div><strong>68%</strong></div>
                      <Progress percent={68} showInfo={false} size="small" />
                      <div className="uikit-pattern__actions"><span>17 из 24 объектов готовы</span><Space size={6}><Button>Назад</Button><Button type="primary" icon={<CheckOutlined />}>Продолжить</Button></Space></div>
                    </div>
                  ) },
                  { key: 'empty', label: 'Пустое состояние', children: (
                    <div className="uikit-empty"><span className="uikit-empty__glyph">＋</span><div><h3>Добавьте первый объект</h3><p>Создайте трубопровод или резервуар, чтобы начать расчёт.</p></div><Button type="primary" icon={<PlusOutlined />}>Добавить объект</Button></div>
                  ) },
                  { key: 'loading', label: 'Загрузка', children: (
                    <div className="uikit-loading" aria-label="Загрузка данных"><span /><span /><span /><span /></div>
                  ) },
                ]}
              />
            </CompactSection>

            <footer className="uikit-footer"><span>TLT UI Kit · 2026</span><span>Точность в каждом пикселе</span></footer>
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
}
