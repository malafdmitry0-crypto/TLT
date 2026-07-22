/** Split multi-word labels into 2 lines balanced by character length (not word count). */
function balancedSplitIndex(words: string[]): number {
  if (words.length < 2) return 1;
  let best = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i += 1) {
    const left = words.slice(0, i).join(' ').length;
    const right = words.slice(i).join(' ').length;
    // Prefer even split; slight bias toward shorter first line for dense forms.
    const score = Math.abs(left - right) + (left > right ? 0.25 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export default function FieldLabel({ text }: { text: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length < 2) return <span>{text}</span>;

  const splitAt = balancedSplitIndex(words);

  return (
    <span className="field-label-two-line">
      <span>{words.slice(0, splitAt).join(' ')}</span>
      <span>{words.slice(splitAt).join(' ')}</span>
    </span>
  );
}
