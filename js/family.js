/**
 * family.js - 家庭 (Family)、成員 (Members) 與安全邀請 (Invitations) 核心
 * 支援 Account Member (有帳號大人) 與 Profile Member (無帳號小孩)
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initFirebaseServices } from './firebase-config.js';

let currentFamily = null;
let currentFamilyMembers = [];
let familyListeners = [];

/**
 * 監聽家庭與成員變更
 */
export function onFamilyChange(callback) {
  if (callback) familyListeners.push(callback);
}

function notifyFamilyListeners(family, members) {
  familyListeners.forEach((fn) => {
    try {
      fn(family, members);
    } catch (e) {
      console.error('Family listener error:', e);
    }
  });
}

/**
 * 取得使用者所屬的所有家庭
 */
export async function getUserFamilies(uid) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !uid) return [];

  try {
    const q = query(collection(db, 'families'), where('memberUids', 'array-contains', uid));
    const snapshot = await getDocs(q);
    const families = [];
    snapshot.forEach((docSnap) => {
      families.push({ id: docSnap.id, ...docSnap.data() });
    });
    return families;
  } catch (error) {
    console.warn('讀取使用者家庭清單失敗:', error.message);
    return [];
  }
}

/**
 * 建立新家庭 (例：「Wilson 家庭」)
 * 同時初始化：建立者本人 (Account Member) 與預設小孩成員 (Profile Member)
 */
export async function createFamily({ name = '我的家庭', creatorUser, initialKids = ['大寶', '二寶'] }) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !creatorUser) {
    throw new Error('Firebase 服務尚未準備好或使用者未登入');
  }

  const familyId = 'fam_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const familyRef = doc(db, 'families', familyId);

  // 1. 寫入家庭本體
  const familyData = {
    familyId,
    name,
    creatorUid: creatorUser.uid,
    creatorName: creatorUser.displayName || '建立者',
    memberUids: [creatorUser.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(familyRef, familyData);

  // 2. 建立建立者本人 Account Member
  const creatorMemberRef = doc(db, 'families', familyId, 'members', 'mem_' + creatorUser.uid);
  await setDoc(creatorMemberRef, {
    memberId: 'mem_' + creatorUser.uid,
    familyId,
    type: 'account', // 真正登入帳號
    uid: creatorUser.uid,
    name: creatorUser.displayName || '我',
    role: '我',
    avatar: creatorUser.photoURL || '👨‍💼',
    pikminType: 'red',
    color: '#EF4444',
    createdAt: serverTimestamp()
  });

  // 3. 建立預設小孩 Profile Member (無登入帳號)
  const defaultColors = ['#3B82F6', '#EAB308', '#8B5CF6'];
  const defaultPikmins = ['blue', 'yellow', 'purple'];
  for (let i = 0; i < initialKids.length; i++) {
    const kidName = initialKids[i];
    const kidMemberId = 'mem_kid_' + Date.now() + '_' + i;
    const kidRef = doc(db, 'families', familyId, 'members', kidMemberId);
    await setDoc(kidRef, {
      memberId: kidMemberId,
      familyId,
      type: 'profile', // 純成員資料，無帳號
      uid: null,
      name: kidName,
      role: '小孩',
      avatar: i === 0 ? '👦' : '👧',
      pikminType: defaultPikmins[i % defaultPikmins.length],
      color: defaultColors[i % defaultColors.length],
      createdAt: serverTimestamp()
    });
  }

  // 4. 更新使用者的 currentFamilyId
  const userRef = doc(db, 'users', creatorUser.uid);
  await setDoc(userRef, { currentFamilyId: familyId, updatedAt: serverTimestamp() }, { merge: true });

  currentFamily = familyData;
  return familyData;
}

/**
 * 監聽特定家庭的成員清單
 */
export async function listenToFamilyMembers(familyId) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId) return () => {};

  const membersRef = collection(db, 'families', familyId, 'members');
  return onSnapshot(membersRef, (snapshot) => {
    const list = [];
    snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
    currentFamilyMembers = list;
    notifyFamilyListeners(currentFamily, list);
  });
}

/**
 * 新增小孩或長輩 Profile Member
 */
