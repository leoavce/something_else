import { auth, db } from "./firebase_bootstrap.js";
import {
  collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const el = {
  nick: document.getElementById('nickname'),
  nickSave: document.getElementById('save-nick'),
  list: document.getElementById('messages'),
  input: document.getElementById('message'),
  send: document.getElementById('send'),
  err: document.getElementById('diag-error')
};

function loadNick() { return localStorage.getItem('simplechat_nick') || ''; }
function saveNick(v) { localStorage.setItem('simplechat_nick', v); }

el.nick.value = loadNick();
el.nickSave.addEventListener('click', () => {
  const v = (el.nick.value || '').trim().slice(0, 20);
  saveNick(v);
  el.nick.value = v;
});

function requireNick() {
  let v = (el.nick.value || '').trim();
  if (!v) {
    v = prompt('닉네임을 입력하세요 (최대 20자)') || '';
    v = v.trim().slice(0, 20);
    el.nick.value = v;
    saveNick(v);
  }
  return v;
}

function renderMessage(m, isMe) {
  const li = document.createElement('li');
  li.className = `row ${isMe ? 'me' : ''}`;
  const bubble = document.createElement('div');
  bubble.className = 'msg';

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${m.name || '익명'} • ${timeStr(m.createdAt)}`;

  const text = document.createElement('div');
  text.textContent = m.text || '';

  bubble.appendChild(meta);
  bubble.appendChild(text);
  li.appendChild(bubble);
  return li;
}

function timeStr(ts) {
  try { return ts?.toDate()?.toLocaleString?.() || ''; } catch { return ''; }
}

async function sendMessage() {
  const text = (el.input.value || '').trim();
  if (!text) return;
  const name = requireNick();
  if (!name) return;

  const uid = auth.currentUser?.uid || 'anon';
  el.send.disabled = true;
  try {
    await addDoc(collection(db, 'messages'), {
      text, name, uid, createdAt: serverTimestamp()
    });
    el.input.value = '';
    if (el.err) el.err.textContent = ''; // 전송 성공 시 에러지우기
  } catch (e) {
    if (el.err) el.err.textContent = '전송 실패: ' + (e?.message || e);
  } finally {
    el.send.disabled = false;
  }
}

el.send.addEventListener('click', sendMessage);
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function subscribe() {
  try {
    const ref = collection(db, 'messages');
    const q = query(ref, orderBy('createdAt', 'asc'), limit(500));
    onSnapshot(q, (snap) => {
      el.list.innerHTML = '';
      snap.forEach(doc => {
        const m = doc.data();
        const isMe = m.uid && (m.uid === auth.currentUser?.uid);
        el.list.appendChild(renderMessage(m, isMe));
      });
      requestAnimationFrame(() => {
        el.list.parentElement.scrollTop = el.list.parentElement.scrollHeight;
      });
      if (el.err) el.err.textContent = ''; // 구독 성공 시 에러지우기
    }, (err) => {
      if (el.err) el.err.textContent = '구독 실패: ' + (err?.message || err);
    });
  } catch (e) {
    if (el.err) el.err.textContent = '구독 초기화 실패: ' + (e?.message || e);
  }
}

window.addEventListener('auth:ready', subscribe);
