/**
 * Report wizard export format labels/icons (P-BAND-15).
 */
import {
  FileExcelOutlined,
  FilePdfOutlined,
  FileWordOutlined,
} from '@ant-design/icons';

export type ReportWizardFormat = 'pdf' | 'docx' | 'xlsx';

export const REPORT_WIZARD_FORMAT_LABEL: Record<
  ReportWizardFormat,
  { label: string; icon: React.ReactNode }
> = {
  pdf: { label: 'PDF', icon: <FilePdfOutlined /> },
  docx: { label: 'Word (DOCX)', icon: <FileWordOutlined /> },
  xlsx: { label: 'Excel (XLSX)', icon: <FileExcelOutlined /> },
};
