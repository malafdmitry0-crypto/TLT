import {
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
} from 'react';
import {
  HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT,
  normalizeFormSectionWeights,
  type HeatCalcFormSectionWeights,
} from '@/utils/heatCalcTableViewSettings';

const SECTION_RESIZE_HANDLE_WIDTH = 4;
const SECTION_GRID_GAP_WIDTH = 2;
const SECTION_FIELD_PAIR_MIN_WIDTHS = [206, 206, 220];
const SECTION_RESIZE_HANDLE_COUNT = SECTION_FIELD_PAIR_MIN_WIDTHS.length - 1;
const SECTION_GRID_GAP_COUNT = SECTION_FIELD_PAIR_MIN_WIDTHS.length + SECTION_RESIZE_HANDLE_COUNT - 1;
const SECTION_FIELD_GRID =
  'repeat(auto-fit, minmax(min(100%, max(var(--field-pair-min-width), calc((100% - 4px) / 2))), 1fr))';
const FIXED_FORM_SECTION_WEIGHTS = [1.45, 1.85, 1.5] as const;

interface UseObjectWizardSectionResizeOptions {
  formSectionWeights?: HeatCalcFormSectionWeights;
  sectionResizeEnabled: boolean;
  onFormSectionWeightsChange?: (weights: HeatCalcFormSectionWeights) => void;
  onFormSectionWeightsCommit?: (weights: HeatCalcFormSectionWeights) => void;
}

function resizedSectionWeights(
  handleIndex: number,
  clientX: number,
  startX: number,
  startWeights: HeatCalcFormSectionWeights,
  availableWidth: number,
): HeatCalcFormSectionWeights {
  const totalWeight = startWeights.reduce((total, weight) => total + weight, 0);
  const pxPerWeight = availableWidth / totalWeight;
  if (!Number.isFinite(pxPerWeight) || pxPerWeight <= 0) return startWeights;
  const minWeights = SECTION_FIELD_PAIR_MIN_WIDTHS.map((minWidth) =>
    Math.max(0.35, Math.min(1.1, (minWidth / availableWidth) * totalWeight)),
  );
  const pairTotal = startWeights[handleIndex] + startWeights[handleIndex + 1];
  const minLeft = minWeights[handleIndex] ?? 0.35;
  const minRight = minWeights[handleIndex + 1] ?? 0.35;
  const maxLeft = pairTotal - minRight;
  if (maxLeft <= minLeft) return startWeights;
  const deltaWeight = (clientX - startX) / pxPerWeight;
  const nextLeft = Math.min(maxLeft, Math.max(minLeft, startWeights[handleIndex] + deltaWeight));
  const next = [...startWeights] as HeatCalcFormSectionWeights;
  next[handleIndex] = Math.round(nextLeft * 1000) / 1000;
  next[handleIndex + 1] = Math.round((pairTotal - nextLeft) * 1000) / 1000;
  return normalizeFormSectionWeights(next);
}

