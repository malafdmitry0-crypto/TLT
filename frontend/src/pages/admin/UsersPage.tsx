import { Button, Card, Form, Input, Modal, Table, message } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser, deactivateUser, listUsers } from '@/api/admin';
import type { AdminUser } from '@/types/admin';

export default function UsersPage() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: listUsers });

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setOpen(false);
      form.resetFields();
      message.success('Пользователь создан');
    },
    onError: (e: Error) => message.error(e.message),
  });

  const deactMut = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const columns = [
    { title: 'Email', dataIndex: 'email' },
    { title: 'Имя', dataIndex: 'full_name' },
    { title: 'Роль', dataIndex: 'role' },
    {
      title: 'Активен',
      dataIndex: 'is_active',
      render: (v: boolean) => (v ? 'да' : 'нет'),
    },
    {
      title: 'Действия',
      render: (_: unknown, u: AdminUser) =>
        u.is_active && (
          <Button size="small" danger onClick={() => deactMut.mutate(u.id)}>
            Деактивировать
          </Button>
        ),
    },
  ];

  return (
    <Card
      title="Сотрудники"
      extra={
        <Button type="primary" onClick={() => setOpen(true)}>
          Добавить
        </Button>
      }
    >
      <Table<AdminUser> rowKey="id" columns={columns} dataSource={users} />
      <Modal
        title="Новый сотрудник"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMut.mutate(v)}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label="Пароль"
            rules={[{ required: true, min: 6 }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="full_name" label="ФИО">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
