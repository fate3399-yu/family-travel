/**
 * firebase-config.js - Firebase 現代化 SDK 初始化與連線管理
 * 採用官方 ES Module CDN，無需 Node.js 打包工具，支援離線優雅降級
 */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// 預設專案設定 (our-family-travel-7618a 專屬獨立專案)
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSW70nqoQoYzCYEf0NFZoBng6GsGXAMmg",
  authDomain: "our-family-travel-7618a.firebaseapp.com",
  projectId: "our-family-travel-7618a",
  storageBucket: "our-family-travel-7618a.firebasestorage.app",
  messagingSenderId: "800031516355",
  appId: "1:800031516355:web:b660ed40d31208878ca476",
  measurementId: "G-12QL82XH9W"
};

const STORAGE_KEY_CUSTOM_CONFIG = 'ft_custom_firebase_config';

export function getActiveFirebaseConfig() {
  try {
    const custom = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_CONFIG));
    if (custom && custom.apiKey && custom.projectId) {
      return custom;
    }
  } catch (e) {
    // 忽略解析錯誤，使用預設設定
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveCustomFirebaseConfig(config) {
  if (config) {
    localStorage.setItem(STORAGE_KEY_CUSTOM_CONFIG, JSON.stringify(config));
  } else {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_CONFIG);
  }
}

let app = null;
let auth = null;
let db = null;
let storage = null;
let isInitialized = false;
let initError = null;

export async function initFirebaseServices() {
  if (isInitialized) {
    return { app, auth, db, storage, success: true };
  }

  const config = getActiveFirebaseConfig();
  if (!config || !config.apiKey) {
    initError = new Error('尚未設定 Firebase Config');
    return { success: false, error: initError };
  }

  try {
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApps()[0];
    }

    auth = getAuth(app);
    auth.useDeviceLanguage(); // 自動使用使用者慣用語言

    db = getFirestore(app);
    // 嘗試啟用 Firestore 本機離線持久化（多人離線記帳基石）
    try {
      await enableIndexedDbPersistence(db);
      console.log('✅ Firestore 離線持久化已啟用');
    } catch (err) {
      if (err.code === 'failed-precondition') {
        console.warn('⚠️ 多分頁開啟，離線快取僅在單一分頁作用');
      } else if (err.code === 'unimplemented') {
        console.warn('⚠️ 當前瀏覽器不支援 IndexedDB 離線快取');
      }
    }

    storage = getStorage(app);
    isInitialized = true;

    console.log('🌲 Firebase 連線成功 (專案: ' + config.projectId + ')');
    return { app, auth, db, storage, success: true };
  } catch (error) {
    console.warn('⚠️ Firebase 初始化降級（目前處於本機離線模式）:', error.message);
    initError = error;
    return { success: false, error };
  }
}

export function getFirebaseInstance() {
  return {
    app,
    auth,
    db,
    storage,
    isInitialized,
    initError
  };
}
