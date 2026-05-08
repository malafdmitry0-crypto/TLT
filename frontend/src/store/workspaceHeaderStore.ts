import { create } from 'zustand';

export type WorkspaceHeaderMode = 'edit' | 'new' | 'idle';

interface WorkspaceHeaderContext {
  title: string;
  mode: WorkspaceHeaderMode;
  modeLabel: string;
}

interface WorkspaceHeaderState {
  context: WorkspaceHeaderContext | null;
  setContext: (context: WorkspaceHeaderContext | null) => void;
}

export const useWorkspaceHeaderStore = create<WorkspaceHeaderState>((set) => ({
  context: null,
  setContext: (context) => set({ context }),
}));
