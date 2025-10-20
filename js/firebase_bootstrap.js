// Firebase v10 모듈
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** 🔧 여기를 본인 Firebase 설정으로 교체하세요 */
const firebaseConfig = {
  apiKey: "AIzaSyAzu2nWLELxL6fbK9xP1y9VcHECMGnx4pc",
  authDomain: "messenger-c6be1.firebaseapp.com",
  projectId: "messenger-c6be1",
  appId: "1:160967686629:web:98213b58604f3cec57170c",
};

// Firebase 초기화
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 익명 로그인 (자동)
signInAnonymously(auth).catch(console.error);

// 인증 상태 이벤트 (로그인 완료 시 chat.js에서 받음)
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.dispatchEvent(new CustomEvent('auth:ready', { detail: user }));
  }
});
