import { auth, db } from "./firebase_bootstrap.js";
import {
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, getDoc, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const roomListEl = document.getElementById('room-list');
const newRoomNameEl = document.getElementById('new-room-name');
const btnCreateRoom = document.getElementById('btn-create-room');

const activeTitleEl = document.getElementById('active-room-title');
const activeMetaEl = document.getElementById('active-room-meta');
const messageFeedEl = document.getElementById('message-feed');
const emptyStateEl = document.getElementById('empty-state');
const messageInputEl = document.getElementById('message-input');
const btnSendMessage = document.getElementById('btn-send-message');

let activeRoomId = null;
let unsubscribeMessages = null;

// 방 리스트 구독
async function subscribeRooms() {
  const roomsRef = collection(db, 'rooms');
  const q = query(roomsRef, orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    roomListEl.innerHTML = '';
    snap.forEach(docSnap => {
      const r = docSnap.data();
      const item = document.createElement('div');
      item.className = 'room-item flex items-center gap-4 px-4 py-3 justify-between hover:bg-gray-100 dark:hover:bg-gray-800';
      if (docSnap.id === activeRoomId) item.classList.add('active');
      item.innerHTML = `
        <div class="flex items-center gap-4">
          <div class="relative">
            <div class="flex items-center justify-center w-14 h-14 rounded-full bg-blue-200 dark:bg-blue-900 text-blue-600 dark:text-blue-300 font-bold text-xl">${(r.name||'?').slice(0,2).toUpperCase()}</div>
          </div>
          <div class="flex flex-col justify-center">
            <p class="text-base font-medium line-clamp-1">${r.name ?? 'Untitled'}</p>
            <p class="text-sm text-text-secondary line-clamp-1">${r.lastMessage ?? ''}</p>
          </div>
        </div>
        <div class="shrink-0"><p class="text-xs text-text-secondary">${r.updatedAt?.toDate?.().toLocaleString?.() || ''}</p></div>
      `;
      item.addEventListener('click', () => openRoom(docSnap.id, r));
      roomListEl.appendChild(item);
    });
  });
}

async function openRoom(roomId, roomData) {
  activeRoomId = roomId;
  activeTitleEl.textContent = roomData?.name ?? '채팅방';
  activeMetaEl.textContent = `Room ID: ${roomId}`;
  emptyStateEl.classList.add('hidden');
  messageFeedEl.innerHTML = '';

  if (unsubscribeMessages) unsubscribeMessages();

  const msgRef = collection(db, 'rooms', roomId, 'messages');
  const q = query(msgRef, orderBy('createdAt'));
  unsubscribeMessages = onSnapshot(q, (snap) => {
    messageFeedEl.innerHTML = '';
    snap.forEach(docSnap => {
      const m = docSnap.data();
      const me = auth.currentUser?.uid === m.uid;
      const row = document.createElement('div');
      row.className = `flex items-end gap-3 ${me ? 'justify-end' : 'max-w-lg'}`;
      row.innerHTML = me
        ? `<div class="flex flex-col gap-1 items-end">
             <div class="p-3 msg-bubble msg-me"><p>${escapeHtml(m.text||'')}</p></div>
             <span class="text-xs text-text-secondary">${timeStr(m.createdAt)}</span>
           </div>`
        : `<div class="flex items-end gap-3 max-w-lg">
             <div class="flex items-center justify-center w-8 h-8 rounded-full bg-blue-200 text-blue-600 font-bold text-sm shrink-0">${(m.author||'?').slice(0,2).toUpperCase()}</div>
             <div class="flex flex-col gap-1">
               <div class="p-3 msg-bubble msg-other"><p>${escapeHtml(m.text||'')}</p></div>
               <span class="text-xs text-text-secondary self-start">${timeStr(m.createdAt)}</span>
             </div>
           </div>`;
      messageFeedEl.appendChild(row);
      messageFeedEl.scrollTop = messageFeedEl.scrollHeight;
    });
  });
}

btnCreateRoom.addEventListener('click', async () => {
  const name = newRoomNameEl.value.trim();
  if (!name) return;
  const ref = await addDoc(collection(db, 'rooms'), {
    name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: ''
  });
  newRoomNameEl.value = '';
  // 자동 오픈
  openRoom(ref.id, { name });
});

btnSendMessage.addEventListener('click', async () => {
  const text = messageInputEl.value.trim();
  if (!text || !activeRoomId || !auth.currentUser) return;
  const msgRef = collection(db, 'rooms', activeRoomId, 'messages');
  await addDoc(msgRef, {
    text, createdAt: serverTimestamp(),
    uid: auth.currentUser.uid,
    author: auth.currentUser.email || auth.currentUser.uid
  });
  // 방 업데이트
  await addDoc(collection(db, 'rooms', activeRoomId, 'meta_updates'), { lastMessage: text, updatedAt: serverTimestamp() });
  messageInputEl.value = '';
});

// 방 업데이트 트릭(권한 분리 피하기 위해 Cloud Function이 meta_updates 트리거로 rooms 문서 업데이트 해도 됨)
// 여기서는 클라에서 직접 rooms 업데이트를 삼가고, 보안 강화를 위해 서버(Functions) 사용 권장.

function timeStr(ts) {
  try { return ts?.toDate()?.toLocaleString?.() || ''; } catch { return ''; }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.textContent;
}

window.addEventListener('auth:ready', () => subscribeRooms());
window.addEventListener('auth:logout', () => {
  activeRoomId = null;
  messageFeedEl.innerHTML = '';
  emptyStateEl.classList.remove('hidden');
});
