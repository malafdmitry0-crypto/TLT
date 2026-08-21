/**
 * Load/save project Iдоп (max section start current).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appMessage as message } from '@/feedback/appFeedback';
import { extractApiErrorMessage } from '@/api/client';
import {
  getProjectElectricalSettings,
  isElectricalSettingsVersionConflict,
  parseIdopAmps,
  patchProjectElectricalSettings,
  PROJECT_ELECTRICAL_SETTINGS_QUERY_KEY,
} from '@/api/electricalSettings';

export function useProjectElectricalSettings(
  projectId: string | undefined,
  canMutate: boolean,
) {
  const queryClient = useQueryClient();
  const [draftIdop, setDraftIdop] = useState<number | null>(null);
  const [draftTouched, setDraftTouched] = useState(false);

  const query = useQuery({
    queryKey: [PROJECT_ELECTRICAL_SETTINGS_QUERY_KEY, projectId],
    queryFn: () => getProjectElectricalSettings(projectId!),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const savedIdop = useMemo(
    () => parseIdopAmps(query.data?.max_section_start_current_a),
    [query.data?.max_section_start_current_a],
  );

  useEffect(() => {
    if (!draftTouched) {
      setDraftIdop(savedIdop);
    }
  }, [savedIdop, draftTouched]);

  const mutation = useMutation({
    mutationFn: async (nextIdop: number | null) => {
      if (!projectId) throw new Error('Проект не выбран');
      if (!query.data) throw new Error('Настройки ещё не загружены');
      if (nextIdop != null && !(nextIdop > 0)) {
        throw new Error('Iдоп должен быть больше 0');
      }
      return patchProjectElectricalSettings(projectId, {
        expected_version: query.data.version,
        max_section_start_current_a: nextIdop,
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        [PROJECT_ELECTRICAL_SETTINGS_QUERY_KEY, projectId],
        data,
      );
      setDraftTouched(false);
      setDraftIdop(parseIdopAmps(data.max_section_start_current_a));
      message.success(
        data.max_section_start_current_a == null
          ? 'Iдоп сброшен'
          : 'Iдоп сохранён',
      );
    },
    onError: async (error: unknown) => {
      if (isElectricalSettingsVersionConflict(error) && projectId) {
        await queryClient.invalidateQueries({
          queryKey: [PROJECT_ELECTRICAL_SETTINGS_QUERY_KEY, projectId],
        });
        setDraftTouched(false);
        message.warning('Настройки изменились. Данные обновлены — сохраните снова.');
        return;
      }
      message.error(extractApiErrorMessage(error, 'Не удалось сохранить Iдоп'));
    },
  });

  const onDraftChange = useCallback((value: number | null) => {
    setDraftTouched(true);
    setDraftIdop(value);
  }, []);

  const save = useCallback(() => {
    if (!canMutate) return;
    mutation.mutate(draftIdop);
  }, [canMutate, draftIdop, mutation]);

  const idopMissing = savedIdop == null;
  const isDirty = draftTouched && draftIdop !== savedIdop;

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    savedIdop,
    draftIdop,
    onDraftChange,
    save,
    saving: mutation.isPending,
    idopMissing,
    isDirty,
    canMutate,
    nominalVoltage: query.data?.nominal_voltage_v ?? 230,
  };
}

export type ProjectElectricalSettingsController = ReturnType<
  typeof useProjectElectricalSettings
>;
