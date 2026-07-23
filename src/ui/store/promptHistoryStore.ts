import { create } from 'zustand';

interface PromptHistoryStore {
  isOpen: boolean;
  openPromptHistory: () => void;
  closePromptHistory: () => void;

  // ---- Action-bar "unseen completion" indicator ----
  // The dot must appear ONLY for a run that finished while the panel was
  // closed and the user hasn't looked since. The tricky case: the user
  // watches a run finish with the panel open, then closes it — and the
  // run's execution_success can land just AFTER the close. A plain
  // open/closed check flags that as unseen. So we also remember the prompt
  // id the panel was showing while open ("watched"); a completion for a
  // watched run never raises the dot, even if its event arrives late.
  hasUnseenCompletion: boolean;
  /** True while a history panel (embedded dropdown) is mounted/open. */
  panelOpen: boolean;
  /** Prompt id most recently seen executing while a panel was open. */
  watchedPromptId: string | null;

  setPanelOpen: (open: boolean) => void;
  markWatched: (promptId: string | null | undefined) => void;
  handleCompletion: (promptId: string | null | undefined) => void;
}

export const usePromptHistoryStore = create<PromptHistoryStore>((set) => ({
  isOpen: false,
  openPromptHistory: () => set({ isOpen: true }),
  closePromptHistory: () => set({ isOpen: false }),

  hasUnseenCompletion: false,
  panelOpen: false,
  watchedPromptId: null,

  setPanelOpen: (open) =>
    set(open ? { panelOpen: true, hasUnseenCompletion: false } : { panelOpen: false }),

  markWatched: (promptId) => {
    if (promptId) set({ watchedPromptId: promptId });
  },

  handleCompletion: (promptId) =>
    set((s) => {
      // Seen if the panel is open now, or if this is the run the panel was
      // showing while open (its completion just arrived late).
      const seen = s.panelOpen || (!!promptId && promptId === s.watchedPromptId);
      return seen ? {} : { hasUnseenCompletion: true };
    }),
}));
