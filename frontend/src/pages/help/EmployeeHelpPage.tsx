import { Steps, Typography, Divider, Table } from 'antd';
import { TltBadge, TltButton, TltCard } from '@/components/ui-kit';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import {
  CalculatorOutlined,
  FolderOpenOutlined,
  DownloadOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import './help-page.css';

const { Title, Paragraph, Text } = Typography;

export default function EmployeeHelpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((state) => state.role);

  const handleBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
      return;
    }
    navigate(role === 'employee' ? '/projects' : '/login', { replace: true });
  };

  const accessColumns = [
    { title: 'Функция', dataIndex: 'feature', key: 'feature' },
    { title: 'Доступ', dataIndex: 'access', key: 'access', render: (v: boolean) => v ? <TltBadge tone="success">Да</TltBadge> : <TltBadge tone="danger">Нет</TltBadge> },
  ];
  const accessData = [
    { key: 1, feature: 'Расчёт теплопотерь (трубы, ёмкости)', access: true },
    { key: 2, feature: 'Электрорасчёт ТЛТ, ТТН/ТТВ/ТТХ, ТТ Р1 и ТТ Р3', access: true },
    { key: 3, feature: 'Импорт объектов из Excel / CSV', access: true },
    { key: 4, feature: 'Поиск, фильтры и сортировка таблицы объектов', access: true },
    { key: 5, feature: 'Создание и управление своими проектами', access: true },
    { key: 6, feature: 'Гостевые проекты подрядчиков без передачи', access: false },
    { key: 7, feature: 'Экспорт отчёта в PDF / Word / Excel', access: true },
    { key: 8, feature: 'Экспорт объектов в Excel', access: true },
    { key: 9, feature: 'Управление пользователями', access: false },
    { key: 10, feature: 'Редактирование справочников и коэффициентов', access: false },
  ];

  return (
    <div className="help-page">
      <div className="help-page-inner help-page-inner--employee">
        <TltButton
          aria-label="Назад"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          className="help-page-back"
        >
          Назад
        </TltButton>

        <TltCard>
          <div className="help-page-header">
            <Title level={2} className="help-page-title">
              Инструкция для сотрудника
            </Title>
            <TltBadge tone="success">Полный доступ</TltBadge>
          </div>
          <Paragraph type="secondary">
            Вход по логину и паролю. В проводнике видны проекты сотрудников,
            гостевые проекты подрядчиков скрыты.
          </Paragraph>

          <Divider />

          <Title level={4}>Матрица доступа</Title>
          <Table
            columns={accessColumns}
            dataSource={accessData}
            pagination={false}
            size="small"
            className="help-page-table"
          />

          <Divider />

          <Title level={4}>Как начать работу</Title>
          <Steps
            direction="vertical"
            size="small"
            className="help-page-steps"
            items={[
              {
                title: 'Войдите в систему',
                description: 'На главной странице нажмите «Сотрудник», введите email и пароль. Если учётной записи нет — обратитесь к администратору.',
                icon: <ArrowLeftOutlined />,
                status: 'process',
              },
              {
                title: 'Создайте проект или откройте существующий',
                description: 'Кнопка «Открыть» в шапке открывает список проектов. Там можно создавать, искать и фильтровать проекты. Нажмите на проект, чтобы открыть его в рабочем пространстве.',
                icon: <FolderOpenOutlined />,
                status: 'process',
              },
              {
                title: 'Добавьте объекты обогрева',
                description: 'На странице «Расчёт теплопотерь» три способа: (1) кнопки «+Трубопровод» / «+Резервуар» открывают пошаговый мастер; (2) «Импорт (Excel/CSV)» — массовая загрузка из файла; (3) скачайте шаблон через «Шаблон .xlsx» или «.csv». Теплопотери считаются автоматически.',
                icon: <CalculatorOutlined />,
                status: 'process',
              },
              {
                title: 'Выполните электрорасчёт',
                description: 'Кнопка «Электрорасчёт →» в правом верхнем углу таблицы запустит пакетный автоподбор выбранного типа кабеля для всех валидных объектов. Если кабель не подобрался — в карточке объекта появится красный блок с причиной (превышен лимит мощности, температура вне диапазона и т.п.).',
                icon: <CalculatorOutlined />,
                status: 'process',
              },
              {
                title: 'Сформируйте спецификацию',
                description: 'В разделе «Спецификация» нажмите «Сформировать». Перечень: кабель по маркам + базовый набор аксессуаров (муфты, соединители, крепёж).',
                icon: <SearchOutlined />,
                status: 'process',
              },
              {
                title: 'Экспортируйте отчёт',
                description: 'В разделе «Отчёт» — HTML-предпросмотр + кнопки «PDF / Word / Excel». Отчёт содержит: сводку по проекту, таблицы трубопроводов и резервуаров, результаты электрорасчёта и спецификацию.',
                icon: <DownloadOutlined />,
                status: 'process',
              },
            ]}
          />

          <Divider />

          <Title level={4}>Работа с таблицами объектов</Title>
          <Paragraph>
            <ul>
              <li><Text strong>Редактирование:</Text> кнопка «Редактировать» (иконка карандаша) в строке открывает мастер в режиме правки — параметры меняются через форму, а не inline в ячейках</li>
              <li><Text strong>Удаление:</Text> кнопка-корзина + подтверждение. Связанные электрорасчёты удаляются каскадно</li>
              <li><Text strong>Поиск и сортировка:</Text> используйте фильтры, сортировку колонок и настройки видимости таблицы; порядок строк хранится как серверный `sort_order`</li>
              <li><Text strong>Красные строки</Text> — теплопотери не рассчитались. Откройте такой объект и исправьте параметры</li>
              <li><Text strong>Пересчёт:</Text> теплопотери автоматически обновляются при изменении параметров через мастер</li>
            </ul>
          </Paragraph>

          <Divider />

          <Title level={4}>Импорт объектов из Excel и CSV</Title>
          <Paragraph>
            Слева внизу на странице «Расчёт теплопотерь» — кнопка <Text strong>«Импорт (Excel/CSV)»</Text> и ссылки на скачивание шаблонов.
          </Paragraph>
          <ul>
            <li><Text strong>Excel (.xlsx):</Text> два листа — «Трубопроводы» и «Резервуары»</li>
            <li><Text strong>CSV:</Text> один файл с колонкой «Тип» (труба / резервуар). Разделитель определяется автоматически (<Text code>;</Text>, <Text code>,</Text> или табуляция), поддерживаются кодировки UTF-8 и CP1251</li>
            <li>Материалы и формы принимают как русские названия, так и англ. коды</li>
            <li>После импорта — модалка с числом созданных объектов и построчным отчётом об ошибках</li>
          </ul>
          <Paragraph>
            Для тестирования есть готовые файлы на 100 записей в <Text code>docs/samples/</Text>.
          </Paragraph>

          <Divider />

          <Title level={4}>Индикация статуса электрорасчёта</Title>
          <Paragraph>
            На странице «Электротехнический расчёт» каждый объект — отдельная карточка со статусом:
          </Paragraph>
          <ul>
            <li>✓ <Text className="help-page-status-ok">зелёная галочка</Text> — кабель подобран, показаны марка, длина, мощность, ток</li>
            <li>✗ <Text type="danger">красный тег «ошибка»</Text> — подбор не удался. Внутри карточки — Alert с текстом причины и подсказкой</li>
            <li><TltBadge>не применимо</TltBadge> — объект валиден по теплопотерям, но выбранная геометрия не поддержана методикой укладки кабеля</li>
            <li><TltBadge>не рассчитан</TltBadge> — расчёт ещё не запускался для этого объекта</li>
          </ul>
          <Paragraph>
            Баннер сверху страницы показывает число объектов с ошибками. В Sidebar галочка у «Электротехнический расчёт» появляется <Text strong>только когда все объекты рассчитались успешно</Text>.
          </Paragraph>

          <Paragraph type="secondary" className="help-page-section-lead--tight">
            <Text strong>Почему объект может пройти «Теплопотери», но упасть на «Электрорасчёте»?</Text>
          </Paragraph>
          <Paragraph type="secondary" className="help-page-body-sm">
            Два этапа проверяют разные вещи:
          </Paragraph>
          <ul>
            <li>
              <Text strong>Этап 1</Text> — физическая валидность объекта (размеры в диапазонах, T_продукта &gt; T_среды, известный материал изоляции). Если этап упал — данные объекта некорректны.
            </li>
            <li>
              <Text strong>Этап 2</Text> — применимость выбранного типа кабеля к рассчитанной теплопотере. Встроенные формулы есть для ТЛТ, ТТН/ТТВ/ТТХ, ТТ Р1 и ТТ Р3; новые типы систем подключаются вместе со своей формулой и каталогом.
            </li>
          </ul>
          <Paragraph type="secondary" className="help-page-body-sm">
            Что делать с ошибкой этапа 2: попробовать выбрать кабель вручную через селектор или снизить теплопотери (увеличить толщину изоляции, разбить длинную трубу на участки).
          </Paragraph>

          <Divider />

          <Title level={4}>Управление проектами</Title>
          <Paragraph>
            <ul>
              <li><Text strong>Список проектов</Text> — кнопка «Открыть» в шапке, доступны проекты сотрудников</li>
              <li><Text strong>Приватность гостевых проектов</Text> — проекты гостевых сессий подрядчиков не видны сотруднику без отдельного процесса передачи</li>
              <li><Text strong>Удаление</Text> — только своих проектов</li>
            </ul>
          </Paragraph>

          <Divider />

          <Title level={4}>Экспорт отчётов</Title>
          <Paragraph>
            В разделе «Отчёт» кнопки <Text strong>PDF / Word / Excel</Text> (только сотруднику):
          </Paragraph>
          <ul>
            <li><Text strong>PDF</Text> — готовый документ для передачи заказчику (WeasyPrint)</li>
            <li><Text strong>Word (.docx)</Text> — редактируемый шаблон</li>
            <li><Text strong>Excel (.xlsx)</Text> — таблицы и спецификация для сметчиков</li>
          </ul>
          <Paragraph>
            Содержимое: сводка по проекту, таблицы труб и резервуаров с результатами теплопотерь, электрорасчёт (марки кабелей, длины, суммарные мощность и ток), спецификация оборудования.
          </Paragraph>

          <Divider />

          <TltCard tone="soft" className="help-page-tip help-page-tip--employee">
            <Paragraph className="help-page-tip-text">
              <Text strong>Совет:</Text> для типовых проектов используйте импорт из шаблона Excel — скопируйте готовый файл и адаптируйте значения. Это быстрее, чем вводить десятки объектов через мастер.
            </Paragraph>
          </TltCard>
        </TltCard>
      </div>
    </div>
  );
}
