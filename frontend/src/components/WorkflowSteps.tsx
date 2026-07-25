import { Steps } from 'antd';
import { FireOutlined, ThunderboltOutlined, UnorderedListOutlined, FileTextOutlined } from '@ant-design/icons';
import './common/common-chrome.css';

const STEPS = [
  { title: 'Теплопотери', icon: <FireOutlined /> },
  { title: 'Электрорасчёт', icon: <ThunderboltOutlined /> },
  { title: 'Спецификация', icon: <UnorderedListOutlined /> },
  { title: 'Отчёт', icon: <FileTextOutlined /> },
];

interface WorkflowStepsProps {
  current: 0 | 1 | 2 | 3;
}

export default function WorkflowSteps({ current }: WorkflowStepsProps) {
  return (
    <Steps
      current={current}
      items={STEPS}
      size="small"
      className="workflow-steps"
    />
  );
}
