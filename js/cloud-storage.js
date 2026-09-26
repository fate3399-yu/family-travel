/**
 * cloud-storage.js - Firestore 雲端交易資料庫與即時同步
 * 支援家庭旅程交易即時監聽 (onSnapshot)、新增、更新與刪除
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initFirebaseServices } from './firebase-config.js';

let activeTransactionUnsubscribe = null;
let activeTripsUnsubscribe = null;

/**
 * 監聽家庭底下的所有旅程帳本 (即時雙向同步)
 */
export async function listenToFamilyTrips(familyId, onDataCallback) {
  if (activeTripsUnsubscribe) {
    activeTripsUnsubscribe();
    activeTripsUnsubscribe = null;
  }

  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId) {
    return () => {};
  }

  const tripsColRef = collection(db, 'families', familyId, 'trips');
  activeTripsUnsubscribe = onSnapshot(tripsColRef, (snapshot) => {
    const list = [];
    snapshot.forEach((d) => {
      list.push({ id: d.id, ...d.data() });
    });
    if (onDataCallback) {
      onDataCallback(list);
    }
  }, (err) => {
    console.warn('雲端旅程監聽警告:', err.message);
  });

  return activeTripsUnsubscribe;
}

/**
 * 儲存旅程至 Firestore (新增或更新)
 */
export async function saveCloudTrip(familyId, tripData) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !tripData) {
    return false;
  }

  const tripId = tripData.id || ('trip_' + Date.now());
  const ref = doc(db, 'families', familyId, 'trips', tripId);

  const payload = {
    ...tripData,
    id: tripId,
    familyId,
    updatedAt: serverTimestamp()
  };

  if (!tripData.createdAt) {
    payload.createdAt = serverTimestamp();
  }

  try {
    await setDoc(ref, payload, { merge: true });
    return true;
  } catch (err) {
    console.warn('雲端儲存旅程異常:', err);
    return false;
  }
}

/**
 * 刪除 Firestore 旅程
 */
export async function deleteCloudTrip(familyId, tripId) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !tripId) {
    return false;
  }

  try {
    const ref = doc(db, 'families', familyId, 'trips', tripId);
    await deleteDoc(ref);
    return true;
  } catch (err) {
    console.warn('雲端刪除旅程異常:', err);
    return false;
  }
}

/**
 * 監聽特定旅程底下的所有交易 (即時雙向同步)
 */
export async function listenToTripTransactions(familyId, tripId, onDataCallback) {
  if (activeTransactionUnsubscribe) {
    activeTransactionUnsubscribe();
    activeTransactionUnsubscribe = null;
  }

  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !tripId) {
    return () => {};
  }

  const txColRef = collection(db, 'families', familyId, 'trips', tripId, 'transactions');
  const q = query(txColRef, orderBy('datetime', 'desc'));

  activeTransactionUnsubscribe = onSnapshot(q, (snapshot) => {
    const list = [];
    snapshot.forEach((d) => {
      list.push({ id: d.id, ...d.data() });
    });
    if (onDataCallback) {
      onDataCallback(list);
    }
  }, (err) => {
    console.warn('雲端交易監聽警告 (可能處於離線狀態):', err.message);
  });

  return activeTransactionUnsubscribe;
}

/**
 * 儲存交易至 Firestore (新增或更新)
 */
export async function saveCloudTransaction(familyId, tripId, txData) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !tripId) {
    return false;
  }

  const txId = txData.id || txData.clientGeneratedId || ('tx_' + Date.now());
  const ref = doc(db, 'families', familyId, 'trips', tripId, 'transactions', txId);

  const payload = {
    ...txData,
    id: txId,
    clientGeneratedId: txId,
    familyId,
    tripId,
    syncStatus: navigator.onLine ? 'synced' : 'pending_upload',
    updatedAt: serverTimestamp()
  };

  if (!txData.createdAt) {
    payload.createdAt = serverTimestamp();
  }

  try {
    if (!navigator.onLine) {
      // 離線狀態：推入本地離線隊列
      enqueueOfflineTransaction({ familyId, tripId, txData: payload });
      return true;
    }

    await setDoc(ref, payload, { merge: true });
    return true;
  } catch (err) {
    console.warn('雲端寫入異常，加入離線待傳隊列:', err.message);
    enqueueOfflineTransaction({ familyId, tripId, txData: payload });
    return false;
  }
}

/**
 * 刪除 Firestore 交易
 */
export async function deleteCloudTransaction(familyId, tripId, txId) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !tripId || !txId) {
    return false;
  }

  try {
    const ref = doc(db, 'families', familyId, 'trips', tripId, 'transactions', txId);
    await deleteDoc(ref);
    return true;
  } catch (err) {
    console.warn('雲端刪除交易異常:', err);
    return false;
  }
}

// ==========================================
// 📦 離線隊列 (Offline Queue) 管理
// ==========================================
const STORAGE_KEY_OFFLINE_QUEUE = 'ft_offline_tx_queue';

function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_OFFLINE_QUEUE)) || [];
  } catch (e) {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem(STORAGE_KEY_OFFLINE_QUEUE, JSON.stringify(queue));
}

export function enqueueOfflineTransaction(item) {
  const queue = getOfflineQueue();
  const existingIdx = queue.findIndex((q) => q.txData.id === item.txData.id);
  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }
  saveOfflineQueue(queue);
}

export function getPendingOfflineCount() {
  return getOfflineQueue().length;
}

/**
 * 恢復連網時：自動將隊列中所有交易逐一推播至 Firestore
 */
export async function flushOfflineQueue(onProgress) {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { success: true, count: 0 };

  const { db, success } = await initFirebaseServices();
  if (!success || !db) return { success: false, count: 0 };

  let flushedCount = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      const ref = doc(db, 'families', item.familyId, 'trips', item.tripId, 'transactions', item.txData.id);
      await setDoc(ref, {
        ...item.txData,
        syncStatus: 'synced',
        syncedAt: serverTimestamp()
      }, { merge: true });
      flushedCount++;
      if (onProgress) onProgress(flushedCount, queue.length);
    } catch (e) {
      console.warn('推播離線交易失敗，保留於隊列:', e);
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  return { success: true, count: flushedCount, remaining: remaining.length };
}

// 監聽連網事件：恢復網路自動沖刷隊列
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 偵測到網路已恢復連線，正在自動同步離線交易...');
    flushOfflineQueue((current, total) => {
      console.log(`[Offline Sync] 已同步 ${current}/${total}`);
    }).then((res) => {
      if (res.count > 0) {
        console.log(`🎉 成功同步 ${res.count} 筆離線交易！`);
      }
    });
  });
}
