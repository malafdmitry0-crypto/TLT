import {
  Dropdown,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';

import { TltButton } from '@/components/ui-kit';
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
  canMutate: boolean;
  activeKey: CandidateFolderKey;
  counts: CandidateFolderCounts;
  folders: readonly ElectricalCandidateFolder[];
  onSelectFolder: (key: CandidateFolderKey) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: ElectricalCandidateFolder) => void;
  onDeleteFolder: (folder: ElectricalCandidateFolder) => void;
};

export default function ElecCalcCandidateFolderTabs({
  canMutate,
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
    <TltButton
      key={key}
      size="compact"
      variant={activeKey === key ? 'primary' : 'secondary'}
      onClick={() => onSelectFolder(key)}
    >
      {label} <span className="electrical-candidate-folder-count">{count}</span>
    </TltButton>
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
                disabled={!canMutate}
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'rename',
                      icon: <EditOutlined />,
                      label: 'Переименовать',
                      disabled: !canMutate,
                      onClick: () => onRenameFolder(folder),
                    },
                    {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      danger: true,
                      label: 'Удалить',
                      disabled: !canMutate,
                      onClick: () => onDeleteFolder(folder),
                    },
                  ],
                }}
              >
                <TltButton
                  size="compact"
                  className="electrical-candidate-folder-menu"
                  icon={<MoreOutlined />}
                  aria-label={`Действия с папкой ${folder.name}`}
                  disabled={!canMutate}
                />
              </Dropdown>
            </span>
          );
        })}
      </div>
      <TltButton
        size="compact"
        icon={<PlusOutlined />}
        disabled={!canMutate}
        onClick={onCreateFolder}
      >
        Папка
      </TltButton>
    </div>
  );
}
