/**
 * Rename lifecycle for ElectricalVariantTabs: edit state, validation,
 * commit/cancel, and focus restoration after rename.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { InputRef } from 'antd';
import { extractApiErrorMessage } from '@/api/client';
import type { ElectricalVariant } from '@/types/electricalVariant';

export type UseElectricalVariantRenameOptions = {
  variants: ElectricalVariant[];
  selectedVariant: ElectricalVariant | null | undefined;
  renameVariant: (variantId: string, name: string) => Promise<unknown>;
  clearMutationError: () => void;
  /** Tablist root used to restore focus to the renamed tab button. */
  tablistRef: RefObject<HTMLElement | null>;
};

export function useElectricalVariantRename({
  variants,
  selectedVariant,
  renameVariant,
  clearMutationError,
  tablistRef,
}: UseElectricalVariantRenameOptions) {
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameValidationError, setRenameValidationError] = useState<string | null>(null);
  const renameInputRef = useRef<InputRef>(null);
  const focusVariantAfterEditRef = useRef<string | null>(null);
  const renameSubmissionRef = useRef(false);
  const cancelRenameRef = useRef(false);

  useEffect(() => {
    if (!editingVariantId) return;
    if (!variants.some((variant) => variant.id === editingVariantId)) {
      setEditingVariantId(null);
      setRenameValidationError(null);
    }
  }, [variants, editingVariantId]);

  useEffect(() => {
    if (editingVariantId) {
      renameInputRef.current?.focus({ cursor: 'all' });
    }
  }, [editingVariantId]);

  useEffect(() => {
    if (editingVariantId !== null || !focusVariantAfterEditRef.current) return;
    const variantId = focusVariantAfterEditRef.current;
    focusVariantAfterEditRef.current = null;
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`[data-electrical-variant-id="${variantId}"]`)
      ?.focus();
  }, [editingVariantId, tablistRef]);

  const startRename = () => {
    if (!selectedVariant) return;
    clearMutationError();
    setRenameValidationError(null);
    setRenameValue(selectedVariant.name);
    setEditingVariantId(selectedVariant.id);
  };

  const cancelRename = () => {
    cancelRenameRef.current = true;
    focusVariantAfterEditRef.current = editingVariantId;
    setEditingVariantId(null);
    setRenameValidationError(null);
    queueMicrotask(() => {
      cancelRenameRef.current = false;
    });
  };

  const commitRename = async (restoreTabFocus: boolean) => {
    if (!editingVariantId || renameSubmissionRef.current) return;
    const target = variants.find((variant) => variant.id === editingVariantId);
    if (!target) {
      setEditingVariantId(null);
      return;
    }

    const trimmedName = renameValue.trim();
    if (!trimmedName) {
      setRenameValidationError('Название ЭР не может быть пустым');
      return;
    }
    if (trimmedName === target.name) {
      if (restoreTabFocus) focusVariantAfterEditRef.current = target.id;
      setEditingVariantId(null);
      setRenameValidationError(null);
      return;
    }

    renameSubmissionRef.current = true;
    clearMutationError();
    setRenameValidationError(null);
    try {
      await renameVariant(target.id, trimmedName);
      if (restoreTabFocus) focusVariantAfterEditRef.current = target.id;
      setEditingVariantId(null);
    } catch (error) {
      setRenameValidationError(extractApiErrorMessage(error));
    } finally {
      renameSubmissionRef.current = false;
    }
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
    }
  };

  const handleRenameBlur = () => {
    if (cancelRenameRef.current || renameSubmissionRef.current) return;
    void commitRename(false);
  };

  return {
    editingVariantId,
    renameValue,
    setRenameValue,
    renameValidationError,
    setRenameValidationError,
    renameInputRef,
    cancelRenameRef,
    isRenaming: editingVariantId !== null,
    startRename,
    cancelRename,
    commitRename,
    handleRenameKeyDown,
    handleRenameBlur,
  };
}
