/**
 * Split multi-word labels into word-boundary lines balanced by character
 * length: 2 words → 2 lines, 3+ words → 3 lines (control height = 3 label
 * lines, see heatcalc-field-chrome-core.css density tokens).
 */
function balancedSplit(words: string[], lineCount: number): string[] {
  if (words.length <= lineCount) return words;
  const len = (from: number, to: number) => words.slice(from, to).join(' ').length;
  if (lineCount === 2) {
    let best = 1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 1; i < words.length; i += 1) {
      const left = len(0, i);
      const right = len(i, words.length);
      // Prefer even split; slight bias toward shorter first line for dense forms.
      const score = Math.abs(left - right) + (left > right ? 0.25 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  // 3 lines: minimize total deviation from the mean; ties → shorter first lines.
  let best: [number, number] = [1, 2];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length - 1; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      const parts = [len(0, i), len(i, j), len(j, words.length)];
      const mean = (parts[0] + parts[1] + parts[2]) / 3;
      const score = parts.reduce((acc, part) => acc + Math.abs(part - mean), 0);
      if (score < bestScore) {
        bestScore = score;
        best = [i, j];
      }
    }
  }
  return [
    words.slice(0, best[0]).join(' '),
    words.slice(best[0], best[1]).join(' '),
    words.slice(best[1]).join(' '),
  ];
}

export default function FieldLabel({ text }: { text: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length < 2) return <span>{text}</span>;

  const lines = balancedSplit(words, Math.min(words.length, 3));

  return (
    <span className="field-label-two-line">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}
