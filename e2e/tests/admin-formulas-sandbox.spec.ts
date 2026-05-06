import { expect, Page, test } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login?role=admin');
  await page.getByLabel('Email').fill(process.env.ADMIN_EMAIL ?? 'admin@heatcalc.io');
  await page.getByLabel('Пароль').fill(process.env.ADMIN_PASSWORD ?? 'admin');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/admin/);
}

async function fillNumber(page: Page, label: string | RegExp, value: string) {
  const activeTab = page.locator('.ant-tabs-tabpane-active');
  const labelNode = activeTab.locator('label', { hasText: label }).first();
  const inputId = await labelNode.getAttribute('for');
  const field = inputId ? activeTab.locator(`#${inputId}`) : activeTab.getByLabel(label).first();
  await field.fill(value);
}

async function clickActiveButton(page: Page, name: string | RegExp) {
  await page.locator('.ant-tabs-tabpane-active').getByRole('button', { name }).click();
}

async function expectActiveText(page: Page, text: string | RegExp) {
  await expect(page.locator('.ant-tabs-tabpane-active').getByText(text)).toBeVisible();
}

test.describe('Админка: песочница формул', () => {
  test('прогоняет расчёт на всех вкладках формул', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/formulas');
    await expect(page.getByText('Расчётные формулы')).toBeVisible();

    await fillNumber(page, 'Нар. диаметр трубы, мм', '108');
    await fillNumber(page, 'Длина трубопровода, м', '50');
    await fillNumber(page, 'Слой 1, мм', '50');
    await fillNumber(page, 'T продукта, °C', '80');
    await fillNumber(page, 'T окружающей среды, °C', '-20');
    await fillNumber(page, 'Скорость ветра, м/с', '5');
    await clickActiveButton(page, 'Рассчитать');
    await expectActiveText(page, 'Результат расчёта трубопровода');

    await page.getByRole('tab', { name: /^Резервуар$/ }).click();
    await fillNumber(page, 'Диаметр, мм', '2000');
    await fillNumber(page, 'Высота, мм', '3000');
    await fillNumber(page, 'Слой 1, мм', '80');
    await fillNumber(page, 'T продукта, °C', '60');
    await fillNumber(page, 'T окружающей среды, °C', '-20');
    await fillNumber(page, 'Скорость ветра, м/с', '5');
    await clickActiveButton(page, 'Рассчитать');
    await expectActiveText(page, 'Результат расчёта резервуара');

    await page.getByRole('tab', { name: 'Саморег. ТЛТ' }).click();
    await fillNumber(page, 'Требуемая мощность, Вт/м', '30');
    await fillNumber(page, 'Длина трубопровода, м', '50');
    await fillNumber(page, 'T окружающей среды, °C', '-20');
    await fillNumber(page, 'T продукта, °C (необяз.)', '60');
    await clickActiveButton(page, 'Подобрать кабель');
    await expectActiveText(page, 'Результат подбора кабеля');

    await page.getByRole('tab', { name: 'Саморег. ТТ' }).click();
    await fillNumber(page, 'Требуемая мощность, Вт/м', '20');
    await fillNumber(page, 'Длина, м', '50');
    await fillNumber(page, 'T продукта, °C', '60');
    await clickActiveButton(page, 'Подобрать кабель');
    await expectActiveText(page, 'Результат подбора кабеля');

    await page.getByRole('tab', { name: 'Резистивный' }).click();
    await fillNumber(page, 'Q треб., Вт', '1000');
    await fillNumber(page, 'Длина, м', '50');
    await fillNumber(page, 'T продукта, °C', '60');
    await clickActiveButton(page, 'Подобрать кабель');
    await expectActiveText(page, 'Результат подбора кабеля');

    await page.getByRole('tab', { name: 'Укладка на резервуар' }).click();
    await fillNumber(page, 'Диаметр, мм', '2000');
    await fillNumber(page, 'Высота обогрева, м', '2');
    await fillNumber(page, 'Шаг укладки, м', '0.2');
    await clickActiveButton(page, 'Рассчитать');
    await expectActiveText(page, 'Результат расчёта укладки');
  });
});
