# 2. Frontend `CLAUDE.md`

````markdown
# CLAUDE.md — Frontend (React)

## Стек

| Технология            | Назначение                               |
|-----------------------|------------------------------------------|
| React 18+             | UI-фреймворк                             |
| TypeScript 5+         | Типизация                                |
| Vite                  | Сборка и dev-server                      |
| React Router v6       | Маршрутизация                            |
| Zustand               | Глобальный стейт                         |
| TanStack Query v5     | Серверный стейт, кэширование API         |
| Axios                 | HTTP-клиент                              |
| Ant Design (antd)     | UI-компоненты (таблицы, формы, лейауты)  |
| @dnd-kit/core + sortable | Drag-and-drop колонок в настройках таблиц |
| dompurify             | Санитизация HTML в превью отчёта         |
| xlsx (SheetJS)        | Экспорт Excel (клиентский)               |
| React Hook Form       | Формы мастера                            |
| Zod                   | Валидация                                |
| Vitest                | Unit- и integration-тесты                |
| React Testing Library | Тестирование компонентов                 |
| Playwright            | E2E-тесты                                |

## Структура `frontend/src/`

```
src/
├── main.tsx
├── App.tsx
├── routes/
│   ├── index.tsx                 # Route-дерево, все пути через ROUTES
│   ├── ProtectedRoute.tsx        # Редирект при неподходящей роли
│   └── routes.ts                 # ROUTES — единственный источник правды по путям
├── pages/
│   ├── HomePage.tsx              # Выбор роли (гость / сотрудник)
│   ├── LoginPage.tsx             # Авторизация сотрудника
│   ├── WorkspacePage.tsx         # Рабочий стол (перенаправляет на шаг 1)
│   ├── HeatCalcPage.tsx          # Шаг 1: тепловые потери + SC-03 inline-form
│   ├── ElecCalcPage.tsx          # Шаг 2: электрорасчёт, CO1..CO4, выбор кабеля
│   ├── SpecificationPage.tsx     # Шаг 3: спецификация
│   ├── ReportPage.tsx            # Шаг 4: отчёт
│   ├── ProjectsPage.tsx          # Проводник проектов (Сотрудник)
│   ├── help/                     # Руководства по ролям
│   │   ├── GuestHelpPage.tsx
│   │   ├── EmployeeHelpPage.tsx
│   │   └── AdminHelpPage.tsx
│   └── admin/
│       ├── AdminLayout.tsx
│       ├── UsersPage.tsx
│       ├── CoefficientsPage.tsx
│       └── DatabasePage.tsx
├── components/
│   ├── WorkflowSteps.tsx         # Прогресс 1→2→3→4 (antd Steps)
│   ├── ImportExcelButton.tsx     # Импорт xlsx/csv + скачивание шаблона
│   ├── common/                   # Переиспользуемые элементы
│   │   ├── EmptyProjectState.tsx # Карточка «Проект не выбран» (4 страницы)
│   │   ├── TabBadge.tsx          # Заголовок таба с счётчиком
│   │   ├── RoleGuard.tsx
│   │   ├── ValidationHighlight.tsx
│   │   └── LoadingSpinner.tsx
│   ├── layout/
│   │   ├── MainLayout.tsx
│   │   ├── Sidebar.tsx           # ✓-чекмарки для завершённых шагов
│   │   └── ProjectMenu.tsx
│   ├── wizard/
│   │   ├── ObjectWizard.tsx      # Встроенная плоская форма SC-03 с 3 секциями
│   │   │                         # и матрицей видимости зависимых полей
│   │   └── steps/
│   │       ├── PipeGeometryStep.tsx
│   │       ├── TankGeometryStep.tsx
│   │       ├── ThermalStep.tsx
│   │       └── ConfirmStep.tsx   # авто-имя через Form.useWatch
│   ├── heatcalc/
│   │   └── ColumnSettingsModal.tsx # настройки колонок/вида таблицы SC-03
│   ├── electrical/               # Компоненты страницы электрорасчёта
│   │   ├── ObjectCalcCard.tsx    # Карточка объекта (статус, параметры, ручной выбор)
│   │   ├── CableSelector.tsx     # Дропдаун ручного выбора марки кабеля
│   │   └── ElectricalSummary.tsx # Зелёная карточка суммарных итогов
│   ├── specification/
│   │   ├── SpecTable.tsx
│   │   └── SpecBuilder.tsx
│   └── reports/
│       ├── ReportPreview.tsx     # DOMPurify санитизация HTML
│       └── ReportWizard.tsx
├── hooks/
│   ├── useAuth.ts                # login as guest/employee + сброс currentProject
│   ├── useProject.ts             # React Query wrapper для списка проектов
│   ├── useAutoSave.ts            # debounce-сейвер для форм
│   ├── useCalcTable.ts           # хелперы мутаций для таблиц расчёта
│   ├── useElectricalStats.ts     # Агрегаты страницы электрорасчёта (чистая функция)
│   └── useHeatCalcMutations.ts   # мутации HeatCalcPage: add/edit/remove/batchCalc
├── api/
│   ├── client.ts                 # Axios + interceptors 401/403
│   ├── auth.ts
│   ├── projects.ts
│   ├── calculations.ts
│   ├── specifications.ts
│   ├── reports.ts
│   ├── references.ts
│   └── admin.ts
├── store/
│   ├── authStore.ts              # role, user, tokens, sessionId
│   └── projectStore.ts           # currentProject (persist в localStorage)
├── types/
│   ├── auth.ts
│   ├── project.ts
│   ├── calculation.ts
│   ├── specification.ts
│   ├── reference.ts
│   └── admin.ts
├── utils/
│   ├── excel.ts
│   ├── clipboard.ts
│   ├── validators.ts
│   ├── formatters.ts
│   ├── objectWizardUtils.ts      # мм↔м конвертация + generatePipeName/TankName
│   └── calcStatus.ts             # isElectricalCalcSuccess / electricalCalcError
├── constants/
│   ├── roles.ts
│   ├── objectTypes.ts            # ObjectType + OBJECT_TYPE_LABELS
│   ├── materials.ts              # MATERIAL_LABELS + SHAPE_LABELS
│   └── units.ts
└── __tests__/
    ├── setup.ts                  # vitest + jest-dom + matchMedia полифилл
    ├── unit/
    │   ├── utils/                # validators, formatters, excel — pure-function
    │   ├── store/                # authStore, projectStore
    │   ├── hooks/                # useElectricalStats
    │   ├── components/           # RoleGuard, SpecTable, ReportPreview,
    │   │                         # ValidationHighlight, TabBadge, EmptyProjectState
    │   └── pages/                # HeatCalcPage (render + mutations)
    └── integration/
        └── pages/                # LoginPage, HomePage
```

