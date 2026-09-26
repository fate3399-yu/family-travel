/**
 * sw.js - Service Worker 離線快取支援
 * 支援出國無網路、飛機上、地鐵離線開啟與記帳
 */

const CACHE_NAME = 'pikmin-travel-v25';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './assets/pikmin_banner.jpg',
  './assets/pikmin_logo.jpg',
  './js/models.js',
  './js/db.js',
  './js/storage.js',
  './js/calculations.js',
  './js/qrcode.js',
  './js/firebase-config.js',
  './js/auth.js',
  './js/family.js',
  './js/cloud-storage.js',
  './js/migration.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 🌟 採用 Network-First：優先取得最新檔案，離線時自動回退快取
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // 對於非本機且非靜態 CDN 資源（如 Firebase API / OAuth / Firestore 通道），直接網路放行
  if (!url.origin.includes(self.location.origin) && !url.hostname.includes('gstatic.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
