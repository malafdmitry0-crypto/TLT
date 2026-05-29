import { Button, Modal, Typography } from 'antd';

import type { ProjectObject } from '@/types/project';

const { Text } = Typography;

type SaveDraftRowsResult = {
  ok: boolean;
  saved: ProjectObject[];
};

type SaveDraftRows = (rowIds?: string[]) => Promise<SaveDraftRowsResult>;

interface HeatCalcUnsavedChangesModalsProps {
  pendingInlineDisableOpen: boolean;
  pendingWizardObject: ProjectObject | null;
  inlineDraftSaving: boolean;
  cancelPendingInlineDisable: () => void;
  discardPendingInlineDisable: (discardDraftRows: () => void) => void;
  savePendingInlineDisable: (
    saveDraftRows: () => Promise<{ ok: boolean }>,
  ) => Promise<void> | void;
  discardDraftRows: (rowIds?: string[]) => void;
  saveDraftRows: SaveDraftRows;
  setPendingWizardObject: (object: ProjectObject | null) => void;
  forceOpenEditWizard: (object: ProjectObject) => void;
}

export default function HeatCalcUnsavedChangesModals({
  pendingInlineDisableOpen,
  pendingWizardObject,
  inlineDraftSaving,
  cancelPendingInlineDisable,
  discardPendingInlineDisable,
  savePendingInlineDisable,
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
        open={pendingInlineDisableOpen}
        title="Отключить редактирование ячеек?"
        onCancel={cancelPendingInlineDisable}
        footer={[
          <Button
            key="cancel"
            onClick={cancelPendingInlineDisable}
          >
            Cancel
          </Button>,
          <Button
            key="discard"
            disabled={inlineDraftSaving}
            onClick={() => discardPendingInlineDisable(discardDraftRows)}
          >
            Discard
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={inlineDraftSaving}
            onClick={() => {
              void savePendingInlineDisable(() => saveDraftRows());
            }}
          >
            Save
          </Button>,
        ]}
      >
        <Text>
          Есть несохранённые изменения в строках. Сохраните или сбросьте их перед отключением режима.
        </Text>
      </Modal>
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