## Маршрутизация

| Путь                         | Страница            | Доступ           |
|------------------------------|---------------------|------------------|
| `/`                          | HomePage            | Все              |
| `/login`                     | LoginPage           | Все              |
| `/workspace`                 | WorkspacePage       | Guest, Employee  |
| `/workspace/heat-calc`       | HeatCalcPage        | Guest, Employee  |
| `/workspace/elec-calc`       | ElecCalcPage        | Guest, Employee  |
| `/workspace/specification`   | SpecificationPage   | Guest, Employee  |
| `/workspace/report`          | ReportPage          | Guest, Employee  |
| `/projects`                  | ProjectsPage        | Employee         |
| `/admin`                     | AdminLayout         | Admin            |
| `/admin/users`               | UsersPage           | Admin            |
| `/admin/coefficients`        | CoefficientsPage    | Admin            |
| `/admin/database`            | DatabasePage        | Admin            |

## Ключевые принципы

### 1. Расчёты — только на backend
Фронтенд никогда не выполняет расчёты. При изменении ячейки — запрос к API, получение результата, обновление таблицы. Debounce 300–500 мс при быстром вводе.

### 2. Автопересчёт
При изменении ЛЮБОГО параметра объекта — автоматический запрос пересчёта. TanStack Query + `invalidateQueries`.

### 3. Валидация
- Первый уровень: клиентская (Zod) — типы, обязательные поля, диапазоны
- Второй уровень: серверная — бизнес-правила
- Визуализация: красная рамка + tooltip с текстом ошибки