export async function addProfileMember(familyId, { name, role = '小孩', avatar = '👶', pikminType = 'yellow', color = '#EAB308' }) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId) throw new Error('連線無效');

  const memberId = 'mem_profile_' + Date.now();
  const ref = doc(db, 'families', familyId, 'members', memberId);
  const data = {
    memberId,
    familyId,
    type: 'profile',
    uid: null,
    name,
    role,
    avatar,
    pikminType,
    color,
    createdAt: serverTimestamp()
  };
  await setDoc(ref, data);
  return data;
}

/**
 * 產生安全邀請 Token 與專屬網址
 */
export async function createInvitation(familyId, inviterUser, targetRole = '太太') {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !inviterUser) {
    throw new Error('無法建立邀請：尚未登入或無效家庭');
  }

  // 產生 12 碼隨機邀請 Token
  const inviteToken = 'inv_' + Math.random().toString(36).substr(2, 6) + Math.random().toString(36).substr(2, 6);
  const invRef = doc(db, 'families', familyId, 'invitations', inviteToken);

  const inviteData = {
    inviteToken,
    familyId,
    familyName: currentFamily?.name || '家庭帳本',
    inviterUid: inviterUser.uid,
    inviterName: inviterUser.displayName || '家人',
    targetRole,
    status: 'pending', // 'pending' | 'accepted' | 'expired'
    createdAt: serverTimestamp()
  };

  await setDoc(invRef, inviteData);

  const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${inviteToken}&fid=${familyId}`;
  return {
    inviteToken,
    inviteUrl,
    inviteData
  };
}

/**
 * 查詢邀請函資料
 */
export async function fetchInvitation(familyId, inviteToken) {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !inviteToken) return null;

  try {
    const invRef = doc(db, 'families', familyId, 'invitations', inviteToken);
    const snap = await getDoc(invRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
  } catch (e) {
    console.warn('讀取邀請函失敗:', e);
  }
  return null;
}

/**
 * 接受邀請：太太登入後加入家庭
 */
export async function acceptInvitation(familyId, inviteToken, joiningUser, role = '太太') {
  const { db, success } = await initFirebaseServices();
  if (!success || !db || !familyId || !inviteToken || !joiningUser) {
    throw new Error('加入家庭失敗：資料不完整或未登入');
  }

  // 1. 取得邀請函確認狀態
  const invRef = doc(db, 'families', familyId, 'invitations', inviteToken);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) {
    throw new Error('邀請連結已失效或不存在');
  }
  const invData = invSnap.data();
  if (invData.status === 'accepted' && invData.acceptedBy === joiningUser.uid) {
    // 已經加入過，直接略過
    return { alreadyJoined: true };
  }

  // 2. 更新家庭實體：將太太 UID 加入 memberUids
  const familyRef = doc(db, 'families', familyId);
  await updateDoc(familyRef, {
    memberUids: arrayUnion(joiningUser.uid),
    updatedAt: serverTimestamp()
  });

  // 3. 在成員清單建立或更新太太為 Account Member
  const memberId = 'mem_' + joiningUser.uid;
  const memberRef = doc(db, 'families', familyId, 'members', memberId);
  await setDoc(memberRef, {
    memberId,
    familyId,
    type: 'account',
    uid: joiningUser.uid,
    name: joiningUser.displayName || role,
    role: role,
    avatar: joiningUser.photoURL || '👩‍💼',
    pikminType: 'pink',
    color: '#EC4899',
    joinedAt: serverTimestamp()
  }, { merge: true });

  // 4. 更新邀請函狀態為已接受
  await updateDoc(invRef, {
    status: 'accepted',
    acceptedBy: joiningUser.uid,
    acceptedAt: serverTimestamp()
  });

  // 5. 更新太太個人的 currentFamilyId
  const userRef = doc(db, 'users', joiningUser.uid);
  await setDoc(userRef, { currentFamilyId: familyId, updatedAt: serverTimestamp() }, { merge: true });

  return { success: true, familyId };
}

export function getCurrentFamily() {
  return currentFamily;
}

export function setCurrentFamily(family) {
  currentFamily = family;
}

export function getCurrentFamilyMembers() {
  return currentFamilyMembers;
}
