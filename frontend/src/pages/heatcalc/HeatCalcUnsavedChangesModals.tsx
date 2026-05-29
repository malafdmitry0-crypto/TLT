import { Button, Modal, Typography } from 'antd';

import type { ProjectObject } from '@/types/project';

const { Text } = Typography;

type SaveDraftRowsResult = {
  ok: boolean;
  saved: ProjectObject[];
};

type SaveDraftRows = (rowIds?: string[]) => Promise<SaveDraftRowsResult>;

interface HeatCalcUnsavedChangesModalsProps {
  pendingWizardObject: ProjectObject | null;
  inlineDraftSaving: boolean;
  discardDraftRows: (rowIds?: string[]) => void;
  saveDraftRows: SaveDraftRows;
  setPendingWizardObject: (object: ProjectObject | null) => void;
  forceOpenEditWizard: (object: ProjectObject) => void;
}

export default function HeatCalcUnsavedChangesModals({
  pendingWizardObject,
  inlineDraftSaving,
  discardDraftRows,
  saveDraftRows,
  setPendingWizardObject,
  forceOpenEditWizard,
}: HeatCalcUnsavedChangesModalsProps) {
  const discardPendingWizardDraft = () => {
    const target = pendingWizardObject;
    if (!target) return;
    const objectType = target.object_type;
    if (objectType !== 'pipe' && objectType !== 'tank') return;
    discardDraftRows([target.id]);
    setPendingWizardObject(null);
    forceOpenEditWizard(target);
  };

  const savePendingWizardDraft = () => {
    const target = pendingWizardObject;
    if (!target) return;
    const objectType = target.object_type;
    if (objectType !== 'pipe' && objectType !== 'tank') return;
    void saveDraftRows([target.id]).then((result) => {
      if (!result.ok) return;
      const savedObject = result.saved.find((item) => item.id === target.id) ?? target;
      setPendingWizardObject(null);
      forceOpenEditWizard(savedObject);
    });
  };

  return (
    <>
      <Modal
        open={pendingWizardObject != null}
        title="Открыть форму объекта?"
        onCancel={() => setPendingWizardObject(null)}
        footer={[
          <Button key="cancel" onClick={() => setPendingWizardObject(null)}>
            Cancel
          </Button>,
          <Button
            key="discard"
            disabled={inlineDraftSaving}
            onClick={discardPendingWizardDraft}
          >
            Discard
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={inlineDraftSaving}
            onClick={savePendingWizardDraft}
          >
            Save
          </Button>,
        ]}
      >
        <Text>
          В строке есть несохранённые изменения. Сохраните их, сбросьте или отмените открытие формы.
        </Text>
      </Modal>
    </>
  );
}
