/**
 * Offline Write Queue — IndexedDB-backed queue for failed server API writes.
 * When the server API is unreachable, proposal writes are queued here and
 * retried automatically when connectivity is restored.
 */

const DB_NAME = "av_offline_queue";
const DB_VERSION = 1;
const STORE_NAME = "pending_writes";

interface PendingWrite {
  id: string;
  action: "create_proposal";
  data: any;
  localFirestoreId?: string; // ID in client Firestore (if written there)
  createdAt: number;
  retryCount: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Add a failed write to the queue */
export async function enqueue(
  action: PendingWrite["action"],
  data: any,
  localFirestoreId?: string
): Promise<string> {
  const db = await openDB();
  const id = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: PendingWrite = {
    id,
    action,
    data,
    localFirestoreId,
    createdAt: Date.now(),
    retryCount: 0,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove a successfully synced item */
export async function dequeue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all pending writes */
export async function getPending(): Promise<PendingWrite[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Update retry count for an item */
export async function incrementRetry(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (entry) {
        entry.retryCount += 1;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Clear the entire queue */
export async function clearQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Attempt to sync all pending writes to the server.
 * Returns the number of successfully synced items.
 */
export async function syncPendingWrites(
  getIdToken: () => Promise<string | null>
): Promise<{ synced: number; failed: number }> {
  const pending = await getPending();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    if (item.retryCount >= 10) {
      // Too many retries, skip (user can manually retry later)
      failed++;
      continue;
    }

    try {
      const idToken = await getIdToken();
      
      if (item.action === "create_proposal") {
        const res = await fetch("/api/proposals", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify(item.data),
        });

        if (res.ok) {
          const { data } = await res.json();
          
          // If we wrote to client Firestore with a temp ID, we could update it
          // But since Firestore persistence handles this, we just dequeue
          await dequeue(item.id);
          synced++;
        } else {
          await incrementRetry(item.id);
          failed++;
        }
      }
    } catch {
      await incrementRetry(item.id);
      failed++;
    }
  }

  return { synced, failed };
}
