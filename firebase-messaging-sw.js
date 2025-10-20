/* 글로벌 Service Worker: FCM 백그라운드 알림 처리 */
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAzu2nWLELxL6fbK9xP1y9VcHECMGnx4pc",
  authDomain: "messenger-c6be1.firebaseapp.com",
  projectId: "messenger-c6be1",
  storageBucket: "messenger-c6be1.firebasestorage.app",
  messagingSenderId: "160967686629",
  appId: "1:160967686629:web:98213b58604f3cec57170c",
});

const messaging = firebase.messaging();

// 백그라운드 메시지 표시
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? '알림';
  const options = {
    body: payload.notification?.body ?? '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  };
  self.registration.showNotification(title, options);
});
