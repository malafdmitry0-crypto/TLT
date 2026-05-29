interface HeatCalcSelectedRowErrorsOverlayProps {
  messages: string[];
}

export default function HeatCalcSelectedRowErrorsOverlay({
  messages,
}: HeatCalcSelectedRowErrorsOverlayProps) {
  if (messages.length === 0) return null;
  const visibleMessages = messages.slice(0, 4);
  const hiddenCount = Math.max(0, messages.length - visibleMessages.length);
  const messageText = [
    visibleMessages.join('; '),
    hiddenCount > 0 ? `ещё ${hiddenCount}` : '',
  ].filter(Boolean).join('; ');

  return (
    <div
      className="heatcalc-row-errors-overlay"
      role="status"
      aria-label="Ошибки выбранной строки"
      data-testid="heatcalc-row-errors-overlay"
    >
      <div className="heatcalc-row-errors-title">Ошибки выбранной строки</div>
      <div className="heatcalc-row-errors-message" title={messageText}>
        {messageText}
      </div>
    </div>
  );
}
