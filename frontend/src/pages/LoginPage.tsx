import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';

const { Title } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginAsEmployee } = useAuth();

  const onFinish = async (values: LoginForm) => {
    try {
      await loginAsEmployee(values.email, values.password);
      const currentRole = useAuthStore.getState().role;
      if (currentRole === 'admin') {
        navigate('/admin/users');
      } else {
        navigate('/workspace/heat-calc');
      }
    } catch {
      message.error('Неверный email или пароль');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a5276',
      }}
    >
      <Card style={{ width: 420 }}>
        <Title level={3} style={{ textAlign: 'center', color: '#1a5276' }}>
          Вход сотрудника
        </Title>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Введите email' },
              { type: 'email', message: 'Некорректный email' },
            ]}
          >
            <Input autoComplete="email" autoFocus />
          </Form.Item>
          <Form.Item
            label="Пароль"
            name="password"
            rules={[{ required: true, message: 'Введите пароль' }]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Войти
          </Button>
        </Form>
        <Button type="link" block onClick={() => navigate('/')}>
          Назад
        </Button>
        <Button
          type="link"
          size="small"
          block
          onClick={() => navigate('/help/employee')}
          style={{ color: '#888' }}
        >
          Инструкция для сотрудника
        </Button>
      </Card>
    </div>
  );
}
