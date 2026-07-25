import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  Input,
  Progress,
  Segmented,
  Slider,
  Space,
  Switch,
  Tabs,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  DeleteOutlined,
  FilterOutlined,
  FireFilled,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  CompactField,
  CompactFieldGrid,
  TltNumberField,
  TltSelect,
  TltTextField,
} from '@/components/ui-kit';
import {
  CompactMetric,
  CompactSection,
  StatusChip,
} from '@/components/ui-kit/CompactUi';
import ReferencePicker from '@/components/wizard/ReferencePicker';
import { UIKitFoundationSection } from '@/pages/uikit/UIKitFoundationSection';
import { UIKitHeatReferenceSection } from '@/pages/uikit/UIKitHeatReferenceSection';
import { UIKitPrimitivesSection } from '@/pages/uikit/UIKitPrimitivesSection';
import {
  climateCityOptions,
  navigation,
  pipeMaterialOptions,
  rows,
  type Density,
} from '@/pages/uikit/uiKitModel';
import './ui-kit.css';
import './ui-kit-primitives-showcase.css';
import './ui-kit-heatcalc-reference.css';

export default function UIKitPage() {
  const navigate = useNavigate();
  const [density, setDensity] = useState<Density>('compact');
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState('Т-101');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [material, setMaterial] = useState<string | number | undefined>('steel');
  const [climateCity, setClimateCity] = useState<string | number | undefined>();
  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('ru');
    if (!normalized) return rows;
    return rows.filter((row) => `${row.id} ${row.name} ${row.type}`.toLocaleLowerCase('ru').includes(normalized));
  }, [search]);

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

            <UIKitFoundationSection />

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

            <UIKitHeatReferenceSection
              selectedRow={selectedRow}
              onSelectedRowChange={setSelectedRow}
            />

            <UIKitPrimitivesSection
              filteredRows={filteredRows}
              selectedRow={selectedRow}
              onSelectedRowChange={setSelectedRow}
            />

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
