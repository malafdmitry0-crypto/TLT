import { Space, Typography, Divider } from 'antd';
import { appMessage as message } from '@/feedback/appFeedback';
import {
  QuestionCircleOutlined,
  UserOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TltButton, TltCard } from '@/components/ui-kit';
import './home-page.css';

const { Title, Paragraph, Text } = Typography;

export default function HomePage() {
  const navigate = useNavigate();
  const { loginAsGuest } = useAuth();

  const handleGuest = async () => {
    try {
      await loginAsGuest();
      navigate('/workspace/heat-calc');
    } catch {
      message.error('Не удалось создать гостевую сессию');
    }
  };

  return (
    <div className="home-page">
      <TltCard className="home-page-card" padding="none">
        <Title level={2} className="home-page-title">
          HeatCalc
        </Title>
        <Paragraph className="home-page-subtitle">
          Расчёт тепловых потерь и подбор систем электрообогрева трубопроводов и резервуаров
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={0}>
          {/* Гость */}
          <div className="home-page-role-card">
            <Space align="start" className="home-page-role-header">
              <UserOutlined className="home-page-role-icon home-page-role-icon--guest" />
              <div>
                <Text strong className="home-page-role-name">Войти без регистрации</Text>
                <br />
                <Text type="secondary" className="home-page-role-desc">
                  Быстрый доступ без аккаунта: один временный проект на сервере (не «Мои проекты»), 3 дня после последней активности. Дольше — скачайте файл проекта (PDL-ER-42).
                </Text>
              </div>
            </Space>
            <TltButton variant="primary" size="comfortable" className="home-page-full-width" onClick={handleGuest}>
              Начать без регистрации
            </TltButton>
            <TltButton
              variant="link"
              size="compact"
              icon={<QuestionCircleOutlined />}
              onClick={() => navigate('/help/guest')}
              className="home-page-help-link home-page-full-width"
            >
              Инструкция для гостей
            </TltButton>
          </div>

          <Divider className="home-page-divider">или</Divider>

          {/* Сотрудник */}
          <div className="home-page-role-card">
            <Space align="start" className="home-page-role-header">
              <TeamOutlined className="home-page-role-icon home-page-role-icon--employee" />
              <div>
                <Text strong className="home-page-role-name">Войти как сотрудник</Text>
                <br />
                <Text type="secondary" className="home-page-role-desc">
                  Полный доступ: сохранение проектов, история расчётов, экспорт отчётов. Требуется учётная запись.
                </Text>
              </div>
            </Space>
            <TltButton size="comfortable" className="home-page-full-width" onClick={() => navigate('/login?role=employee')}>
              Войти с паролем
            </TltButton>
            <TltButton
              variant="link"
              size="compact"
              icon={<QuestionCircleOutlined />}
              onClick={() => navigate('/help/employee')}
              className="home-page-help-link home-page-full-width"
            >
              Инструкция для сотрудников
            </TltButton>
          </div>

          {/* Admin system role — PDL-ER-43: third card approved (not guest-case scope) */}
          <div
            data-testid="home-admin-entry"
            className="home-page-role-card home-page-role-card--admin"
          >
            <Space align="start" className="home-page-role-header">
              <SafetyCertificateOutlined className="home-page-role-icon home-page-role-icon--admin" />
              <div>
                <Text strong className="home-page-role-name">Войти как администратор</Text>
                <br />
                <Text type="secondary" className="home-page-role-desc">
                  Системная роль: пользователи, коэффициенты, справочники. Не заменяет вход инженера (гость / сотрудник).
                </Text>
              </div>
            </Space>
            <TltButton size="comfortable" className="home-page-full-width" onClick={() => navigate('/login?role=admin')}>
              Войти в админку
            </TltButton>
            <TltButton
              variant="link"
              size="compact"
              icon={<QuestionCircleOutlined />}
              onClick={() => navigate('/help/admin')}
              className="home-page-help-link home-page-full-width"
            >
              Инструкция для администратора
            </TltButton>
          </div>
        </Space>
      </TltCard>
    </div>
  );
}
