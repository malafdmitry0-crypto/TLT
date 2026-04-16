import DOMPurify from 'dompurify';

interface Props {
  html: string;
}

export default function ReportPreview({ html }: Props) {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    WHOLE_DOCUMENT: true,
  });
  return (
    <div
      data-testid="report-preview"
      style={{
        border: '1px solid #ddd',
        padding: 16,
        background: '#fff',
        maxHeight: 700,
        overflow: 'auto',
      }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
