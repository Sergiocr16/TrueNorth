/* global self, importScripts, firebase, clients */
// Background push for the installed app. Firebase's compat build is the one
// that runs inside a service worker; the config arrives on the query string
// when the page registers this worker, so nothing is hardcoded here.
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

const messaging = firebase.messaging();

// The server sends data-only messages, so this worker decides how they look
// and the notification opens the right screen rather than the app root.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'TrueNorth', {
    body: data.body || '',
    icon: '/icons/192',
    badge: '/icons/192m',
    tag: data.tag || 'truenorth',
    data: { url: data.url || '/hoy' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/hoy';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
