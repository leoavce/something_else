import { auth, db } from "./firebase_bootstrap.js";
import {
  collection, addDoc, serverTimestamp, onSnapshot, query, where,
  doc, updateDoc, deleteDoc, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const titleEl = $("note-title");
const bodyEl  = $("note-body");
const addBtn  = $("btn-note-save");
const clrBtn  = $("btn-note-clear");
const listEl  = $("note-list");

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

function subscribeNotes() {
  const me = auth.currentUser;
  if (!me) return;

  // 1단계: 인덱스 없이도 동작하는 기본 구독 (정렬 없이 최신이 위로 안 올 수는 있음)
  const baseQ = query(collection(db, "notes"), where("ownerUid", "==", me.uid));
  onSnapshot(baseQ, (snap) => {
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    // createdAt 기준으로 프론트에서 정렬(인덱스 회피)
    items.sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
    listEl.innerHTML = "";
    for (const it of items) listEl.appendChild(renderItem(it.id, it));
  }, (err) => {
    alert("메모 구독 실패: " + (err?.message || err));
  });

  // 참고) Firestore 인덱스 사용 정렬을 원하면 아래로 교체하고 콘솔에서 복합 인덱스 생성
  // const qIdx = query(collection(db,"notes"), where("ownerUid","==",me.uid), orderBy("createdAt","desc"));
  // onSnapshot(qIdx, ... );
}

window.addEventListener("auth:ready", subscribeNotes);
window.addEventListener("auth:logout", () => { listEl.innerHTML = ""; });
