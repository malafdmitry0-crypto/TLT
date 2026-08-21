import DOMPurify from 'dompurify';
import './report-preview.css';

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
      className="report-preview-frame"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
