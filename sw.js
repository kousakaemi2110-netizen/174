/* ==============================
   174° Service Worker
   ============================== */

const CACHE_NAME = '174-v2';
const SHELL = [
  './index.html',
  './record.html',
  './calendar.html',
  './analysis.html',
  './care.html',
  './column.html',
  './community.html',
  './settings.html',
  './css/style.css',
  './js/app.js',
  './images/icons/icon.svg',
  './images/icons/icon-maskable.svg'
];

/* インストール: アプリシェルをキャッシュ */
self.addEventListener('install', e => {
  // キャッシュ追加（失敗しても無視して続行）
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

/* アクティベート: 古いキャッシュを削除 */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* フェッチ: HTML/JS/CSSはネットワーク優先（常に最新を取得）、画像のみキャッシュ優先 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  // 外部API・フォントはネットワーク優先
  if (url.includes('open-meteo.com') || url.includes('googleapis.com') || url.includes('jsdelivr.net')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // HTML・JS・CSSはネットワーク優先（開発・更新時に最新を確保）
  if (url.match(/\.(html|js|css)(\?|$)/)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // 画像などはキャッシュ優先
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
