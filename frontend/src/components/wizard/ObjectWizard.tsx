import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Button, Checkbox, Form, Input, InputNumber, Select } from 'antd';
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import type { ObjectType } from '@/constants/objectTypes';
import PipeGeometryStep from './steps/PipeGeometryStep';
import TankGeometryStep from './steps/TankGeometryStep';
import ThermalStep from './steps/ThermalStep';
import HelpedControl from './HelpedControl';
import FieldLabel from './FieldLabel';
import {
  generatePipeName,
  generateTankName,
  pipeFormToApiParams,
  tankFormToApiParams,
  pipeApiParamsToForm,
  tankApiParamsToForm,
  type PipeFormValues,
  type TankFormValues,
} from '@/utils/objectWizardUtils';

interface Props {
  objectType: ObjectType;
  onClose: () => void;
  onSubmit: (params: Record<string, unknown>) => void;
  submitting?: boolean;
  /** Pass existing params to enable edit mode */
  initialParams?: Record<string, unknown>;
}

const SECTION_WIDTHS_STORAGE_KEY = 'object-wizard-section-widths-v11';
const SECTION_AUTO_ALIGN_STORAGE_KEY = 'object-wizard-section-auto-align';
const SECTION_MIN_COLUMN_WIDTH = 316;
const SECTION_RESIZE_HANDLE_WIDTH = 5;

function sectionWidthsStorageKey(objectType: ObjectType) {
  return `${SECTION_WIDTHS_STORAGE_KEY}-${objectType}`;
}

function sectionAutoAlignStorageKey(objectType: ObjectType) {
  return `${SECTION_AUTO_ALIGN_STORAGE_KEY}-${objectType}`;
}

function normalizeSectionWidths(widths: number[]) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (width / total) * 100);
}

function getSectionControlCounts(objectType: ObjectType) {
  return objectType === 'pipe'
    ? [8, 9, 6, 7]
    : [6, 9, 6, 4];
}

function isBetterSectionLayout(
  score: number[],
  bestScore: number[] | null,
) {
  if (bestScore == null) return true;
  return score.some((value, idx) => value < bestScore[idx] && score.slice(0, idx).every((prev, i) => prev === bestScore[i]));
}

function calculateOptimalSectionWidths(controlCounts: number[], availableWidth?: number) {
  const viewportWidth =
    availableWidth ??
    (typeof window === 'undefined' ? 1200 : window.innerWidth);
  const contentWidth = Math.max(
    SECTION_MIN_COLUMN_WIDTH * 4,
    viewportWidth - SECTION_RESIZE_HANDLE_WIDTH * 3,
  );
  const maxColumns = controlCounts.reduce((sum, count) => sum + count, 0);
  const maxFittingColumns = Math.min(
    maxColumns,
    Math.max(4, Math.floor(contentWidth / SECTION_MIN_COLUMN_WIDTH)),
  );
  let columns = [1, 1, 1, 1];
  let bestScore: number[] | null = null;

  for (let totalColumns = 4; totalColumns <= maxFittingColumns; totalColumns += 1) {
    for (let a = 1; a <= controlCounts[0]; a += 1) {
      for (let b = 1; b <= controlCounts[1]; b += 1) {
        for (let c = 1; c <= controlCounts[2]; c += 1) {
          const d = totalColumns - a - b - c;
          if (d < 1 || d > controlCounts[3]) continue;

          const candidate = [a, b, c, d];
          const rows = controlCounts.map((count, idx) => Math.ceil(count / candidate[idx]));
          const sortedRows = [...rows].sort((left, right) => right - left);
          const totalRows = rows.reduce((sum, rowCount) => sum + rowCount, 0);
          const singleColumnSections = candidate.filter((columnCount) => columnCount === 1).length;
          const rowSpread = Math.max(...rows) - Math.min(...rows);
          const columnSpread = Math.max(...candidate) - Math.min(...candidate);
          const score = [
            ...sortedRows,
            totalRows,
            singleColumnSections,
            rowSpread,
            columnSpread,
            totalColumns,
          ];

          if (isBetterSectionLayout(score, bestScore)) {
            bestScore = score;
            columns = candidate;
          }
        }
      }
    }
  }

  const baseWidths = columns.map((columnCount) => columnCount * SECTION_MIN_COLUMN_WIDTH);
  const spareWidth = Math.max(0, contentWidth - baseWidths.reduce((sum, width) => sum + width, 0));
  const widths = baseWidths.map((width) => width + spareWidth / baseWidths.length);

  return normalizeSectionWidths(widths);
}

