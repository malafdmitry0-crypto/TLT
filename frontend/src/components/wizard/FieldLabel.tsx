export default function FieldLabel({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);

  if (words.length < 2) return <span>{text}</span>;

  const splitAt = Math.ceil(words.length / 2);

  return (
    <span className="field-label-two-line">
      <span>{words.slice(0, splitAt).join(' ')}</span>
      <span>{words.slice(splitAt).join(' ')}</span>
    </span>
  );
}