### 4. Таблицы
- SC-03 использует inline antd `Table` в `HeatCalcPage.tsx`: один компонент
  таблицы с режимами «Все / Трубопровод / Резервуар».
- Колонки формируются через registry и настройки видимости/ширины/порядка;
  drag-and-drop через `@dnd-kit/*` применяется в `ColumnSettingsModal`, не для
  строк объектов.
- Legacy `PipeTable` / `TankTable` удалены. Не восстанавливать их как источник
  правды: они не покрывали текущие фильтры, серверную пагинацию, inline edit и
  настройки таблицы.
- Row drag-and-drop в активном UI сейчас не подключён; backend endpoint
  `PUT /objects/reorder` остаётся серверным контрактом и валидирует полный
  список ID проекта.
- **Строка с ошибкой валидации** (`is_valid=false`): класс `row-invalid` + легенда
  под таблицей («Красные строки — не рассчитано»)

### 5. Встроенная форма объекта (ObjectWizard / SC-03)
- Форма встроена в верхнюю часть `HeatCalcPage`, не открывается модальным окном.
- 3 секции: геометрия с электропараметрами, теплоизоляция, температура/среда.
- Зависимые поля управляются матрицей SRS: размещение, климат, режим λ трубы,
  1/2/3 слоя изоляции, ручная λ для `other`.
- Служебные поля источников климата используют `hidden/noStyle` и не должны
  отображаться как пустые инпуты.
- Автоматическая конвертация мм↔м (`objectWizardUtils.ts`).
- Auto-имя: `generatePipeName` / `generateTankName` — редактируемое поле.

### 6. Работа с Excel / CSV
- **Импорт** (все роли): `ImportExcelButton` в левой панели HeatCalcPage
  - Файл отправляется как multipart — backend парсит (xlsx или csv)
  - Модалка с результатом: `created` + список построчных ошибок
  - Кнопки «Шаблон .xlsx» / «Шаблон .csv» — скачивают образцы с примерами
- **Экспорт объектов в Excel** (только Сотрудник): UI-кнопка `ExportObjectsButton`
  доступна на `HeatCalcPage`.

### 7. Отчёты
- **Предпросмотр** (все роли): `ReportPreview` с `DOMPurify.sanitize` и
  сохранением `<style>` (scoped `.tlt-report`)
- **Экспорт** (только Сотрудник): PDF / Word / Excel — файл генерируется backend,
  фронт скачивает blob
- **Мастер состава отчёта** доступен сотруднику и применяется к последующим экспортам.
- Для Пользователя кнопки экспорта скрыты / disabled

### 8. Статус электрорасчёта (важно)
- ✓ (зелёная галочка) выставляется **только** если `results.selected_cable` есть
  и `results.error` отсутствует.
- Failed-расчёты приходят с `results.error` и `cable_mark=null` — показываются
  как красный тег «ошибка» + Alert с текстом причины.
- Централизованные хелперы: `utils/calcStatus.ts` — `isElectricalCalcSuccess`,
  `electricalCalcError`. Используются в ElecCalcPage, Sidebar, WorkspacePage.
- Расчёты разделены по `variant_number`; UI поддерживает CO1..CO4.

### 9. Язык интерфейса
Только русский. i18n не требуется.

## Интерфейс (по эскизам из Приложения 4 ТЗ)

- **Верхняя полоса**: Меню управления проектами (создать, открыть, сохранить)
- **Левая панель**: Вкладки модулей (Расчёт теплопотерь | Электрорасчёт | Спецификации)
- **Основная область**:
  - Теплорасчёт: сверху SC-03 inline-form, ниже таблица исходных данных/результатов
  - Электрорасчёт: CO1..CO4, база расчёта, тип кабеля, batch/manual расчёт
  - Спецификации: таблица спецификации, группировка/сортировка, расширенная БД
