import { Steps, Typography, Divider } from 'antd';
import { TltAlert, TltBadge, TltButton, TltCard } from '@/components/ui-kit';
import { useNavigate } from 'react-router-dom';
import {
  CalculatorOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  ArrowLeftOutlined,
  UploadOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FireOutlined,
} from '@ant-design/icons';
import './help-page.css';

const { Title, Paragraph, Text } = Typography;

export default function GuestHelpPage() {
  const navigate = useNavigate();

  return (
    <div className="help-page">
      <div className="help-page-inner help-page-inner--guest">
        <TltButton icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} className="help-page-back">
          На главную
        </TltButton>

        <TltCard>
          <div className="help-page-header">
            <Title level={2} className="help-page-title">
              Инструкция для гостя
            </Title>
            <TltBadge tone="info">Гостевой режим</TltBadge>
          </div>
          <Paragraph type="secondary">
            Работа без регистрации: один временный проект хранится на сервере 3 дня
            после последней активности. Чтобы продолжить позже, скачайте файл проекта.
          </Paragraph>

          <Divider />

          <Title level={4}>Что вы можете делать</Title>
          <Paragraph>
            <ul>
              <li>Рассчитывать тепловые потери для <Text strong>трубопроводов</Text> и <Text strong>ёмкостей</Text></li>
              <li>Добавлять до <Text strong>500 объектов</Text> в автоматически созданный временный проект</li>
              <li>Создавать до 5 вариантов электрорасчёта</li>
              <li><Text strong>Импортировать объекты</Text> из Excel или CSV — до 100 строк за раз</li>
              <li>Работать с таблицей объектов: поиск, фильтры, сортировка, выбор строк и TSV-копирование</li>
              <li>Получать автоматический подбор греющего кабеля ТЛТ</li>
              <li>Просматривать спецификацию оборудования</li>
              <li>Получать предпросмотр отчёта на экране</li>
            </ul>
          </Paragraph>
          <TltAlert
            tone="info"
            title="Ограничения гостевого режима"
            className="help-page-alert--sm"
          >
            Экспорт отчётов в PDF / Word / Excel и проводник проектов сотрудников доступны только сотрудникам. Чтобы получить расширенные возможности — обратитесь к администратору.
          </TltAlert>

          <Divider />

          <Title level={4}>4 шага работы</Title>
          <Paragraph type="secondary" className="help-page-section-lead">
            Весь процесс разбит на четыре последовательных шага. Индикатор прогресса виден сверху каждой страницы рабочего стола.
          </Paragraph>
          <Steps
            direction="vertical"
            size="small"
            className="help-page-steps"
            items={[
              {
                title: 'Шаг 1. Теплопотери',
                description: 'Добавьте объекты (трубы или резервуары) вручную через мастер или импортируйте из Excel/CSV. Теплопотери считаются автоматически при сохранении. Строки с ошибкой параметров подсвечиваются красным.',
                icon: <FireOutlined />,
                status: 'process',
              },
              {
                title: 'Шаг 2. Электрорасчёт',
                description: 'Нажмите кнопку «Электрорасчёт →» — система автоматически подберёт марку выбранного расчётного типа кабеля для каждого объекта. Если подобрать кабель невозможно, причина будет показана в красной карточке.',
                icon: <ThunderboltOutlined />,
                status: 'process',
              },
              {
                title: 'Шаг 3. Спецификация',
                description: 'Нажмите «Сформировать спецификацию» — сформируется перечень материалов: кабель и базовый набор аксессуаров (муфты, крепёж, соединители).',
                icon: <UnorderedListOutlined />,
                status: 'process',
              },
              {
                title: 'Шаг 4. Отчёт',
                description: 'Сводный HTML-отчёт по проекту: объекты, теплопотери, электрорасчёт, спецификация. Можно распечатать через браузер (Ctrl+P).',
                icon: <FileTextOutlined />,
                status: 'process',
              },
            ]}
          />

          <Divider />

          <Title level={4}>Как начать</Title>
          <Steps
            direction="vertical"
            size="small"
            className="help-page-steps"
            items={[
              {
                title: 'Нажмите «Начать без регистрации» на главной странице',
                description: 'Система автоматически создаст гостевую сессию и один временный проект — регистрация не нужна.',
                icon: <ArrowLeftOutlined />,
                status: 'process',
              },
              {
                title: 'Работайте во временном проекте',
                description: 'Проект уже открыт и привязан к гостевой сессии. Отдельно создавать его не нужно.',
                icon: <FolderOpenOutlined />,
                status: 'process',
              },
              {
                title: 'Добавьте объекты',
                description: 'Два способа: вручную через мастер (кнопки «+Трубопровод» / «+Резервуар» слева) или импорт файла Excel / CSV. В мастере три шага: геометрия → изоляция+температуры → подтверждение.',
                icon: <CalculatorOutlined />,
                status: 'process',
              },
              {
                title: 'Запустите электрорасчёт и сформируйте спецификацию',
                description: 'Переходы между шагами — через верхнюю кнопку «Электрорасчёт →» или меню слева.',
                icon: <ThunderboltOutlined />,
                status: 'process',
              },
            ]}
          />

          <Divider />

          <Title level={4}>
            <FolderOpenOutlined className="help-page-icon-inline" />
            Файл проекта: скачать и продолжить позже
          </Title>
          <Paragraph>
            Кнопки <Text strong>«Скачать»</Text> и <Text strong>«Загрузить»</Text> в
            верхнем меню работают со всем проектом в формате <Text code>.tlt.csv</Text>:
            объектами, вариантами электрорасчёта, спецификацией и настройками. Это не
            то же самое, что импорт отдельных объектов из Excel / CSV ниже.
          </Paragraph>
          <TltAlert
            tone="warning"
            title="Скачайте файл до окончания гостевой сессии"
            className="help-page-alert--sm"
          >
            Через 3 дня без активности временный проект удаляется. Загруженный файл
            позволяет восстановить работу в новой гостевой сессии.
          </TltAlert>

          <Divider />

          <Title level={4}>
            <UploadOutlined className="help-page-icon-inline" />
            Импорт объектов из Excel / CSV
          </Title>
          <Paragraph>
            На странице «Расчёт теплопотерь» слева внизу есть кнопки:
          </Paragraph>
          <ul>
            <li><Text strong>Импорт (Excel/CSV)</Text> — выбрать файл <Text code>.xlsx</Text> или <Text code>.csv</Text></li>
            <li><Text strong>Шаблон .xlsx</Text> — скачать образец Excel с листами «Трубопроводы» и «Резервуары»</li>
            <li><Text strong>Шаблон .csv</Text> — скачать образец CSV (один файл с колонкой «Тип»)</li>
          </ul>
          <Paragraph>
            После импорта появится модалка с результатом: сколько объектов создано, какие строки пропущены и почему. Импорт не прерывается на единичных ошибках — все валидные строки будут добавлены.
          </Paragraph>
          <TltAlert
            tone="info"
            title="Материалы изоляции"
            className="help-page-alert--sm"
          >
            Принимаются как русские названия (Минеральная вата, Пеностекло, ППУ, Пенополистирол, Аэрогель, Силикат кальция), так и английские коды (mineral_wool, foam_glass и т.д.).
          </TltAlert>

          <Title level={4}>
            <UnorderedListOutlined className="help-page-icon-inline" />
            Работа с таблицей объектов
          </Title>
          <Paragraph>
            Используйте вкладки типов, поиск, фильтры и сортировку колонок, чтобы быстро найти нужные строки. Отмеченные строки можно копировать в TSV через Ctrl+C; порядок строк задаётся серверным `sort_order`.
          </Paragraph>

          <Divider />

          <Title level={4}>Параметры трубопровода</Title>
          <Paragraph>
            <ul>
              <li><Text strong>Наружный диаметр</Text> — в миллиметрах (например, 57, 89, 108). В мастере показывается подсказка эквивалентного DN.</li>
              <li><Text strong>Длина</Text> — в метрах (от 0,5 до 200 000)</li>
              <li><Text strong>Температура продукта</Text> — поддерживаемая температура внутри трубы, °C</li>
              <li><Text strong>Температура среды</Text> — расчётная температура снаружи, °C</li>
              <li><Text strong>Изоляция</Text> — материал из 6 встроенных (мин. вата, пеностекло, ППУ и т.д.) и толщина в мм</li>
            </ul>
          </Paragraph>

          <Title level={4}>Параметры ёмкости</Title>
          <Paragraph>
            <ul>
              <li><Text strong>Форма</Text> — цилиндр, параллелепипед, шар</li>
              <li><Text strong>Габариты</Text> в мм: для цилиндра — диаметр и высота; для параллелепипеда — длина, ширина, высота; для шара — диаметр</li>
              <li><Text strong>Температуры и изоляция</Text> — аналогично трубопроводу</li>
            </ul>
          </Paragraph>

          <Divider />

          <Title level={4}>Если расчёт не удался</Title>
          <Paragraph type="secondary" className="help-page-section-lead--md">
            Важно понимать: два этапа проверяют разные вещи.
          </Paragraph>
          <Paragraph>
            <ul>
              <li>
                <Text strong>Этап 1 — Теплопотери.</Text> Проверяется физическая валидность объекта: размеры, температурный перепад, корректность изоляции. Если строка в таблице красная —
                параметры не подошли для расчёта по уравнению Фурье. <em>Это ошибка данных</em> — исправьте параметры через «Редактировать».
              </li>
              <li>
                <Text strong>Этап 2 — Электрорасчёт.</Text> Объект <strong>валидный физически</strong>, но не укладывается в выбранный тип кабеля. Встроенные формулы есть для ТЛТ, ТТН/ТТВ/ТТХ, ТТ Р1 и ТТ Р3; для MI и скин-системы нужны отдельные формулы и каталоги.
                Варианты действий: снизить теплопотери (толще изоляция, разбить длинную трубу на участки) или выбрать кабель вручную через селектор в карточке.
              </li>
            </ul>
          </Paragraph>

          <Divider />

          <TltCard tone="soft" className="help-page-tip help-page-tip--guest">
            <Paragraph className="help-page-tip-text">
              <Text strong>Нужно больше возможностей?</Text> Обратитесь к администратору для получения учётной записи сотрудника — это откроет доступ к экспорту отчётов в PDF/Word/Excel и проводнику проектов.
            </Paragraph>
          </TltCard>
        </TltCard>
      </div>
    </div>
  );
}
