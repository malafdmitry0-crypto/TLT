/**
 * Гарантия из §5.4 промпта — вынесена из `wizardStoryDecorators.tsx`: файл с
 * компонентом не должен экспортировать ничего, кроме компонентов (react-refresh).
 */
import { expect } from 'storybook/test';

export async function expectIslandScale(
  root: Element | null,
  controlSelector: string,
  expected: { height: number; radius: string; labelSize?: string },
) {
  await expect(root).not.toBeNull();
  const control = root!.querySelector(controlSelector);
  await expect(control, `контрол «${controlSelector}» не найден`).not.toBeNull();

  await expect(Math.round(control!.getBoundingClientRect().height)).toBe(
    expected.height,
  );
  await expect(getComputedStyle(control!).borderTopLeftRadius).toBe(
    expected.radius,
  );

  if (expected.labelSize) {
    const label = root!.querySelector('.ant-form-item-label label');
    await expect(label).not.toBeNull();
    await expect(getComputedStyle(label!).fontSize).toBe(expected.labelSize);
  }
}
