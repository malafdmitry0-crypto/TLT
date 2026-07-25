import { useEffect } from 'react';
import { appMessage as message } from '@/feedback/appFeedback';

import type { ProjectObject } from '@/types/project';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import { buildTsv, copyToClipboard } from '@/utils/clipboard';

type ElecCalcClipboardColumn = {
  key: ElectricalColumnKey;
  title: string;
};

type UseElecCalcSelectedRowsClipboardEffectOptions = {
  objects: readonly ProjectObject[];
  selectedRowKeys: readonly string[];
  visibleElectricalColumnMetas: readonly ElecCalcClipboardColumn[];
  electricalColumnCopyValue: (
    key: ElectricalColumnKey,
    obj: ProjectObject,
    index: number,
  ) => unknown;
};

export function useElecCalcSelectedRowsClipboardEffect({
  objects,
  selectedRowKeys,
  visibleElectricalColumnMetas,
  electricalColumnCopyValue,
}: UseElecCalcSelectedRowsClipboardEffectOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'c') return;
      if (selectedRowKeys.length === 0) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;

      const selectedRows = objects
        .map((object, index) => ({ object, index }))
        .filter(({ object }) => selectedRowKeys.includes(object.id));
      if (selectedRows.length === 0) return;
      const header = visibleElectricalColumnMetas.map((meta) => meta.title);
      const rows = selectedRows.map(({ object, index }) =>
        visibleElectricalColumnMetas.map((meta) =>
          String(electricalColumnCopyValue(meta.key, object, index) ?? ''),
        ),
      );
      copyToClipboard(buildTsv([header, ...rows])).then(() => {
        message.success(`Скопировано строк: ${selectedRows.length}`);
      });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    electricalColumnCopyValue,
    objects,
    selectedRowKeys,
    visibleElectricalColumnMetas,
  ]);
}