function getDefaultSectionWidths(objectType: ObjectType, availableWidth?: number) {
  return calculateOptimalSectionWidths(getSectionControlCounts(objectType), availableWidth);
}

function readSavedSectionWidths(objectType: ObjectType) {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(sectionWidthsStorageKey(objectType)) ?? 'null');
    if (
      Array.isArray(parsed) &&
      parsed.length === 4 &&
      parsed.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 12)
    ) {
      return parsed as number[];
    }
  } catch {
    // Некорректное сохранение игнорируем и возвращаем авторасчёт.
  }

  return null;
}

function getInitialSectionWidths(objectType: ObjectType, availableWidth?: number) {
  return readSavedSectionWidths(objectType) ?? getDefaultSectionWidths(objectType, availableWidth);
}

function saveSectionWidths(objectType: ObjectType, widths: number[]) {
  try {
    window.localStorage.setItem(sectionWidthsStorageKey(objectType), JSON.stringify(widths));
  } catch {
    // Если localStorage недоступен, форма продолжит работать с текущими ширинами.
  }
}

function clearSavedSectionWidths(objectType: ObjectType) {
  try {
    window.localStorage.removeItem(sectionWidthsStorageKey(objectType));
  } catch {
    // Если localStorage недоступен, просто работаем с текущим состоянием.
  }
}

function readAutoAlign(objectType: ObjectType) {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(sectionAutoAlignStorageKey(objectType)) === 'true';
}

function saveAutoAlign(objectType: ObjectType, value: boolean) {
  try {
    window.localStorage.setItem(sectionAutoAlignStorageKey(objectType), String(value));
  } catch {
    // Если localStorage недоступен, настройка останется только в текущей сессии.
  }
}

function withHelp(control: ReactElement, hint: string) {
  return <HelpedControl hint={hint}>{control}</HelpedControl>;
}

function fieldLabel(text: string) {
  return <FieldLabel text={text} />;
}

