import { Button, Card, Steps, Typography, Tag, Divider, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  UserOutlined,
  SettingOutlined,
  DatabaseOutlined,
  ArrowLeftOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

export default function AdminHelpPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '40px 24px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginBottom: 24 }}>
          Назад
        </Button>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Title level={2} style={{ margin: 0, color: '#1a5276' }}>
              Инструкция для администратора
            </Title>
            <Tag color="red">Системный доступ</Tag>
          </div>
          <Paragraph type="secondary">
            Администратор управляет системой: создаёт учётные записи сотрудников, настраивает расчётные коэффициенты и ведёт базу данных оборудования.
            Администратор <Text strong>не выполняет расчёты</Text> — это роль управления, не инженерная.
          </Paragraph>

          <Divider />

          <Alert
            type="warning"
            icon={<WarningOutlined />}
            showIcon
            message="Важно"
            description="Изменение коэффициентов и базы данных влияет на результаты расчётов всех пользователей. Будьте внимательны при редактировании."
            style={{ marginBottom: 24 }}
          />

          <Title level={4}>Вход в систему</Title>
          <Paragraph>
            Учётная запись администратора создаётся автоматически при первом запуске системы на основе переменных окружения.
            Войдите через форму сотрудника на главной странице, используя указанные при настройке email и пароль.
            После входа вы попадёте сразу в панель администрирования.
          </Paragraph>

          <Divider />

          <Title level={4}>Разделы панели администрирования</Title>
          <Steps
            direction="vertical"
            size="small"
            style={{ marginTop: 16 }}
            items={[
              {
                title: 'Пользователи',
                description: (
                  <div>
                    <Paragraph style={{ margin: 0 }}>Управление учётными записями сотрудников:</Paragraph>
                    <ul style={{ margin: '8px 0 0 0' }}>
                      <li><Text strong>Создание</Text> — укажите имя, email и пароль нового сотрудника</li>
                      <li><Text strong>Деактивация</Text> — заблокируйте доступ без удаления данных (все проекты сохраняются)</li>
                      <li><Text strong>Просмотр</Text> — список всех сотрудников с датой создания и статусом</li>
                    </ul>
                    <Paragraph type="secondary" style={{ margin: '8px 0 0 0' }}>
                      Пароль создаётся администратором и передаётся сотруднику. Изменить пароль может только администратор.
                    </Paragraph>
                  </div>
                ),
                icon: <UserOutlined />,
                status: 'process',
              },
              {
                title: 'Коэффициенты',
                description: (
                  <div>
                    <Paragraph style={{ margin: 0 }}>Настройка корректирующих коэффициентов для расчётов:</Paragraph>
                    <ul style={{ margin: '8px 0 0 0' }}>
                      <li><Text strong>safety_factor</Text> — множитель K для Q (тепловые потери), по умолчанию <Text code>1.1</Text>. Применяется и к трубопроводам, и к резервуарам. Также используется в электрорасчёте как коэффициент запаса по мощности кабеля</li>
                      <li><Text strong>wind_factor</Text> — множитель α_внеш для труб, по умолчанию <Text code>1.0</Text> (устаревший, в текущей модели не используется — скорость ветра задаётся для объекта напрямую)</li>
                    </ul>
                    <Paragraph type="secondary" style={{ margin: '8px 0 0 0' }}>
                      Все формулы и их вывод см. в файле <Text code>formules.md</Text> репозитория.
                    </Paragraph>
                    <Paragraph type="warning" style={{ margin: '8px 0 0 0' }}>
                      Изменения вступают в силу немедленно и влияют на все последующие расчёты. Ранее сохранённые результаты не пересчитываются автоматически — для пересчёта откройте объекты и измените любой параметр, либо нажмите «Электрорасчёт» для повторного подбора кабеля.
                    </Paragraph>
                  </div>
                ),
                icon: <SettingOutlined />,
                status: 'process',
              },
              {
                title: 'Встроенные справочники',
                description: (
                  <div>
                    <Paragraph style={{ margin: 0 }}>В текущем контуре встроены 4 справочника (JSON в образе backend):</Paragraph>
                    <ul style={{ margin: '8px 0 0 0' }}>
                      <li><Text strong>climate.json</Text> — 539 населённых пунктов РФ с температурами t_0.98 / t_0.92 / t_abs_min и скоростями ветра</li>
                      <li><Text strong>insulation.json</Text> — 6 материалов изоляции (мин. вата, пеностекло, ППУ, пенополистирол, аэрогель, силикат кальция) с λ и диапазоном температур</li>
                      <li><Text strong>cables_tlt.json</Text> — 10 марок ТЛТ (10…100 Вт/м) с T_max, T_min, напряжением</li>
                      <li><Text strong>accessories.json</Text> — базовый набор аксессуаров для спецификации</li>
                    </ul>
                    <Paragraph type="warning" style={{ margin: '8px 0 0 0' }}>
                      По ТЗ (§5, Вариант А) справочники и формулы находятся внутри Docker-образа и не редактируются через UI. Обновление — через пересборку образа. Интерфейс «Базы данных» в админке показывает содержимое справочников в режиме просмотра.
                    </Paragraph>
                  </div>
                ),
                icon: <DatabaseOutlined />,
                status: 'process',
              },
            ]}
          />

          <Divider />

          <Title level={4}>Первичная настройка системы</Title>
          <Steps
            direction="vertical"
            size="small"
            items={[
              {
                title: 'Войдите под учётной записью администратора',
                description: 'Email и пароль заданы через переменные окружения FIRST_ADMIN_EMAIL и FIRST_ADMIN_PASSWORD при запуске системы.',
                status: 'process',
              },
              {
                title: 'Проверьте коэффициенты',
                description: 'Откройте раздел «Коэффициенты» и убедитесь, что значения соответствуют нормативной документации вашего региона.',
                status: 'process',
              },
              {
                title: 'Просмотрите встроенные справочники',
                description: 'В разделе «База данных» убедитесь, что справочники (климат, материалы, кабели, аксессуары) загружены. В текущем контуре справочники встроены в образ и не редактируются через UI.',
                status: 'process',
              },
              {
                title: 'Создайте учётные записи сотрудников',
                description: 'В разделе «Пользователи» создайте аккаунты для инженерного персонала. Передайте каждому его email и пароль. Сотрудники получат доступ к полному функционалу, включая экспорт отчётов.',
                status: 'process',
              },
            ]}
          />

          <Divider />

          <Title level={4}>Безопасность и ограничения</Title>
          <Paragraph>
            <ul>
              <li>В админском разделе нет рабочего режима расчётов; доступ к проектам используется только для сопровождения</li>
              <li>Смена пароля администратора выполняется только через настройки сервера (переменные окружения)</li>
              <li>Деактивированный сотрудник не может войти в систему, но его данные сохраняются</li>
              <li>Удаление записей из базы данных оборудования не затрагивает уже сохранённые спецификации</li>
            </ul>
          </Paragraph>

          <Divider />

          <Card type="inner" style={{ background: '#fff2e8' }}>
            <Paragraph style={{ margin: 0 }}>
              <Text strong>Техническая поддержка:</Text> При возникновении системных проблем (ошибки запуска, сброс базы данных, обновление системы) обратитесь к системному администратору или разработчику. Доступ к логам: <Text code>make logs</Text> в директории проекта.
            </Paragraph>
          </Card>
        </Card>
      </div>
    </div>
  );
}
