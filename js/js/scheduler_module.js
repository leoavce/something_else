import { auth, db } from "./firebase_bootstrap.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const schedEmojiEl = document.getElementById('sched-emoji');
const schedIntervalEl = document.getElementById('sched-interval-min');
const schedMessageEl = document.getElementById('sched-message');
const schedSaveBtn = document.getElementById('btn-save-schedule');
const schedCurEl = document.getElementById('schedule-current');

async function loadSchedule() {
  if (!auth.currentUser) return;
  const ref = doc(db, 'schedules', auth.currentUser.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const s = snap.data();
    schedCurEl.textContent = `현재 설정: ${s.emoji || '🔔'} / ${s.intervalMin}분 / "${s.message}"`;
    schedEmojiEl.value = s.emoji || '🔔';
    schedIntervalEl.value = s.intervalMin || 30;
    schedMessageEl.value = s.message || '';
  } else {
    schedCurEl.textContent = '현재 설정 없음';
  }
}

schedSaveBtn.addEventListener('click', async () => {
  if (!auth.currentUser) return alert('로그인 필요');
  const emoji = (schedEmojiEl.value || '🔔').trim();
  const intervalMin = Math.max(1, parseInt(schedIntervalEl.value || '30', 10));
  const message = (schedMessageEl.value || '').trim();
  const token = localStorage.getItem('fcm_token') || null;
  if (!token) alert('먼저 상단의 "웹 푸시 허용"을 눌러 토큰을 등록하세요.');

  const ref = doc(db, 'schedules', auth.currentUser.uid);
  await setDoc(ref, {
    uid: auth.currentUser.uid,
    token,
    emoji,
    intervalMin,
    message,
    nextAt: null,             // Functions가 계산
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await loadSchedule();
  alert('스케줄 저장 완료');
});

window.addEventListener('fcm:token', async (e) => {
  // 토큰 갱신 시 내 스케줄에 저장
  if (!auth.currentUser) return;
  await setDoc(doc(db, 'schedules', auth.currentUser.uid), {
    uid: auth.currentUser.uid, token: e.detail, updatedAt: serverTimestamp()
  }, { merge: true });
});

window.addEventListener('auth:ready', loadSchedule);
window.addEventListener('auth:logout', () => { schedCurEl.textContent = '로그인 필요'; });
