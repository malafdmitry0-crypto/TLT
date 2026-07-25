import { useState } from 'react';
import {
  Checkbox,
  Form,
  Segmented,
  Space,
  Table,
  Tooltip,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  AppstoreOutlined,
  CloseCircleFilled,
  CloseCircleOutlined,
  CheckCircleFilled,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  TableOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  CompactField,
  CompactFieldGrid,
  TltBadge,
  TltButton,
  TltNumberField,
  TltSelect,
  TltTextField,
} from '@/components/ui-kit';
import { CompactSection, StatusChip } from '@/components/ui-kit/CompactUi';
import CableAlgorithmPanel from '@/components/wizard/CableAlgorithmPanel';
import ReferencePicker from '@/components/wizard/ReferencePicker';
import { PipeTypeIcon, TankTypeIcon } from '@/components/shared/ObjectTypeIcons';
import {
  climateCityOptions,
  insulationMaterialOptions,
  pipeMaterialOptions,
  rows,
  type HeatLossRow,
  type HeatScope,
} from '@/pages/uikit/uiKitModel';
import '@/components/wizard/insulation-layers-table.css';

/* Иконка-статус как в реальной таблице HeatCalc (heatloss-status-icon-tag) */
function HeatLossStatusTag({ status }: { status: string }) {
  if (status === 'Рассчитан') {
    return (
      <Tooltip title="Рассчитан">
        <TltBadge className="heatloss-status-icon-tag" tone="success" aria-label="Рассчитан"><CheckCircleFilled /></TltBadge>
      </Tooltip>
    );
  }
  if (status === 'Ошибка') {
    return (
      <Tooltip title="Ошибка расчёта">
        <TltBadge className="heatloss-status-icon-tag" tone="danger" aria-label="Ошибка"><CloseCircleFilled /></TltBadge>
      </Tooltip>
    );
  }
  return (
    <Tooltip title="Не рассчитан">
      <TltBadge className="heatloss-status-icon-tag" aria-label="Не рассчитан">—</TltBadge>
    </Tooltip>
  );
}

export interface UIKitHeatReferenceSectionProps {
  selectedRow: string;
  onSelectedRowChange: (id: string) => void;
}

