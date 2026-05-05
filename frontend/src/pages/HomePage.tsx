import { Button, Card, Space, Typography, message, Divider } from 'antd';
import {
  QuestionCircleOutlined,
  UserOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a5276, #2e86c1)',
      }}
    >
      <Card style={{ width: 560 }} styles={{ body: { padding: 40 } }}>
        <Title level={2} style={{ textAlign: 'center', color: '#1a5276', marginBottom: 4 }}>
          HeatCalc
        </Title>
        <Paragraph style={{ textAlign: 'center', color: '#555', marginBottom: 32 }}>
          Расчёт тепловых потерь и подбор систем электрообогрева трубопроводов и резервуаров
        </Paragraph>

        <Space direction="vertical" style={{ width: '100%' }} size={0}>
          {/* Гость */}
          <div
            style={{
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              padding: '20px 24px',
              background: '#fafafa',
            }}
          >
            <Space align="start" style={{ marginBottom: 12 }}>
              <UserOutlined style={{ fontSize: 20, color: '#2e86c1', marginTop: 2 }} />
              <div>
                <Text strong style={{ fontSize: 15 }}>Войти без регистрации</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Быстрый доступ к расчётам — регистрация не нужна. Работа ведётся в одном проекте; после 20 мин неактивности все данные автоматически удаляются.
                </Text>
              </div>
            </Space>
            <Button type="primary" size="large" block onClick={handleGuest}>
              Начать без регистрации
            </Button>
            <Button
              type="link"
              size="small"
              icon={<QuestionCircleOutlined />}
              block
              onClick={() => navigate('/help/guest')}
              style={{ marginTop: 6 }}
            >
              Инструкция для гостей
            </Button>
          </div>

          <Divider style={{ margin: '16px 0' }}>или</Divider>

          {/* Сотрудник */}
          <div
            style={{
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              padding: '20px 24px',
              background: '#fafafa',
            }}
          >
            <Space align="start" style={{ marginBottom: 12 }}>
              <TeamOutlined style={{ fontSize: 20, color: '#1a5276', marginTop: 2 }} />
              <div>
                <Text strong style={{ fontSize: 15 }}>Войти как сотрудник</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Полный доступ: сохранение проектов, история расчётов, экспорт отчётов. Требуется учётная запись.
                </Text>
              </div>
            </Space>
            <Button size="large" block onClick={() => navigate('/login?role=employee')}>
              Войти с паролем
            </Button>
            <Button
              type="link"
              size="small"
              icon={<QuestionCircleOutlined />}
              block
              onClick={() => navigate('/help/employee')}
              style={{ marginTop: 6 }}
            >
              Инструкция для сотрудников
            </Button>
          </div>

          {/* Администратор */}
          <div
            style={{
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              padding: '20px 24px',
              background: '#fafafa',
              marginTop: 16,
            }}
          >
            <Space align="start" style={{ marginBottom: 12 }}>
              <SafetyCertificateOutlined style={{ fontSize: 20, color: '#7d3c98', marginTop: 2 }} />
              <div>
                <Text strong style={{ fontSize: 15 }}>Войти как администратор</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Управление сотрудниками, коэффициентами и справочниками. Требуется учётная запись администратора.
                </Text>
              </div>
            </Space>
            <Button size="large" block onClick={() => navigate('/login?role=admin')}>
              Войти в админку
            </Button>
            <Button
              type="link"
              size="small"
              icon={<QuestionCircleOutlined />}
              block
              onClick={() => navigate('/help/admin')}
              style={{ marginTop: 6 }}
            >
              Инструкция для администратора
            </Button>
          </div>
        </Space>
      </Card>
    </div>
  );
}
