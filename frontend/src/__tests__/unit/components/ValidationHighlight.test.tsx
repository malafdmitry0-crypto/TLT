import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ValidationHighlight from '@/components/common/ValidationHighlight';

describe('ValidationHighlight', () => {
  it('adds invalid class when invalid', () => {
    render(
      <ValidationHighlight isInvalid errorText="err">
        <span>x</span>
      </ValidationHighlight>
    );
    expect(screen.getByTestId('validation-wrapper')).toHaveClass('cell-invalid');
  });

  it('does not add class when valid', () => {
    render(
      <ValidationHighlight>
        <span>y</span>
      </ValidationHighlight>
    );
    expect(screen.getByTestId('validation-wrapper')).not.toHaveClass('cell-invalid');
  });
});
