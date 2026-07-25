import { Steps, Typography, Divider } from 'antd';
import { TltAlert, TltBadge, TltButton, TltCard } from '@/components/ui-kit';
import { useNavigate } from 'react-router-dom';
import {
  UserOutlined,
  SettingOutlined,
  DatabaseOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import './help-page.css';

const { Title, Paragraph, Text } = Typography;

export default function AdminHelpPage() {
  const navigate = useNavigate();

  return (
    <div className="help-page">
      <div className="help-page-inner help-page-inner--admin">
        <TltButton icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} className="help-page-back">
          Назад
        </TltButton>

        <TltCard>
          <div className="help-page-header">
            <Title level={2} className="help-page-title">
              Инструкция для администратора
            </Title>
            <TltBadge tone="danger">Системный доступ</TltBadge>
          </div>
          <Paragraph type="secondary">
            Администратор управляет системой: создаёт учётные записи сотрудников, настраивает расчётные коэффициенты и ведёт базу данных оборудования.
            Администратор <Text strong>не выполняет расчёты</Text> — это роль управления, не инженерная.
          </Paragraph>

          <Divider />

          <TltAlert
            tone="warning"
            title="Важно"
            className="help-page-alert"
          >
            Изменение коэффициентов и базы данных влияет на результаты расчётов всех пользователей. Будьте внимательны при редактировании.
          </TltAlert>

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
            className="help-page-steps"
            items={[
              {
                title: 'Пользователи',
                description: (
                  <div>
                    <Paragraph className="help-page-step-p">Управление учётными записями сотрудников:</Paragraph>
                    <ul className="help-page-step-list">
                      <li><Text strong>Создание</Text> — укажите имя, email и пароль нового сотрудника</li>
                      <li><Text strong>Деактивация</Text> — заблокируйте доступ без удаления данных (все проекты сохраняются)</li>
                      <li><Text strong>Просмотр</Text> — список всех сотрудников с датой создания и статусом</li>
                    </ul>
                    <Paragraph type="secondary" className="help-page-step-note">
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
                    <Paragraph className="help-page-step-p">Настройка корректирующих коэффициентов для расчётов:</Paragraph>
                    <ul className="help-page-step-list">
                      <li><Text strong>safety_factor</Text> — множитель K для Q (тепловые потери), по умолчанию <Text code>1.1</Text>. Применяется и к трубопроводам, и к резервуарам. Также используется в электрорасчёте как коэффициент запаса по мощности кабеля</li>
                    </ul>
                    <Paragraph type="warning" className="help-page-step-note">
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
                    <Paragraph className="help-page-step-p">В текущем контуре встроены 4 справочника (JSON в образе backend):</Paragraph>
                    <ul className="help-page-step-list">
                      <li><Text strong>climate.json</Text> — 539 населённых пунктов РФ с температурами t_0.98 / t_0.92 / t_abs_min и скоростями ветра</li>
                      <li><Text strong>insulation.json</Text> — 6 материалов изоляции (мин. вата, пеностекло, ППУ, пенополистирол, аэрогель, силикат кальция) с λ и диапазоном температур</li>
                      <li><Text strong>cables_tlt.json</Text> — 10 марок ТЛТ (10…100 Вт/м) с T_max, T_min, напряжением</li>
                      <li><Text strong>accessories.json</Text> — базовый набор аксессуаров для спецификации</li>
                    </ul>
                    <Paragraph type="warning" className="help-page-step-note">
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

          <TltCard tone="soft" className="help-page-tip help-page-tip--admin">
            <Paragraph className="help-page-tip-text">
              <Text strong>Техническая поддержка:</Text> При возникновении системных проблем (ошибки запуска, сброс базы данных, обновление системы) обратитесь к системному администратору или разработчику. Доступ к логам: <Text code>make logs</Text> в директории проекта.
            </Paragraph>
          </TltCard>
        </TltCard>
      </div>
    </div>
  );
}
