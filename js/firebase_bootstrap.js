// Firebase v10
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

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ① 과거 Service Worker 전부 제거(옛 firebase-messaging-sw.js 참조 제거)
(async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      // 캐시 클리어(선택)
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // 진단 표기
      const e = document.getElementById('diag-error');
      if (e) e.textContent = '';
    }
  } catch (err) {
    const e = document.getElementById('diag-error');
    if (e) e.textContent = 'SW unregister 실패: ' + (err?.message || err);
  }
})();

// ② 익명 로그인
signInAnonymously(auth).catch(err => {
  const e = document.getElementById('diag-error');
  if (e) e.textContent = '익명 로그인 실패: ' + (err?.message || err);
});

// ③ 상태 표시
onAuthStateChanged(auth, (user) => {
  const a = document.getElementById('diag-auth');
  const u = document.getElementById('diag-uid');
  if (user) {
    if (a) a.textContent = 'SIGNED IN';
    if (u) u.textContent = user.uid;
    window.dispatchEvent(new CustomEvent('auth:ready', { detail: user }));
  } else {
    if (a) a.textContent = 'SIGNED OUT';
    if (u) u.textContent = '–';
  }
});
