import { messagingPromise } from "./firebase_bootstrap.js";
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

// VAPID 키는 Firebase 콘솔에서 생성
const VAPID_KEY = "YOUR_PUBLIC_VAPID_KEY";

const btnRequestNotify = document.getElementById('btn-request-notify');

btnRequestNotify.addEventListener('click', async () => {
  try {
    const messaging = await messagingPromise;
    if (!messaging) return alert('이 브라우저는 푸시를 지원하지 않습니다.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return alert('푸시 권한이 거부되었습니다.');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      localStorage.setItem('fcm_token', token);
      window.dispatchEvent(new CustomEvent('fcm:token', { detail: token }));
      alert('푸시 토큰 등록 완료');
    }
  } catch (e) {
    console.error(e); alert('푸시 권한/토큰 발급 실패');
  }
});

// 포그라운드 수신
(async () => {
  const messaging = await messagingPromise;
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    // 단순 알림 UI
    const title = payload.notification?.title ?? '알림';
    const body = payload.notification?.body ?? '';
    // 표시
    if (document.hasFocus()) alert(`${title}\n\n${body}`);
  });
})();
