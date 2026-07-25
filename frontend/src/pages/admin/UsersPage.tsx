import { Form, Modal, Table, message } from 'antd';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser, deactivateUser, listUsers } from '@/api/admin';
import type { AdminUser } from '@/types/admin';
import { TltButton, TltCard, TltTextField } from '@/components/ui-kit';

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
          <TltButton size="compact" variant="danger" onClick={() => deactMut.mutate(u.id)}>
            Деактивировать
          </TltButton>
        ),
    },
  ];

  return (
    <TltCard
      title="Сотрудники"
      actions={
        <TltButton variant="primary" onClick={() => setOpen(true)}>
          Добавить
        </TltButton>
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
            <TltTextField type="email" autoComplete="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Пароль"
            rules={[{ required: true, min: 6 }]}
          >
            <TltTextField type="password" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="full_name" label="ФИО">
            <TltTextField />
          </Form.Item>
        </Form>
      </Modal>
    </TltCard>
  );
}