export function useObjectWizardSectionResize({
  formSectionWeights,
  sectionResizeEnabled,
  onFormSectionWeightsChange,
  onFormSectionWeightsCommit,
}: UseObjectWizardSectionResizeOptions) {
  const formGridElementRef = useRef<HTMLDivElement | null>(null);
  const formGridRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    formGridElementRef.current = node;
  }, []);
  const resolvedFormSectionWeights = useMemo(
    () => normalizeFormSectionWeights(
      sectionResizeEnabled
        ? formSectionWeights ?? HEATCALC_FORM_SECTION_WEIGHTS_DEFAULT
        : FIXED_FORM_SECTION_WEIGHTS,
    ),
    [formSectionWeights, sectionResizeEnabled],
  );
  const formSectionWeightsRef = useRef<HeatCalcFormSectionWeights>(resolvedFormSectionWeights);

  useEffect(() => {
    formSectionWeightsRef.current = resolvedFormSectionWeights;
  }, [resolvedFormSectionWeights]);

  function startSectionResizeDrag(
    handleIndex: number,
    startX: number,
    moveEventName: 'pointermove' | 'mousemove',
    upEventName: 'pointerup' | 'mouseup',
    cancelEventName?: 'pointercancel',
  ) {
    if (!sectionResizeEnabled || !onFormSectionWeightsChange) return;
    const handleWeightsChange: (weights: HeatCalcFormSectionWeights) => void = onFormSectionWeightsChange;
    const handleWeightsCommit = onFormSectionWeightsCommit;
    const rect = formGridElementRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const startWeights = formSectionWeightsRef.current;
    const availableWidth = Math.max(
      1,
      rect.width
        - SECTION_RESIZE_HANDLE_WIDTH * SECTION_RESIZE_HANDLE_COUNT
        - SECTION_GRID_GAP_WIDTH * SECTION_GRID_GAP_COUNT,
    );
    document.body.classList.add('heatcalc-form-section-resizing');

    const finishResize = (event?: PointerEvent | MouseEvent) => {
      window.removeEventListener(moveEventName, handleMove as EventListener);
      window.removeEventListener(upEventName, handleUp as EventListener);
      if (cancelEventName) window.removeEventListener(cancelEventName, handleCancel as EventListener);
      document.body.classList.remove('heatcalc-form-section-resizing');
      const finalWeights = event
        ? resizedSectionWeights(handleIndex, event.clientX, startX, startWeights, availableWidth)
        : formSectionWeightsRef.current;
      handleWeightsChange(finalWeights);
      handleWeightsCommit?.(finalWeights);
    };

    function handleMove(event: PointerEvent | MouseEvent) {
      const nextWeights = resizedSectionWeights(handleIndex, event.clientX, startX, startWeights, availableWidth);
      formSectionWeightsRef.current = nextWeights;
      handleWeightsChange(nextWeights);
    }

    function handleUp(event: PointerEvent | MouseEvent) {
      finishResize(event);
    }

    function handleCancel() {
      finishResize();
    }

    window.addEventListener(moveEventName, handleMove as EventListener);
    window.addEventListener(upEventName, handleUp as EventListener);
    if (cancelEventName) window.addEventListener(cancelEventName, handleCancel as EventListener);
  }

  function startSectionResize(handleIndex: number, event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startSectionResizeDrag(handleIndex, event.clientX, 'pointermove', 'pointerup', 'pointercancel');
  }

  function startSectionMouseResize(handleIndex: number, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    startSectionResizeDrag(handleIndex, event.clientX, 'mousemove', 'mouseup');
  }

  function resizeHandleProps(handleIndex: number): HTMLAttributes<HTMLDivElement> {
    const totalWeight = resolvedFormSectionWeights.reduce((total, weight) => total + weight, 0);
    const leftWeight = resolvedFormSectionWeights
      .slice(0, handleIndex + 1)
      .reduce((total, weight) => total + weight, 0);
    const separatorValue = totalWeight > 0 ? Math.round((leftWeight / totalWeight) * 100) : 0;

    return {
      role: sectionResizeEnabled ? 'separator' : undefined,
      'aria-label': sectionResizeEnabled ? 'Изменить ширину областей формы' : undefined,
      'aria-orientation': sectionResizeEnabled ? 'vertical' as const : undefined,
      'aria-valuemin': sectionResizeEnabled ? 0 : undefined,
      'aria-valuemax': sectionResizeEnabled ? 100 : undefined,
      'aria-valuenow': sectionResizeEnabled ? separatorValue : undefined,
      tabIndex: sectionResizeEnabled ? 0 : undefined,
      onPointerDown: sectionResizeEnabled ? (event: ReactPointerEvent<HTMLDivElement>) => startSectionResize(handleIndex, event) : undefined,
      onMouseDown: sectionResizeEnabled ? (event: ReactMouseEvent<HTMLDivElement>) => startSectionMouseResize(handleIndex, event) : undefined,
    };
  }

  function sectionStyle(idx: number): CSSProperties {
    if (!sectionResizeEnabled) {
      const style = {
        gridTemplateColumns: SECTION_FIELD_GRID,
      } as CSSProperties & Record<string, string>;
      style['--field-pair-min-width'] = `${SECTION_FIELD_PAIR_MIN_WIDTHS[Math.min(idx, SECTION_FIELD_PAIR_MIN_WIDTHS.length - 1)]}px`;
      if (idx >= 2) {
        style['--compact-field-label-width'] = '104px';
      }
      return style;
    }

    const expandedWeight = resolvedFormSectionWeights.reduce(
      (total, weight) => total + weight,
      0,
    );
    const availableWidth =
      `100% - ${SECTION_RESIZE_HANDLE_WIDTH * SECTION_RESIZE_HANDLE_COUNT + SECTION_GRID_GAP_WIDTH * SECTION_GRID_GAP_COUNT}px`;
    const share = expandedWeight > 0 ? resolvedFormSectionWeights[idx] / expandedWeight : 1;

    const style = {
      width: `calc((${availableWidth}) * ${share})`,
      gridTemplateColumns: SECTION_FIELD_GRID,
    } as CSSProperties & Record<string, string>;
    style['--field-pair-min-width'] = `${SECTION_FIELD_PAIR_MIN_WIDTHS[idx]}px`;
    if (idx === 2) {
      style['--compact-field-label-width'] = '104px';
    }

    return style;
  }

  return {
    formGridRef,
    resizeHandleProps,
    sectionStyle,
  };
}
