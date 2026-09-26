/**
 * db.js - IndexedDB 本地離線相片與大容量資料儲存庫
 * 解決旅行中拍攝收據、旅遊照片離線儲存與 localStorage 5MB 限制問題
 */

const DB_NAME = 'FamilyTravelDB';
const DB_VERSION = 1;

let dbPromise = null;

export function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 照片倉庫 (儲存原始照片 Base64 / Blob、拍照時間、關聯交易 ID)
      if (!db.objectStoreNames.contains('photos')) {
        const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
        photoStore.createIndex('txId', 'txId', { unique: false });
        photoStore.createIndex('tripId', 'tripId', { unique: false });
        photoStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 交易倉庫 (支出與換匯紀錄)
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('tripId', 'tripId', { unique: false });
        txStore.createIndex('datetime', 'datetime', { unique: false });
      }

      // 旅程倉庫
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

/**
 * 壓縮並產生微縮圖 (維持長寬比，最大邊長 maxDim)
 */
export async function compressImage(fileOrBase64, maxDim = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    img.onerror = reject;

    if (typeof fileOrBase64 === 'string') {
      img.src = fileOrBase64;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => (img.src = e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(fileOrBase64);
    }
  });
}

/**
 * 儲存照片至 IndexedDB，並回傳 { photoId, thumbnail }
 */
export async function savePhoto({ tripId, txId = null, file, caption = '' }) {
  const db = await getDB();
  const photoId = 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  // 1. 產生高畫質離線版本 (最大 1200px)
  const fullImageData = await compressImage(file, 1200, 0.82);
  // 2. 產生極簡微縮圖 (最大 160px，可直接嵌入列表或快顯)
  const thumbnail = await compressImage(fullImageData, 160, 0.65);

  const photoRecord = {
    id: photoId,
    tripId,
    txId,
    dataUrl: fullImageData,
    caption,
    createdAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    const req = store.put(photoRecord);
    req.onsuccess = () => resolve({ photoId, thumbnail, photoRecord });
    req.onerror = () => reject(req.error);
  });
}

/**
 * 讀取照片
 */
export async function getPhoto(photoId) {
  if (!photoId) return null;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const store = tx.objectStore('photos');
    const req = store.get(photoId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 刪除照片
 */
export async function deletePhoto(photoId) {
  if (!photoId) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    const req = store.delete(photoId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
