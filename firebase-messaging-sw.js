// ============================================================
// firebase.json — Firebase Hosting + Firestore config
// ============================================================
// {
//   "hosting": {
//     "public": "dist",
//     "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
//     "rewrites": [{ "source": "**", "destination": "/index.html" }],
//     "headers": [
//       {
//         "source": "**/*.@(js|jsx|ts|tsx|css)",
//         "headers": [{ "key": "Cache-Control", "value": "max-age=31536000" }]
//       },
//       {
//         "source": "/firebase-messaging-sw.js",
//         "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
//       }
//     ]
//   },
//   "firestore": {
//     "rules": "firestore.rules",
//     "indexes": "firestore.indexes.json"
//   }
// }

// ============================================================
// public/firebase-messaging-sw.js
// ── Copy this file to your /public directory ──────────────
// ── Replace __FIREBASE_*__ placeholders with your config   ──
// ──  OR inject via your CI/CD pipeline                     ──
// ============================================================

// NOTE: Service Workers cannot access Vite env vars at runtime.
// Use one of these approaches:
//   1. Hardcode values here (acceptable for public config)
//   2. Generate this file during build with a Vite plugin
//   3. Use Firebase Hosting reserved URLs (__/firebase/init.js)

importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

// Option 3 (recommended): Firebase auto-injects config via reserved URL
// Only works on Firebase Hosting
importScripts('/__/firebase/init.js');

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  const notificationTitle = payload.notification?.title || 'Incoming Call';
  const notificationOptions = {
    body:     payload.notification?.body || 'Tap to answer',
    icon:     '/icon-192.png',
    badge:    '/badge-72.png',
    tag:      'incoming-call',
    renotify: true,
    data:     payload.data,
    actions:  [
      { action: 'answer',  title: '✅ Answer' },
      { action: 'decline', title: '❌ Decline' },
    ],
    vibrate: [200, 100, 200],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { roomId, callType } = event.notification.data || {};

  if (event.action === 'decline') {
    // Optionally call a Cloud Function to mark call as missed
    return;
  }

  const urlToOpen = roomId
    ? new URL(`/?incomingCall=${roomId}&type=${callType}`, self.location.origin).href
    : self.location.origin;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.postMessage({ type: 'INCOMING_CALL', roomId, callType });
            return client.focus();
          }
        }
        return clients.openWindow(urlToOpen);
      })
  );
});
