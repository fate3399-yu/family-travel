/**
 * migration.js - 本地歷史資料一鍵無痛遷移至 Firebase 家庭雲端
 * 具備冪等性保證 (不重複產生交易) 與本地完整雙重備份 (不刪除任何既有資料)
 */

import {
  collection,
  doc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initFirebaseServices } from './firebase-config.js';
import { Storage } from './storage.js';

const STORAGE_KEYS = {
  TRIPS: 'ft_trips',
  TRANSACTIONS: 'ft_transactions',
  MIGRATION_FLAG: 'ft_migration_completed_v1',
  BACKUP_TRIPS: 'ft_backup_v0_trips',
  BACKUP_TRANSACTIONS: 'ft_backup_v0_transactions'
};

/**
 * 檢查本地是否有尚未轉移至雲端的旅程與交易
 */
export function checkHasLocalDataToMigrate() {
  try {
    const rawTrips = localStorage.getItem(STORAGE_KEYS.TRIPS);
    const rawTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    const isMigrated = localStorage.getItem(STORAGE_KEYS.MIGRATION_FLAG);

    if (isMigrated === 'true') return false;

    const trips = rawTrips ? JSON.parse(rawTrips) : [];
    const txList = rawTx ? JSON.parse(rawTx) : [];

    return trips.length > 0 || txList.length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * 執行一鍵資料遷移
 */
export async function migrateLocalDataToCloud(familyId, creatorUser) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !creatorUser) {
    throw new Error('無法執行資料遷移：Firebase 未連線或無有效家庭');
  }

  const rawTrips = localStorage.getItem(STORAGE_KEYS.TRIPS);
  const rawTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);

  const localTrips = rawTrips ? JSON.parse(rawTrips) : [];
  const localTransactions = rawTx ? JSON.parse(rawTx) : [];

  if (localTrips.length === 0 && localTransactions.length === 0) {
    return { migratedTripsCount: 0, migratedTxCount: 0 };
  }

  // 1. 本地安全雙重備份 (絕對不刪除)
  localStorage.setItem(STORAGE_KEYS.BACKUP_TRIPS, JSON.stringify(localTrips));
  localStorage.setItem(STORAGE_KEYS.BACKUP_TRANSACTIONS, JSON.stringify(localTransactions));

  let migratedTripsCount = 0;
  let migratedTxCount = 0;

  // 2. 轉移 Trips
  for (const trip of localTrips) {
    const tripId = trip.id || ('trip_' + Date.now());
    const tripRef = doc(db, 'families', familyId, 'trips', tripId);

    const tripPayload = {
      ...trip,
      id: tripId,
      familyId,
      createdBy: creatorUser.uid,
      migratedFromLocal: true,
      updatedAt: serverTimestamp()
    };
    if (!trip.createdAt) {
      tripPayload.createdAt = serverTimestamp();
    }

    await setDoc(tripRef, tripPayload, { merge: true });
    migratedTripsCount++;
  }

  // 3. 轉移 Transactions (使用原始 ID 保證冪等性，不重複建立)
  for (const tx of localTransactions) {
    const txId = tx.id || ('tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4));
    const tripId = tx.tripId || (localTrips[0]?.id || 'trip_default');

    const txRef = doc(db, 'families', familyId, 'trips', tripId, 'transactions', txId);

    const txPayload = {
      ...tx,
      id: txId,
      clientGeneratedId: txId,
      familyId,
      tripId,
      migratedFromLocal: true,
      syncStatus: 'synced',
      updatedAt: serverTimestamp()
    };
    if (!tx.createdAt) {
      txPayload.createdAt = serverTimestamp();
    }

    await setDoc(txRef, txPayload, { merge: true });
    migratedTxCount++;
  }

  // 4. 標記遷移完成旗標
  localStorage.setItem(STORAGE_KEYS.MIGRATION_FLAG, 'true');

  return {
    migratedTripsCount,
    migratedTxCount
  };
}
