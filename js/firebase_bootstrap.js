// Firebase 모듈 초기화 (v10+)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getMessaging, isSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyAzu2nWLELxL6fbK9xP1y9VcHECMGnx4pc",
  authDomain: "messenger-c6be1.firebaseapp.com",
  projectId: "messenger-c6be1",
  storageBucket: "messenger-c6be1.firebasestorage.app",
  messagingSenderId: "160967686629",
  appId: "1:160967686629:web:98213b58604f3cec57170c",
};

// 앱/서비스 싱글턴
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const messagingPromise = (async () => (await isSupported()) ? getMessaging(app) : null)();

// PWA SW 등록(푸시 수신)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(console.error);
}
