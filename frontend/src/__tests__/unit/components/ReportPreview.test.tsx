import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportPreview from '@/components/reports/ReportPreview';

describe('ReportPreview', () => {
  it('renders html content', () => {
    render(<ReportPreview html="<h1>Hello</h1>" />);
    expect(screen.getByTestId('report-preview').innerHTML).toContain('<h1>Hello</h1>');
  });
});
