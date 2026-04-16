import { Table } from 'antd';
import type { TableProps } from 'antd';
import type { ProjectObject } from '@/types/project';

type Props<T> = Omit<TableProps<T>, 'dataSource'> & {
  data: T[];
};

export default function CalcTable<T extends ProjectObject = ProjectObject>(
  props: Props<T>
) {
  return (
    <Table<T>
      rowKey="id"
      size="small"
      pagination={false}
      scroll={{ x: 'max-content' }}
      {...props}
      dataSource={props.data}
    />
  );
}
