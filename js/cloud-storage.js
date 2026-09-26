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
    updatedAt: serverTimestamp()
  };

  if (!txData.createdAt) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
  return true;
}

/**
 * 刪除 Firestore 交易
 */
export async function deleteCloudTransaction(familyId, tripId, txId) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !tripId || !txId) {
    return false;
  }

  const ref = doc(db, 'families', familyId, 'trips', tripId, 'transactions', txId);
  await deleteDoc(ref);
  return true;
}
