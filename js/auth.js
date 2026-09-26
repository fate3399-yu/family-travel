/**
 * auth.js - Firebase 身分驗證核心
 * 支援 Google 帳號一鍵登入、登出、狀態監聽與自動建立/更新 users/{userId}
 */

import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initFirebaseServices } from './firebase-config.js';

let currentUser = null;
let authListeners = [];

/**
 * 啟動身分驗證監聽
 */
export async function initAuth(onUserChanged) {
  if (onUserChanged) {
    authListeners.push(onUserChanged);
  }

  const { auth, db, success } = await initFirebaseServices();
  if (!success || !auth) {
    console.log('🌲 Firebase Auth 處於離線/模擬狀態');
    notifyListeners(null);
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user && db) {
      try {
        await syncUserProfile(user, db);
      } catch (err) {
        console.warn('同步使用者檔案至 Firestore 失敗 (可能離線):', err.message);
      }
    }
    notifyListeners(user);
  });
}

function notifyListeners(user) {
  authListeners.forEach((callback) => {
    try {
      callback(user);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
}

/**
 * 同步使用者公開檔案至 Firestore users/{userId}
 */
async function syncUserProfile(user, db) {
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  const payload = {
    userId: user.uid,
    email: user.email || '',
    displayName: user.displayName || '旅人',
    photoURL: user.photoURL || '',
    updatedAt: serverTimestamp()
  };

  if (!snap.exists()) {
    payload.createdAt = serverTimestamp();
    payload.currentFamilyId = null;
  }

  await setDoc(userRef, payload, { merge: true });
}

/**
 * Google 帳號登入
 */
export async function loginWithGoogle() {
  const { auth, success, error } = await initFirebaseServices();
  if (!success || !auth) {
    throw new Error('Firebase 服務尚未就緒: ' + (error?.message || '未知原因'));
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  currentUser = result.user;
  return result.user;
}

/**
 * 登出帳號
 */
export async function logoutUser() {
  const { auth } = await initFirebaseServices();
  if (auth) {
    await signOut(auth);
  }
  currentUser = null;
}

/**
 * 取得當前登入使用者
 */
export function getCurrentUser() {
  return currentUser;
}
