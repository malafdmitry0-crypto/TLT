import { Form, Typography } from 'antd';
import { appMessage as message } from '@/feedback/appFeedback';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { TltButton, TltCard, TltTextField } from '@/components/ui-kit';
import './login-page.css';

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
    <div className="login-page">
      <TltCard as="div" padding="comfortable" className="login-page-card">
        <Title level={3} className="login-page-title">
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
            <TltTextField
              type="email"
              autoComplete="email"
              autoFocus
              className="tlt-field--fill"
            />
          </Form.Item>
          <Form.Item
            label="Пароль"
            name="password"
            rules={[{ required: true, message: 'Введите пароль' }]}
          >
            <TltTextField
              type="password"
              autoComplete="current-password"
              className="tlt-field--fill"
            />
          </Form.Item>
          <TltButton variant="primary" type="submit" className="login-page-submit">
            Войти
          </TltButton>
        </Form>
        <TltButton variant="link" onClick={() => navigate('/')} className="login-page-back">
          Назад
        </TltButton>
        <TltButton
          variant="link"
          size="compact"
          onClick={() => navigate(loginRole === 'admin' ? '/help/admin' : '/help/employee')}
          className="login-page-help"
        >
          {loginRole === 'admin' ? 'Инструкция для администратора' : 'Инструкция для сотрудника'}
        </TltButton>
      </TltCard>
    </div>
  );
}
