import { auth, db } from "./firebase_bootstrap.js";
import {
  collection, addDoc, serverTimestamp, onSnapshot, query, where,
  doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const titleEl = $("note-title");
const bodyEl  = $("note-body");
const addBtn  = $("btn-note-save");
const clrBtn  = $("btn-note-clear");
const listEl  = $("note-list");

let unsubscribeNotes = null;

function renderItem(id, n) {
  const li = document.createElement("li");
  li.className = "note-item";
  li.innerHTML = `
    <h4 class="note-title-text"></h4>
    <p class="note-body-text"></p>
    <div class="note-buttons">
      <button class="btn small" data-act="edit">수정</button>
      <button class="btn small" data-act="del">삭제</button>
    </div>
  `;
  li.querySelector(".note-title-text").textContent = n.title || "(제목 없음)";
  li.querySelector(".note-body-text").textContent  = n.body || "";

  li.querySelector('[data-act="edit"]').addEventListener("click", async () => {
    const t = prompt("제목 수정", n.title || "") ?? n.title;
    const b = prompt("내용 수정", n.body || "")  ?? n.body;
    await updateDoc(doc(db, "notes", id), { title: t, body: b, updatedAt: serverTimestamp() });
  });

  li.querySelector('[data-act="del"]').addEventListener("click", async () => {
    if (confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "notes", id));
  });

  return li;
}

addBtn.addEventListener("click", async () => {
  if (!auth.currentUser) return alert("로그인 필요");
  const title = (titleEl.value || "").trim();
  const body  = (bodyEl.value || "").trim();
  if (!title && !body) return;

  await addDoc(collection(db, "notes"), {
    ownerUid: auth.currentUser.uid,
    title, body,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  titleEl.value = "";
  bodyEl.value  = "";
});

clrBtn.addEventListener("click", () => { titleEl.value = ""; bodyEl.value = ""; });

function startNotesSubscription(uid) {
  if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null; }
  const q = query(collection(db, "notes"), where("ownerUid", "==", uid));
  unsubscribeNotes = onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    items.sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
    listEl.innerHTML = "";
    for (const it of items) listEl.appendChild(renderItem(it.id, it));
  }, (err) => {
    alert("메모 구독 실패: " + (err?.message || err));
  });
}

// 언제 로드돼도 구독이 붙도록
onAuthStateChanged(auth, (user) => {
  if (user) startNotesSubscription(user.uid);
  else {
    if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null; }
    listEl.innerHTML = "";
  }
});
if (auth.currentUser) startNotesSubscription(auth.currentUser.uid);
