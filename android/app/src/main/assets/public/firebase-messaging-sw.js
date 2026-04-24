importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB1DVI8iWZyldtAZPXurcBe2zZxuflujc4",
  authDomain: "gen-lang-client-0059000483.firebaseapp.com",
  projectId: "gen-lang-client-0059000483",
  storageBucket: "gen-lang-client-0059000483.firebasestorage.app",
  messagingSenderId: "1043316477203",
  appId: "1:1043316477203:web:3b67183249b5cd56361ee6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || '🚨 Emergency Alert Nearby';
  const notificationOptions = {
    body: payload.notification?.body || 'Someone nearby requires immediate assistance.',
    icon: '/favicon.ico', // Replace with valid icon path if desired
    vibrate: [200, 100, 200, 100, 200, 100, 200], // SOS vibration pattern
    requireInteraction: true,
    data: payload.data
  };
  
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Close the notification
  
  const targetUrl = new URL('/', self.location.origin).href;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) {
          if (event.notification.data) {
             client.postMessage({ type: 'FOCUS_MAP', payload: event.notification.data });
          }
          return client.focus();
        }
      }
      
      // If no window is open, open one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl).then(client => {
             if (client && event.notification.data) {
                 // Slight delay to ensure React boots
                 setTimeout(() => {
                    client.postMessage({ type: 'FOCUS_MAP', payload: event.notification.data });
                 }, 2000);
             }
        });
      }
    })
  );
});
