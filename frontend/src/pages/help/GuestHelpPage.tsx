import { Button, Card, Steps, Typography, Tag, Divider, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CalculatorOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  ArrowLeftOutlined,
  UploadOutlined,
  DragOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FireOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

export default function GuestHelpPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '40px 24px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')} style={{ marginBottom: 24 }}>
          На главную
        </Button>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Title level={2} style={{ margin: 0, color: '#1a5276' }}>
              Инструкция для пользователя
            </Title>
            <Tag color="blue">Гостевой режим</Tag>
          </div>
          <Paragraph type="secondary">
            Работа без регистрации. Все расчёты сохраняются в рамках одной сессии (до 30 дней).
          </Paragraph>

          <Divider />

          <Title level={4}>Что вы можете делать</Title>
          <Paragraph>
            <ul>
              <li>Рассчитывать тепловые потери для <Text strong>трубопроводов</Text> и <Text strong>ёмкостей</Text></li>
              <li>Создавать проекты и добавлять объекты обогрева (до 50 на проект)</li>
              <li><Text strong>Импортировать объекты</Text> из Excel или CSV — до 100 строк за раз</li>
              <li>Менять порядок объектов <Text strong>перетаскиванием</Text> мышью</li>
              <li>Получать автоматический подбор греющего кабеля ТЛТ</li>
              <li>Просматривать спецификацию оборудования</li>
              <li>Получать предпросмотр отчёта на экране</li>
            </ul>
          </Paragraph>
          <Alert
            type="info"
            showIcon
            message="Ограничения гостевого режима"
            description="Экспорт отчётов в PDF / Word / Excel и проводник проектов (список чужих) доступны только сотрудникам. Чтобы получить расширенные возможности — обратитесь к администратору."
            style={{ marginBottom: 16 }}
          />

          <Divider />

          <Title level={4}>4 шага работы</Title>
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>
            Весь процесс разбит на четыре последовательных шага. Индикатор прогресса виден сверху каждой страницы рабочего стола.
          </Paragraph>
          <Steps
            direction="vertical"
            size="small"
            style={{ marginTop: 16 }}
            items={[
              {
                title: 'Шаг 1. Теплопотери',
                description: 'Добавьте объекты (трубы или резервуары) вручную через мастер или импортируйте из Excel/CSV. Теплопотери считаются автоматически при сохранении. Строки с ошибкой параметров подсвечиваются красным.',
                icon: <FireOutlined />,
                status: 'process',
              },
              {
                title: 'Шаг 2. Электрорасчёт',
                description: 'Нажмите кнопку «Электрорасчёт →» — система автоматически подберёт марку кабеля ТЛТ для каждого объекта. Если подобрать кабель невозможно (например, требуемая мощность выше 100 Вт/м), причина будет показана в красной карточке.',
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
            style={{ marginTop: 16 }}
            items={[
              {
                title: 'Нажмите «Пользователь» на главной странице',
                description: 'Система автоматически создаст гостевую сессию — регистрация не нужна.',
                icon: <ArrowLeftOutlined />,
                status: 'process',
              },
              {
                title: 'Создайте проект',
                description: 'В верхней полосе нажмите «Новый проект», введите название. Проект привязан к вашей сессии.',
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
            <UploadOutlined style={{ marginRight: 6, color: '#1890ff' }} />
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
          <Alert
            type="info"
            showIcon
            message="Материалы изоляции"
            description="Принимаются как русские названия (Минеральная вата, Пеностекло, ППУ, Пенополистирол, Аэрогель, Силикат кальция), так и английские коды (mineral_wool, foam_glass и т.д.)."
            style={{ marginBottom: 16 }}
          />

          <Title level={4}>
            <DragOutlined style={{ marginRight: 6, color: '#1890ff' }} />
            Изменение порядка строк
          </Title>
          <Paragraph>
            В таблицах труб и резервуаров зажмите строку мышью и перетащите на новое место — порядок сохранится автоматически. Кнопки «Редактировать» и «Удалить» в строке продолжают работать, перетаскивание активируется только после движения мышью.
          </Paragraph>

          <Divider />

          <Title level={4}>Параметры трубопровода</Title>
          <Paragraph>
            <ul>
              <li><Text strong>Наружный диаметр</Text> — в миллиметрах (например, 57, 89, 108). В мастере показывается подсказка эквивалентного DN.</li>
              <li><Text strong>Длина</Text> — в метрах (от 0,5 до 10 000)</li>
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
          <Paragraph type="secondary" style={{ marginBottom: 10 }}>
            Важно понимать: два этапа проверяют разные вещи.
          </Paragraph>
          <Paragraph>
            <ul>
              <li>
                <Text strong>Этап 1 — Теплопотери.</Text> Проверяется физическая валидность объекта: размеры, температурный перепад, корректность изоляции. Если строка в таблице красная —
                параметры не подошли для расчёта по уравнению Фурье. <em>Это ошибка данных</em> — исправьте параметры через «Редактировать».
              </li>
              <li>
                <Text strong>Этап 2 — Электрорасчёт.</Text> Объект <strong>валидный физически</strong>, но не укладывается во встроенную линейку ТЛТ (10…100 Вт/м, T продукта до 150°C, T среды от −60°C).
                Это <em>не ошибка данных объекта</em>: для очень мощных / очень горячих / очень холодных случаев нужны другие типы кабелей (резистивные, MI, скин-системы), для которых требуются отдельные формулы и каталоги.
                Варианты действий: снизить теплопотери (толще изоляция, разбить длинную трубу на участки) или выбрать кабель вручную через селектор в карточке.
              </li>
            </ul>
          </Paragraph>

          <Divider />

          <Card type="inner" style={{ background: '#e8f4fd' }}>
            <Paragraph style={{ margin: 0 }}>
              <Text strong>Нужно больше возможностей?</Text> Обратитесь к администратору для получения учётной записи сотрудника — это откроет доступ к экспорту отчётов в PDF/Word/Excel и проводнику проектов.
            </Paragraph>
          </Card>
        </Card>
      </div>
    </div>
  );
}
