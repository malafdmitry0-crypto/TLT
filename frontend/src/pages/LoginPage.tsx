import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const { Title } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginRole = searchParams.get('role') === 'admin' ? 'admin' : 'employee';
  const { loginAsEmployee, loginAsAdmin } = useAuth();

  const onFinish = async (values: LoginForm) => {
    try {
      if (loginRole === 'admin') {
        await loginAsAdmin(values.email, values.password);
        navigate('/admin/users');
      } else {
        await loginAsEmployee(values.email, values.password);
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
          {loginRole === 'admin' ? 'Вход администратора' : 'Вход сотрудника'}
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
        <Button type="link" block onClick={() => navigate('/')} style={{ color: '#1a5276' }}>
          Назад
        </Button>
        <Button
          type="link"
          size="small"
          block
          onClick={() => navigate(loginRole === 'admin' ? '/help/admin' : '/help/employee')}
          style={{ color: '#595959' }}
        >
          {loginRole === 'admin' ? 'Инструкция для администратора' : 'Инструкция для сотрудника'}
        </Button>
      </Card>
    </div>
  );
}
