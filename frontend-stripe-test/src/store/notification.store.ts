import { create } from "zustand";

import {
  apiAuthGet,
  type AllwainNotificationList,
} from "../config/api";

type NotificationState = {
  unreadCount: number;
  refreshing: boolean;
  refreshUnreadCount: () => Promise<void>;
  setUnreadCount: (count: number) => void;
  decrementUnreadCount: () => void;
};

function normalizedCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unreadCount: 0,
  refreshing: false,
  setUnreadCount: (count) => set({ unreadCount: normalizedCount(count) }),
  decrementUnreadCount: () =>
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
  refreshUnreadCount: async () => {
    if (get().refreshing) return;
    set({ refreshing: true });
    try {
      const response = await apiAuthGet<AllwainNotificationList>(
        "/allwain/notifications?limit=1",
      );
      set({ unreadCount: normalizedCount(response.unreadCount || 0) });
    } finally {
      set({ refreshing: false });
    }
  },
}));
