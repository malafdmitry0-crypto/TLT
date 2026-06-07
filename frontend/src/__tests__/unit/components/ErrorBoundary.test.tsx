import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import ErrorBoundary, { RouteErrorBoundary } from '@/components/common/ErrorBoundary';
import { recordClientAuditEvent } from '@/utils/clientAudit';

vi.mock('@/utils/clientAudit', () => ({
  recordClientAuditEvent: vi.fn(),
}));

function Boom(): JSX.Element {
  throw new Error('render exploded');
}

describe('ErrorBoundary', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // React логирует пойманную ошибку в console.error — глушим шум в тесте.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <span>safe content</span>
      </ErrorBoundary>,
    );
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('shows fallback and reports telemetry when a child throws', () => {
    render(
      <ErrorBoundary boundaryName="unit">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    expect(recordClientAuditEvent).toHaveBeenCalledWith(
      'frontend.render.error_boundary',
      expect.objectContaining({ boundary: 'unit' }),
      expect.objectContaining({ severity: 'critical', error_code: 'render_error' }),
    );
  });

  it('recovers via "Попробовать снова" when the child stops throwing', async () => {
    function Toggle(): JSX.Element {
      const [crash, setCrash] = useState(true);
      return (
        <ErrorBoundary fallback={(_e, reset) => (
          <button onClick={() => { setCrash(false); reset(); }}>retry</button>
        )}
        >
          {crash ? <Boom /> : <span>recovered</span>}
        </ErrorBoundary>
      );
    }
    render(<Toggle />);
    await userEvent.click(screen.getByText('retry'));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('RouteErrorBoundary clears the error after navigation', async () => {
    render(
      <MemoryRouter initialEntries={['/boom']}>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/boom" element={<Boom />} />
            <Route path="/safe" element={<span>safe page</span>} />
          </Routes>
        </RouteErrorBoundary>
        <Link to="/safe">go safe</Link>
      </MemoryRouter>,
    );
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    await userEvent.click(screen.getByText('go safe'));
    expect(screen.getByText('safe page')).toBeInTheDocument();
  });
});
