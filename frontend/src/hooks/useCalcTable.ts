import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateObject } from '@/api/projects';
import type { ProjectObject } from '@/types/project';

export function useUpdateObjectParams(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      objectId,
      params,
    }: {
      objectId: string;
      params: Record<string, unknown>;
    }): Promise<ProjectObject> => updateObject(projectId, objectId, { params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects'] });
    },
  });
}
