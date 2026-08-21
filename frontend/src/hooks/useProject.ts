import { useQuery } from '@tanstack/react-query';
import { getProject, listObjects, listProjects } from '@/api/projects';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => getProject(id as string),
    enabled: !!id,
  });
}

export function useProjectObjects(projectId: string | null) {
  return useQuery({
    queryKey: ['project', projectId, 'objects'],
    queryFn: () => listObjects(projectId as string),
    enabled: !!projectId,
  });
}
