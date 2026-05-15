import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';

type HelpedControlProps = {
  hint: string;
  children: ReactElement;
};

const TOOLTIP_MARGIN_PX = 8;
const TOOLTIP_GAP_PX = 8;
const TOOLTIP_SHOW_DELAY_MS = 300;

export default function HelpedControl({
  hint,
  children,
  ...controlProps
}: HelpedControlProps & Record<string, unknown>) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const child = Children.only(children) as ReactNode;

  useEffect(() => {
    const root = rootRef.current;
    const trimmedHint = hint.trim();
    if (!root || !trimmedHint || typeof document === 'undefined') return undefined;

    const formItem = root.closest('.ant-form-item');
    const label = formItem?.querySelector('.ant-form-item-label > label') as HTMLElement | null;
    if (!label) return undefined;
    const labelEl = label;

    labelEl.dataset.fieldHelp = trimmedHint;
    labelEl.dataset.fieldHelpFloating = 'true';

    const tooltipId = `field-help-${Math.random().toString(36).slice(2)}`;
    let tooltip: HTMLDivElement | null = null;
    let showTimer: number | undefined;
    let frameId: number | undefined;

    function positionTooltip() {
      if (!tooltip) return;
      const rect = labelEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const maxWidth = Math.max(160, viewportWidth - TOOLTIP_MARGIN_PX * 2);

      tooltip.style.maxWidth = `${Math.min(360, maxWidth)}px`;
      const tooltipRect = tooltip.getBoundingClientRect();
      const halfWidth = tooltipRect.width / 2;
      const preferredCenter = rect.left + rect.width / 2;
      const centerX = Math.min(
        viewportWidth - TOOLTIP_MARGIN_PX - halfWidth,
        Math.max(TOOLTIP_MARGIN_PX + halfWidth, preferredCenter),
      );
      const topAbove = rect.top - tooltipRect.height - TOOLTIP_GAP_PX;
      const topBelow = rect.bottom + TOOLTIP_GAP_PX;
      const top = topAbove >= TOOLTIP_MARGIN_PX
        ? topAbove
        : Math.min(viewportHeight - TOOLTIP_MARGIN_PX - tooltipRect.height, topBelow);

      tooltip.style.left = `${centerX}px`;
      tooltip.style.top = `${Math.max(TOOLTIP_MARGIN_PX, top)}px`;
    }

    function schedulePosition() {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = undefined;
        positionTooltip();
      });
    }

    function hideTooltip() {
      if (showTimer != null) {
        window.clearTimeout(showTimer);
        showTimer = undefined;
      }
      if (frameId != null) {
        window.cancelAnimationFrame(frameId);
        frameId = undefined;
      }
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
      labelEl.removeAttribute('aria-describedby');
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
    }

    function showTooltip() {
      if (tooltip || showTimer != null) return;
      showTimer = window.setTimeout(() => {
        showTimer = undefined;
        tooltip = document.createElement('div');
        tooltip.id = tooltipId;
        tooltip.className = 'field-help-floating-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = trimmedHint;
        document.body.appendChild(tooltip);
        labelEl.setAttribute('aria-describedby', tooltipId);
        positionTooltip();
        window.requestAnimationFrame(() => tooltip?.classList.add('is-visible'));
        window.addEventListener('resize', schedulePosition);
        window.addEventListener('scroll', schedulePosition, true);
      }, TOOLTIP_SHOW_DELAY_MS);
    }

    labelEl.addEventListener('mouseenter', showTooltip);
    labelEl.addEventListener('mouseleave', hideTooltip);
    labelEl.addEventListener('focusin', showTooltip);
    labelEl.addEventListener('focusout', hideTooltip);

    return () => {
      labelEl.removeEventListener('mouseenter', showTooltip);
      labelEl.removeEventListener('mouseleave', hideTooltip);
      labelEl.removeEventListener('focusin', showTooltip);
      labelEl.removeEventListener('focusout', hideTooltip);
      hideTooltip();
      if (labelEl.dataset.fieldHelp === trimmedHint) {
        delete labelEl.dataset.fieldHelp;
      }
      if (labelEl.dataset.fieldHelpFloating === 'true') {
        delete labelEl.dataset.fieldHelpFloating;
      }
    };
  }, [hint]);

  return (
    <span ref={rootRef} className="field-control-with-help">
      {isValidElement(child) ? cloneElement(child, controlProps) : child}
    </span>
  );
}
