import { auth, db } from "./firebase_bootstrap.js";
import {
  collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const el = {
  messages: $("messages"),
  nick: $("nickname"),
  nickSave: $("save-nick"),
  input: $("message"),
  send: $("send")
};

// 닉네임(표시이름) - 로그인 계정의 displayName 우선, 사용자가 입력 시 로컬 override
function loadNick() { return localStorage.getItem("simplechat_nick") || ""; }
function saveNick(v) { localStorage.setItem("simplechat_nick", v); }
el.nick.value = loadNick();

el.nickSave.addEventListener("click", () => {
  const v = (el.nick.value || "").trim().slice(0,20);
  saveNick(v);
  el.nick.value = v;
  alert("표시 이름 저장됨");
});

function currentDisplayName() {
  const local = (el.nick.value || "").trim();
  if (local) return local.slice(0,20);
  const u = auth.currentUser;
  if (!u) return "";
  return (u.displayName || u.email?.split("@")[0] || u.uid).slice(0,20);
}

// 메시지 렌더 (겹침 방지: block 구조 + meta 분리)
function renderMessage(m, isMe) {
  const li = document.createElement("li");
  li.className = `row ${isMe ? "me" : ""}`;

  const bubble = document.createElement("div");
  bubble.className = "msg";

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${m.name || "사용자"} • ${timeStr(m.createdAt)}`;

  const text = document.createElement("div");
  text.textContent = m.text || "";

  bubble.appendChild(meta);
  bubble.appendChild(text);
  li.appendChild(bubble);
  return li;
}

function timeStr(ts) {
  try { return ts?.toDate()?.toLocaleString?.() || ""; } catch { return ""; }
}

async function sendMessage() {
  if (!auth.currentUser) { alert("로그인이 필요합니다"); return; }
  const text = (el.input.value || "").trim();
  if (!text) return;

  const name = currentDisplayName() || "사용자";
  const uid  = auth.currentUser.uid;

  el.send.disabled = true;
  try {
    await addDoc(collection(db, "messages"), { text, name, uid, createdAt: serverTimestamp() });
    el.input.value = "";
  } catch (e) {
    alert("전송 실패: " + (e?.message || e));
  } finally {
    el.send.disabled = false;
  }
}

el.send.addEventListener("click", sendMessage);
el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function subscribe() {
  const ref = collection(db, "messages");
  const q = query(ref, orderBy("createdAt", "asc"), limit(500));
  onSnapshot(q, (snap) => {
    el.messages.innerHTML = "";
    snap.forEach(d => {
      const m = d.data();
      const isMe = m.uid && (m.uid === auth.currentUser?.uid);
      el.messages.appendChild(renderMessage(m, isMe));
    });
    // 스크롤 하단 고정
    requestAnimationFrame(() => {
      el.messages.parentElement.scrollTop = el.messages.parentElement.scrollHeight;
    });
  }, (err) => {
    alert("채팅 구독 실패: " + (err?.message || err));
  });
}

window.addEventListener("auth:ready", subscribe);
