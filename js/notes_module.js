import { auth, db } from "./firebase_bootstrap.js";
import {
  collection, addDoc, serverTimestamp, onSnapshot, query, where, orderBy,
  doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const noteListEl = document.getElementById('note-list');
const addBtn = document.getElementById('btn-add-note');

addBtn.addEventListener('click', async () => {
  if (!auth.currentUser) return alert('로그인이 필요합니다');
  const title = document.getElementById('note-title').value.trim();
  const body = document.getElementById('note-body').value.trim();
  const share = document.getElementById('note-share-emails').value.trim();
  const sharedWith = share ? share.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
  if (!title && !body) return;

  await addDoc(collection(db, 'notes'), {
    ownerUid: auth.currentUser.uid,
    ownerEmail: auth.currentUser.email || null,
    title, body,
    sharedWith, // 이메일 목록
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  document.getElementById('note-title').value = '';
  document.getElementById('note-body').value = '';
  document.getElementById('note-share-emails').value = '';
});

function renderNoteItem(id, n) {
  const li = document.createElement('div');
  li.className = 'px-4 py-3 border-b border-gray-200 dark:border-gray-700';
  li.innerHTML = `
    <div class="flex justify-between items-start">
      <div>
        <h5 class="font-semibold">${escapeHtml(n.title||'(제목없음)')}</h5>
        <p class="text-sm text-text-secondary whitespace-pre-wrap">${escapeHtml(n.body||'')}</p>
        ${n.sharedWith?.length ? `<p class="text-xs mt-1">공유: ${n.sharedWith.map(escapeHtml).join(', ')}</p>` : ''}
      </div>
      <div class="flex gap-2">
        <button class="px-2 py-1 text-xs border rounded" data-action="edit">수정</button>
        <button class="px-2 py-1 text-xs border rounded" data-action="delete">삭제</button>
      </div>
    </div>
  `;
  li.querySelector('[data-action="edit"]').addEventListener('click', async () => {
    const title = prompt('제목 수정', n.title || '') ?? n.title;
    const body = prompt('내용 수정', n.body || '') ?? n.body;
    const share = prompt('공유 이메일(쉼표)', (n.sharedWith||[]).join(', ')) ?? (n.sharedWith||[]).join(', ');
    const sharedWith = share ? share.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    await updateDoc(doc(db, 'notes', id), { title, body, sharedWith, updatedAt: serverTimestamp() });
  });
  li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'notes', id));
  });
  return li;
}

function escapeHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.textContent; }

function subscribeNotes() {
  if (!auth.currentUser) return;
  // 내가 소유 OR 내 이메일이 sharedWith 에 포함
  const me = auth.currentUser;
  const notesRef = collection(db, 'notes');
  const q = query(notesRef, where('visibleFor', 'array-contains', me.uid), orderBy('createdAt', 'desc')); // 가시성 인덱스 필드(Functions에서 유지)
  onSnapshot(q, (snap) => {
    noteListEl.innerHTML = '';
    snap.forEach(docSnap => {
      const n = docSnap.data();
      noteListEl.appendChild(renderNoteItem(docSnap.id, n));
    });
  });
}

window.addEventListener('auth:ready', subscribeNotes);
window.addEventListener('auth:logout', () => noteListEl.innerHTML = '');