export function UIKitHeatReferenceSection({
  selectedRow,
  onSelectedRowChange,
}: UIKitHeatReferenceSectionProps) {
  const [heatScope, setHeatScope] = useState<HeatScope>('pipe');
  const [showHeatForm, setShowHeatForm] = useState(true);
  const [heatMaterial, setHeatMaterial] = useState<string | number | undefined>('steel');
  const [heatClimateCity, setHeatClimateCity] = useState<string | number | undefined>();
  const [insulationMaterial, setInsulationMaterial] = useState<string | number | undefined>();

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
            <TltButton className="action-type-button" variant={heatScope === 'pipe' ? 'primary' : 'secondary'} icon={<PipeTypeIcon />} aria-pressed={heatScope === 'pipe'} onClick={() => setHeatScope('pipe')}>Трубопровод: <strong className="action-type-count">2</strong></TltButton>
            <TltButton className="action-type-button" variant={heatScope === 'tank' ? 'primary' : 'secondary'} icon={<TankTypeIcon />} aria-pressed={heatScope === 'tank'} onClick={() => setHeatScope('tank')}>Резервуар: <strong className="action-type-count">1</strong></TltButton>
            <TltButton className="action-type-button" variant={heatScope === 'all' ? 'primary' : 'secondary'} icon={<AppstoreOutlined />} aria-pressed={heatScope === 'all'} onClick={() => setHeatScope('all')}>Все: <strong className="action-type-count">3</strong></TltButton>
            <Tooltip title="Пол — будущее расширение PDF; расчёт не входит в MVP">
              <TltButton className="action-type-button" disabled aria-label="Пол (недоступно)" aria-disabled>Пол</TltButton>
            </Tooltip>
          </div>
          <div className="actionbar-group actionbar-form-state-group">
            {showHeatForm ? (
              <TltBadge className={`actionbar-mode-tag ${selectedRow ? 'edit' : 'new'}`}>
                {selectedRow ? 'Режим: изменение' : 'Режим: добавление'}
              </TltBadge>
            ) : null}
            <Checkbox className="actionbar-form-toggle" checked={showHeatForm} onChange={(event) => setShowHeatForm(event.target.checked)}>Показать блок заполнения параметров</Checkbox>
            <Tooltip title="Перейти к электротехническому расчёту">
              <span className="action-tooltip-wrap">
                <TltButton variant="primary" disabled aria-label="Далее. Электротехнический расчёт">Далее → Электротехнический расчёт</TltButton>
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
                <TltButton variant="primary" className="action-icon-button action-add-button add" icon={<PlusOutlined />} aria-label="Добавить объект в эталоне" />
              </Tooltip>
              <Tooltip title="Сохранить изменения">
                <span className="action-tooltip-wrap">
                  <TltButton className="action-icon-button action-save-button save" icon={<SaveOutlined />} aria-label="Сохранить объект в эталоне" />
                </span>
              </Tooltip>
              <Tooltip title={selectedRow === '' ? 'Выберите строки для удаления' : 'Удалить выбранные'}>
                <span className="action-tooltip-wrap">
                  <TltButton variant="danger" disabled={selectedRow === ''} className="action-icon-button action-secondary-button" icon={<DeleteOutlined />} aria-label="Удалить объект в эталоне" />
                </span>
              </Tooltip>
            </div>
          </div>
          <div className="actionbar-table-actions-row" role="toolbar" aria-label="Действия таблицы объектов">
            <div className="actionbar-group actionbar-table-actions-group">
              <Segmented size="small" defaultValue="normal" options={[{ label: 'Обычный режим', value: 'normal' }, { label: 'Excel-режим', value: 'excel' }]} />
              <Tooltip title="Пересчитать выбранный тип">
                <span className="action-tooltip-wrap">
                  <TltButton className="action-icon-button action-secondary-button" icon={<ReloadOutlined />} aria-label="Пересчитать выбранный тип" />
                </span>
              </Tooltip>
              <Tooltip title="Пересчитать все объекты">
                <span className="action-tooltip-wrap">
                  <TltButton className="action-secondary-button action-recalc-all-button" icon={<ReloadOutlined />} aria-label="Пересчитать все">Пересчитать все</TltButton>
                </span>
              </Tooltip>
              <Tooltip title="Настройки отображения">
                <span className="action-tooltip-wrap">
                  <TltButton className="action-icon-button action-secondary-button" icon={<TableOutlined />} aria-label="Настройки отображения эталона" />
                </span>
              </Tooltip>
              <Tooltip title="Фильтры не активны">
                <span className="action-tooltip-wrap">
                  <TltButton className="action-icon-button action-secondary-button" icon={<CloseCircleOutlined />} aria-label="Сбросить фильтры таблицы" disabled />
                </span>
              </Tooltip>
              <Tooltip title={selectedRow ? 'Добавить копии выбранных объектов: 1' : 'Выберите галочками один или несколько объектов для копирования'}>
                <span className="action-tooltip-wrap">
                  <TltButton className="action-icon-button action-secondary-button" icon={<CopyOutlined />} aria-label="Добавить копии выбранных" disabled={selectedRow === ''} />
                </span>
              </Tooltip>
              <Space className="import-actions-compact" size={2} wrap>
                <Tooltip title="Импорт XLSX/CSV">
                  <TltButton className="action-icon-button action-secondary-button import-upload-button" icon={<UploadOutlined />} aria-label="Импорт XLSX/CSV" size="compact" />
                </Tooltip>
                <Tooltip title="Скачать шаблон XLSX">
                  <TltButton icon={<DownloadOutlined />} aria-label="Скачать шаблон XLSX" size="compact" variant="link" className="template-download-button">.xlsx</TltButton>
                </Tooltip>
                <Tooltip title="Скачать шаблон CSV">
                  <TltButton icon={<DownloadOutlined />} aria-label="Скачать шаблон CSV" size="compact" variant="link" className="template-download-button">.csv</TltButton>
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
              onChange: (keys) => onSelectedRowChange(String(keys[0] ?? '')),
            }}
            scroll={{ x: 795 }}
            onRow={(row) => ({ onClick: () => onSelectedRowChange(row.id) })}
          />
        </div>
      </div>
    </CompactSection>
  );
}
