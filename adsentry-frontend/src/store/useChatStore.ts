import { create } from 'zustand';
import { api } from '@/lib/api';
import { useAuditStore } from '@/store/useAuditStore';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contractId: string | null;
  timestamp: string;
}

interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;

  toggleOpen: () => void;
  sendMessage: (question: string) => Promise<void>;
  clearMessages: () => void;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const NO_CONTRACT_MESSAGE =
  "Run an audit first, then ask me anything about the results — I don't have any campaign data loaded yet.";

const UNREACHABLE_MESSAGE = "I couldn't reach the audit data just now — try again in a moment.";

export const useChatStore = create<ChatState>((set, get) => ({
  isOpen: false,
  messages: [],
  isLoading: false,

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  clearMessages: () => set({ messages: [] }),

  sendMessage: async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || get().isLoading) return;

    const { activeContractId } = useAuditStore.getState();

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: trimmed,
      contractId: activeContractId,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({ messages: [...state.messages, userMessage], isLoading: true }));

    if (!activeContractId) {
      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: NO_CONTRACT_MESSAGE,
        contractId: null,
        timestamp: new Date().toISOString(),
      };
      set((state) => ({ messages: [...state.messages, assistantMessage], isLoading: false }));
      return;
    }

    try {
      const res = await api.askAiQuestion(activeContractId, trimmed);
      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: res.answer,
        contractId: activeContractId,
        timestamp: new Date().toISOString(),
      };
      set((state) => ({ messages: [...state.messages, assistantMessage], isLoading: false }));
    } catch {
      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: UNREACHABLE_MESSAGE,
        contractId: activeContractId,
        timestamp: new Date().toISOString(),
      };
      set((state) => ({ messages: [...state.messages, assistantMessage], isLoading: false }));
    }
  },
}));

// Messages belong to a specific audit — when the active contract changes
// (a new audit is run, or the user logs out), clear the conversation so a
// previous campaign's discussion never bleeds into the new one. History
// within the same contract survives navigation between dashboard pages
// since this store — like the widget that reads it — lives above the router.
let lastContractId = useAuditStore.getState().activeContractId;
useAuditStore.subscribe((state) => {
  if (state.activeContractId !== lastContractId) {
    lastContractId = state.activeContractId;
    useChatStore.getState().clearMessages();
  }
});
