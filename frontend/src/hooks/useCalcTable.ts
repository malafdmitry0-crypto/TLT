import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateObject } from '@/api/projects';
import type { ProjectObject } from '@/types/project';

export function useUpdateObjectParams(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      objectId,
      version,
      params,
    }: {
      objectId: string;
      version: number;
      params: Record<string, unknown>;
    }): Promise<ProjectObject> => updateObject(projectId, objectId, { version, params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'query'] });
      qc.invalidateQueries({ queryKey: ['project', projectId, 'objects', 'summary'] });
    },
  });
}