export default function ObjectWizard({
  objectType,
  onClose,
  onSubmit,
  submitting = false,
  initialParams,
}: Props) {
  const [form] = Form.useForm();
  const isEditMode = !!initialParams;
  const values = Form.useWatch([], form);
  const prevSuggestedRef = useRef<string>('');
  const [collapsedSections, setCollapsedSections] = useState([false, false, false, false]);
  const [autoAlign, setAutoAlign] = useState(() => readAutoAlign(objectType));

  const initialValues =
    initialParams != null
      ? objectType === 'pipe'
        ? pipeApiParamsToForm(initialParams)
        : tankApiParamsToForm(initialParams)
      : undefined;

  useEffect(() => {
    form.resetFields();
    if (initialValues) form.setFieldsValue(initialValues);
  }, [form, initialParams, objectType]);

  useEffect(() => {
    if (!values) return;
    try {
      const suggestedName =
        objectType === 'pipe'
          ? generatePipeName(values as PipeFormValues)
          : generateTankName(values as TankFormValues);
      if (!suggestedName) return;
      const current = form.getFieldValue('name') as string | undefined;
      if (!current || current === prevSuggestedRef.current) {
        prevSuggestedRef.current = suggestedName;
        form.setFieldsValue({ name: suggestedName });
      }
    } catch {
      // Пока форма заполнена частично, автонаименование может быть недоступно.
    }
  }, [form, objectType, values]);

  async function handleFinish() {
    try {
      await form.validateFields();
      const vals = form.getFieldsValue(true);
      const params =
        objectType === 'pipe'
          ? pipeFormToApiParams(vals)
          : tankFormToApiParams(vals);
      onSubmit(params);
    } catch {
      scrollToFirstError();
    }
  }

  // ── Resizable columns ──────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [colWidths, setColWidths] = useState(() => getInitialSectionWidths(objectType));
  const colWidthsRef = useRef(colWidths);
  const hasManualWidthsRef = useRef(!autoAlign && readSavedSectionWidths(objectType) != null);
  const autoAlignRef = useRef(autoAlign);
  const cleanupRef = useRef<(() => void) | null>(null);
  const collapsedColumnWidth = 22;
  const resizeHandleWidth = SECTION_RESIZE_HANDLE_WIDTH;

  useEffect(() => () => cleanupRef.current?.(), []);

  useEffect(() => {
    const savedAutoAlign = readAutoAlign(objectType);
    autoAlignRef.current = savedAutoAlign;
    setAutoAlign(savedAutoAlign);
    const savedWidths = readSavedSectionWidths(objectType);
    hasManualWidthsRef.current = !savedAutoAlign && savedWidths != null;
    const widths =
      savedAutoAlign || !savedWidths
        ? getOptimalSectionWidths()
        : savedWidths;
    colWidthsRef.current = widths;
    setColWidths(widths);
  }, [objectType]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      if (hasManualWidthsRef.current && !autoAlignRef.current) return;
      const width = entry.contentRect.width;
      const widths = getOptimalSectionWidths(width);
      colWidthsRef.current = widths;
      setColWidths(widths);
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [objectType]);

  function getMeasuredSectionControlCounts() {
    return sectionRefs.current.map((section, idx) => {
      const count = section?.querySelectorAll(':scope > .ant-form-item').length ?? 0;
      return Math.max(1, count || getSectionControlCounts(objectType)[idx]);
    });
  }

  function getOptimalSectionWidths(availableWidth = containerRef.current?.offsetWidth) {
    return calculateOptimalSectionWidths(getMeasuredSectionControlCounts(), availableWidth);
  }

  function applyOptimalLayout() {
    const widths = getOptimalSectionWidths();
    setCollapsedSections([false, false, false, false]);
    hasManualWidthsRef.current = false;
    clearSavedSectionWidths(objectType);
    colWidthsRef.current = widths;
    setColWidths(widths);
  }

  function handleAutoAlignChange(checked: boolean) {
    autoAlignRef.current = checked;
    setAutoAlign(checked);
    saveAutoAlign(objectType, checked);
    if (checked) applyOptimalLayout();
  }

  function onHandleMouseDown(e: React.MouseEvent, idx: number) {
    e.preventDefault();
    if (autoAlignRef.current) return;
    const startX = e.clientX;
    const startWidths = [...colWidthsRef.current];

    const onMouseMove = (ev: MouseEvent) => {
      if (!containerRef.current) return;
      const minWidthPct = (SECTION_MIN_COLUMN_WIDTH / containerRef.current.offsetWidth) * 100;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const pct = ((ev.clientX - startX) / containerRef.current.offsetWidth) * 100;
      const l = startWidths[idx] + pct;
      const r = startWidths[idx + 1] - pct;
      if (l >= minWidthPct && r >= minWidthPct) {
        const w = startWidths.map((v, i) => (i === idx ? l : i === idx + 1 ? r : v));
        colWidthsRef.current = w;
        setColWidths([...w]);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      hasManualWidthsRef.current = true;
      saveSectionWidths(objectType, colWidthsRef.current);
      cleanupRef.current = null;
    };

    cleanupRef.current = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function toggleSection(idx: number) {
    setCollapsedSections((prev) => prev.map((value, i) => (i === idx ? !value : value)));
  }

  function collapsedClickHandler(idx: number) {
    return collapsedSections[idx] ? () => toggleSection(idx) : undefined;
  }

  function sectionStyle(idx: number): React.CSSProperties {
    if (collapsedSections[idx]) {
      return { width: collapsedColumnWidth };
    }

    const expandedTotal = colWidths.reduce(
      (total, width, i) => (collapsedSections[i] ? total : total + width),
      0,
    );
    const collapsedCount = collapsedSections.filter(Boolean).length;
    const availableWidth = `100% - ${collapsedCount * collapsedColumnWidth}px - ${resizeHandleWidth * 3}px`;
    const share = expandedTotal > 0 ? colWidths[idx] / expandedTotal : 1;

    return { width: `calc((${availableWidth}) * ${share})` };
  }

  function renderSectionTitle(title: string, idx: number) {
    const collapsed = collapsedSections[idx];
    return (
      <h4>
        <span>{title}</span>
        <button
          type="button"
          className="form-section-toggle"
          aria-label={collapsed ? `Развернуть: ${title}` : `Свернуть: ${title}`}
          title={collapsed ? 'Развернуть' : 'Свернуть'}
          onClick={(e) => {
            e.stopPropagation();
            toggleSection(idx);
          }}
        >
          {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
        </button>
      </h4>
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <Form form={form} layout="vertical" initialValues={initialValues} className="inline-object-form">
      <div className="form-layout-tools">
        <Button size="small" onClick={applyOptimalLayout}>
          Выровнять
        </Button>
        <Checkbox
          checked={autoAlign}
          onChange={(event) => handleAutoAlignChange(event.target.checked)}
        >
          Автовыравнивание
        </Checkbox>
      </div>
      <div ref={containerRef} className="form-grid-srs">

        {/* ── Геометрия ──────────────────────────────────────────────── */}
        <div
          ref={(node) => { sectionRefs.current[0] = node; }}
          className={`form-col-srs ${collapsedSections[0] ? 'collapsed' : ''}`}
          style={sectionStyle(0)}
          onClick={collapsedClickHandler(0)}
        >
          {renderSectionTitle(objectType === 'pipe' ? 'Геометрия трубы' : 'Форма и геометрия резервуара', 0)}
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Наименование')}
            name="name"
            rules={[{ required: true, message: 'Укажите наименование объекта' }]}
          >
            {withHelp(
              <Input />,
              'Автоматически формируется из параметров объекта. Можно изменить вручную; до 200 символов.',
            )}
          </Form.Item>
          {objectType === 'pipe' ? <PipeGeometryStep /> : <TankGeometryStep />}
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="fit-label-form-item helped-form-item"
                label={fieldLabel('Толщина стенки')}
              >
                {withHelp(
                  <InputNumber value={4} step={0.1} addonAfter="мм" />,
                  'Толщина стенки трубы. Целевой диапазон SRS: 1…100 мм. Поле пока справочное и не участвует в расчёте.',
                )}
              </Form.Item>
              <Form.Item
                className="pipe-material-form-item helped-form-item"
                label={fieldLabel('Материал трубы')}
              >
                {withHelp(
                  <Select value="carbon_steel" options={[{ value: 'carbon_steel', label: 'Сталь углеродистая' }]} />,
                  'Материал стенки трубопровода. Сейчас поле справочное; теплопотери MVP считаются по сохранённым обязательным параметрам.',
                )}
              </Form.Item>
              <Form.Item
                className="fit-label-form-item helped-form-item"
                label={fieldLabel('λ трубы')}
              >
                {withHelp(
                  <InputNumber value={56} step={0.1} addonAfter="Вт/мК" />,
                  'Коэффициент теплопроводности материала трубы λ, Вт/(м·К). Показывает, насколько интенсивно материал стенки проводит тепло. Сейчас поле справочное и не отправляется в расчётный payload.',
                )}
              </Form.Item>
            </>
          )}
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel(objectType === 'pipe' ? 'Размещение трубопровода' : 'Размещение резервуара')}
          >
            {withHelp(
              <Select value="outdoor" options={[{ value: 'outdoor', label: 'На открытом воздухе' }]} />,
              'Варианты по SRS: на открытом воздухе, в помещении, подземно. Сейчас поле справочное; подземная логика будет вынесена в отдельную задачу.',
            )}
          </Form.Item>
          <Form.Item
            className="fit-label-form-item helped-form-item"
            label={fieldLabel('Глубина прокладки')}
          >
            {withHelp(
              <InputNumber disabled placeholder="—" addonAfter="м" />,
              'Используется только для подземной прокладки. Целевой диапазон SRS: 0,1…5,0 м.',
            )}
          </Form.Item>
        </div>

        <div className="form-col-resize-handle" onMouseDown={(e) => onHandleMouseDown(e, 0)} />

        {/* ── Теплоизоляция ──────────────────────────────────────────── */}
        <div
          ref={(node) => { sectionRefs.current[1] = node; }}
          className={`form-col-srs ${collapsedSections[1] ? 'collapsed' : ''}`}
          style={sectionStyle(1)}
          onClick={collapsedClickHandler(1)}
        >
          {renderSectionTitle('Теплоизоляция', 1)}
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('Кол-во слоёв ИЗ')}
          >
            {withHelp(
              <Select value="1" options={[{ value: '1', label: '1 слой' }, { value: '2', label: '2 слоя' }]} />,
              'Целевой диапазон SRS: 1…3 слоя. Сейчас расчётный payload MVP использует основной слой изоляции.',
            )}
          </Form.Item>
          <ThermalStep />
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('λ 1-го слоя')}
          >
            {withHelp(
              <InputNumber disabled value={0.045} step={0.001} addonAfter="Вт/мК" />,
              'Коэффициент теплопроводности первого слоя изоляции λ, Вт/(м·К). Для материала «Другое» по SRS нужно ручное значение 0,005…5,0.',
            )}
          </Form.Item>
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('Материал 2-го слоя')}
          >
            {withHelp(
              <Select value="none" options={[{ value: 'none', label: 'Не указан' }, { value: 'polyurethane_foam', label: 'Пенополиуретан' }]} />,
              'Используется при 2 или 3 слоях изоляции. Сейчас поле справочное и не входит в расчётный payload.',
            )}
          </Form.Item>
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Толщина 2-го слоя')}
          >
            {withHelp(
              <InputNumber value={0} addonAfter="мм" />,
              'Целевой диапазон SRS: 1…500 мм при выбранном 2-м слое. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('Материал покрытия')}
          >
            {withHelp(
              <Select value="none" options={[{ value: 'none', label: 'Не указано' }]} />,
              'Защитное покрытие теплоизоляции из справочника. Сейчас поле справочное.',
            )}
          </Form.Item>
        </div>

        <div className="form-col-resize-handle" onMouseDown={(e) => onHandleMouseDown(e, 1)} />

        {/* ── Температура и среда ────────────────────────────────────── */}
        <div
          ref={(node) => { sectionRefs.current[2] = node; }}
          className={`form-col-srs ${collapsedSections[2] ? 'collapsed' : ''}`}
          style={sectionStyle(2)}
          onClick={collapsedClickHandler(2)}
        >
          {renderSectionTitle('Температура и среда', 2)}
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Требуемая T° объекта')}
          >
            {withHelp(
              <InputNumber value={10} step={0.1} addonAfter="°C" />,
              'Требуемая температура поддержания объекта, °C. Сейчас поле справочное; расчёт использует температуру продукта.',
            )}
          </Form.Item>
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Макс. T° окр. среды')}
          >
            {withHelp(
              <InputNumber value={30} step={0.1} addonAfter="°C" />,
              'Максимальная температура окружающей среды, °C. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Макс. допуст. T° продукта')}
          >
            {withHelp(
              <InputNumber value={90} step={0.1} addonAfter="°C" />,
              'Максимально допустимая температура продукта, °C. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('Среда')}
          >
            {withHelp(
              <Select value="normal" options={[{ value: 'normal', label: 'Нормальная' }, { value: 'aggressive', label: 'Агрессивная' }]} />,
              'Условия эксплуатации: нормальная или агрессивная среда. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('Классификация зоны')}
          >
            {withHelp(
              <Select value="safe" options={[{ value: 'safe', label: 'Безопасная' }, { value: 'explosive', label: 'Взрывоопасная' }]} />,
              'Безопасная или взрывоопасная зона. Сейчас поле справочное.',
            )}
          </Form.Item>
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('Температурная группа')}
          >
            {withHelp(
              <Select value="T1" options={['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((v) => ({ value: v, label: v }))} />,
              'Температурная группа T1…T6 для классификации зоны. Сейчас поле справочное.',
            )}
          </Form.Item>
        </div>

        <div className="form-col-resize-handle" onMouseDown={(e) => onHandleMouseDown(e, 2)} />

        {/* ── Электропараметры и арматура ───────────────────────────── */}
        <div
          ref={(node) => { sectionRefs.current[3] = node; }}
          className={`form-col-srs ${collapsedSections[3] ? 'collapsed' : ''}`}
          style={sectionStyle(3)}
          onClick={collapsedClickHandler(3)}
        >
          {renderSectionTitle('Электропараметры и арматура', 3)}
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Мин. T° включения')}
          >
            {withHelp(
              <InputNumber value={-20} step={0.1} addonAfter="°C" />,
              'Температура включения электрообогрева, °C. Сейчас поле справочное; выбор кабеля выполняется на шаге «Электрорасчёт».',
            )}
          </Form.Item>
          <Form.Item
            className="fixed-select-form-item helped-form-item"
            label={fieldLabel('Рабочее напряжение')}
          >
            {withHelp(
              <Select value="220" options={[{ value: '220', label: '220 В' }, { value: '380', label: '380 В' }]} />,
              'Допустимые значения по SRS: 220 В или 380 В. Сейчас поле справочное для формы SC-03.',
            )}
          </Form.Item>
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Kзап')}
          >
            {withHelp(
              <InputNumber value={1.2} step={0.01} />,
              'Коэффициент запаса Kзап. Целевой диапазон SRS: 1,00…2,00. Сейчас поле справочное; сохранение в payload вынесено в отдельную задачу.',
            )}
          </Form.Item>
          <Form.Item
            className="helped-form-item"
            label={fieldLabel('Пропарка')}
          >
            {withHelp(
              <Select value="no" options={[{ value: 'yes', label: 'Да' }, { value: 'no', label: 'Нет' }]} />,
              'Если «Да», по SRS требуется максимальная температура пара. Сейчас поле справочное.',
            )}
          </Form.Item>
          {objectType === 'pipe' && (
            <>
              <Form.Item
                className="helped-form-item"
                label={fieldLabel('Задвижки')}
              >
                {withHelp(
                  <InputNumber value={2} min={0} addonAfter="шт" />,
                  'Количество задвижек, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              </Form.Item>
              <Form.Item
                className="helped-form-item"
                label={fieldLabel('Фланцы')}
              >
                {withHelp(
                  <InputNumber value={2} min={0} addonAfter="шт" />,
                  'Количество фланцев, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              </Form.Item>
              <Form.Item
                className="helped-form-item"
                label={fieldLabel('Опоры')}
              >
                {withHelp(
                  <InputNumber value={2} min={0} addonAfter="шт" />,
                  'Количество опор, шт. Целевой диапазон валидации: 0…100. Сейчас поле справочное.',
                )}
              </Form.Item>
            </>
          )}
        </div>

      </div>
      <div className="hidden-submit">
        <Button id="inline-object-save" type="primary" onClick={handleFinish} loading={submitting}>
          {isEditMode ? 'Сохранить изменения' : 'Добавить объект'}
        </Button>
        <Button id="inline-object-cancel" onClick={onClose}>Отмена</Button>
      </div>
    </Form>
  );
}

function scrollToFirstError() {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('.inline-object-form .ant-form-item-has-error');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector<HTMLElement>('input, select, textarea')?.focus();
    }
  }, 0);
}
