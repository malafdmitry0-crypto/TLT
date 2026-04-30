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
      className={`calc-spreadsheet ${props.className ?? ''}`.trim()}
      rowKey="id"
      size="small"
      pagination={false}
      scroll={{ x: 'max-content', y: 'calc(100vh - 430px)' }}
      {...props}
      dataSource={props.data}
    />
  );
}
