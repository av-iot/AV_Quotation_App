"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { getPending, syncPendingWrites } from "@/lib/offline-queue";
import { useAuth } from "@/lib/auth-context";

interface SyncContextValue {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncResult: { synced: number; failed: number } | null;
  syncNow: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,
  lastSyncResult: null,
  syncNow: async () => {},
  refreshPendingCount: async () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    synced: number;
    failed: number;
  } | null>(null);
  const { firebaseUser } = useAuth();
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor online/offline status
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Refresh pending count
  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPending();
      setPendingCount(pending.length);
    } catch {
      // IndexedDB might not be available (SSR)
    }
  }, []);

  // Sync pending writes
  const syncNow = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      const getToken = async () => {
        if (firebaseUser) {
          return firebaseUser.getIdToken();
        }
        return null;
      };
      const result = await syncPendingWrites(getToken);
      setLastSyncResult(result);
      await refreshPendingCount();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline, firebaseUser, refreshPendingCount]);

  // Auto-sync when coming online or periodically
  useEffect(() => {
    refreshPendingCount();

    // Sync immediately when coming back online
    if (isOnline && pendingCount > 0) {
      syncNow();
    }

    // Periodic sync every 30 seconds if there are pending items
    syncIntervalRef.current = setInterval(async () => {
      const pending = await getPending().catch(() => []);
      if (pending.length > 0 && isOnline) {
        syncNow();
      }
    }, 30000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SyncContext.Provider
      value={{
        isOnline,
        pendingCount,
        isSyncing,
        lastSyncResult,
        syncNow,
        refreshPendingCount,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