- Тема: тёмно-бирюзовые тона (#1a5276 / #2e86c1)
- Оптимизировано под десктоп (≥1280px). Мобильная версия не требуется.

## Guest-сессия

1. Выбор «Пользователь» → `POST /api/v1/auth/guest`
2. Backend создаёт сессию, возвращает `session_id`
3. Сохраняется в `localStorage`
4. Все запросы содержат `X-Session-Id: {session_id}`
5. Проекты привязаны к `session_id`

## API-клиент

```typescript
// api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const sessionId = localStorage.getItem('session_id');
  // Access/refresh JWT живут в HttpOnly cookie, а access token держится только в памяти.
  if (sessionId) {
    config.headers['X-Session-Id'] = sessionId;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401) {
      // refresh token или redirect на /login
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

Переменные окружения

VITE_API_BASE_URL=http://localhost:8000/api/v1

TDD и тестирование

Методология

Каждый компонент, хук, утилита, страница разрабатывается по циклу Red → Green → Refactor:

Написать тест, описывающий ожидаемое поведение

Убедиться, что тест падает (Red)

Написать минимальный код для прохождения (Green)

Отрефакторить (Refactor)

Уровни тестов

Unit-тесты (src/__tests__/unit/)

Утилиты: validators.ts, formatters.ts, excel.ts — чистые функции, все ветви

Store: каждый Zustand-стор тестируется изолированно (actions, selectors)

Компоненты: рендер в изоляции с мок-пропсами, проверка:

Корректный рендер при разных props

Обработка событий (клик, ввод, Enter)

Условный рендер по ролям (RoleGuard)

Подсветка валидации (ValidationHighlight)

Хуки: чистая агрегация (useElectricalStats) тестируется через renderHook

```typescript
// Пример: __tests__/unit/hooks/useElectricalStats.test.ts
import { renderHook } from '@testing-library/react';
import { useElectricalStats } from '@/hooks/useElectricalStats';

describe('useElectricalStats', () => {
  it('суммирует длину, мощность, ток по успешным расчётам', () => {
    const { result } = renderHook(() => useElectricalStats(objects, calcs));
    expect(result.current.totalCableLength).toBe(30);
    expect(result.current.allCalced).toBe(true);
  });
});
```

**Текущее покрытие:** см. `README.md` AUTO:test-counts

Integration-тесты (src/__tests__/integration/)

Страницы: рендер страницы с замоканным API (MSW или vi.mock), проверка:

Загрузка данных и отображение

Отправка форм

Навигация по страницам и зависимостям встроенной формы

Корректная работа фильтров и поиска (ProjectsPage)

Потоки: multi-step user flows

Гостевой поток: выбор роли → создание проекта → заполнение SC-03 → просмотр результата

Сотрудник: логин → проводник проектов → открытие → экспорт отчёта

```typescript
// Пример: __tests__/integration/pages/HeatCalcPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeatCalcPage } from '@/pages/HeatCalcPage';
// MSW handlers мокают API

describe('HeatCalcPage', () => {
  it('adds pipe via inline form and displays calculated result', async () => {
    render(<HeatCalcPage />, { wrapper: TestProviders });
    await userEvent.click(screen.getByText('Трубы'));
    // заполняем секции встроенной формы...
    await userEvent.click(screen.getByText('Сохранить изменения'));
    await waitFor(() => {
      expect(screen.getByTestId('pipe-table')).toHaveTextContent('150.3'); // Вт/м
    });
  });

  it('highlights empty required cell and blocks calculation', async () => {
    render(<HeatCalcPage />, { wrapper: TestProviders });
    // добавить объект с пустым обязательным полем
    await waitFor(() => {
      expect(screen.getByTestId('cell-diameter')).toHaveClass('cell-invalid');
    });
  });
});
```

Конфигурация тестов

```typescript
// vite.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/__tests__/'],
    },
  },
});
```

Команды

npm run test                  # Запуск всех тестов (watch mode)
npm run test:run              # Однократный запуск
npm run test:unit             # Только unit
npm run test:integration      # Только integration
npm run test:coverage         # С отчётом покрытия
npx tsc --noEmit              # Проверка типов
npm run lint                  # ESLint

Соглашения по коду

Компоненты: PascalCase (HeatCalcPage.tsx)

Хуки: camelCase + use (useProject.ts)

API-функции: camelCase (getProjects, createProject)

Типы: суффикс по смыслу (ProjectResponse, CreateProjectRequest)

Запрещён any — всегда явные типы

Только функциональные компоненты (FC), без классов

Props: interface XxxProps {}

Каждый файл с тестом зеркалит исходный файл по пути

````
