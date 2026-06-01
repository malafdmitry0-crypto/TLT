import {
  Button,
  Dropdown,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';

import type { ElectricalCandidateFolder } from '@/types/calculation';
import {
  candidateCustomFolderKey,
  type CandidateFolderKey,
} from '@/pages/electrical/elecCalcCandidateFolderModel';

type CandidateFolderCounts = {
  all: number;
  favorite: number;
  custom: ReadonlyMap<string, number>;
};

type ElecCalcCandidateFolderTabsProps = {
  activeKey: CandidateFolderKey;
  counts: CandidateFolderCounts;
  folders: readonly ElectricalCandidateFolder[];
  onSelectFolder: (key: CandidateFolderKey) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: ElectricalCandidateFolder) => void;
  onDeleteFolder: (folder: ElectricalCandidateFolder) => void;
};

export default function ElecCalcCandidateFolderTabs({
  activeKey,
  counts,
  folders,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: ElecCalcCandidateFolderTabsProps) {
  const renderFolderButton = (
    key: CandidateFolderKey,
    label: string,
    count: number,
  ) => (
    <Button
      key={key}
      size="small"
      type={activeKey === key ? 'primary' : 'default'}
      onClick={() => onSelectFolder(key)}
    >
      {label} <span className="electrical-candidate-folder-count">{count}</span>
    </Button>
  );

  return (
    <div className="electrical-candidate-folders" aria-label="Папки вариантов подбора">
      <div className="electrical-candidate-folders__scroll">
        {renderFolderButton('all', 'Все', counts.all)}
        {renderFolderButton('favorite', 'Избранное', counts.favorite)}
        {folders.map((folder) => {
          const key = candidateCustomFolderKey(folder.id);
          return (
            <span key={folder.id} className="electrical-candidate-folder-tab">
              {renderFolderButton(
                key,
                folder.name,
                counts.custom.get(folder.id) ?? 0,
              )}
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'rename',
                      icon: <EditOutlined />,
                      label: 'Переименовать',
                      onClick: () => onRenameFolder(folder),
                    },
                    {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      danger: true,
                      label: 'Удалить',
                      onClick: () => onDeleteFolder(folder),
                    },
                  ],
                }}
              >
                <Button
                  size="small"
                  className="electrical-candidate-folder-menu"
                  icon={<MoreOutlined />}
                  aria-label={`Действия с папкой ${folder.name}`}
                />
              </Dropdown>
            </span>
          );
        })}
      </div>
      <Button
        size="small"
        icon={<PlusOutlined />}
        onClick={onCreateFolder}
      >
        Папка
      </Button>
    </div>
  );
}
