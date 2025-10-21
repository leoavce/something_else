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
  send: $("send"),
};

function loadNick() { return localStorage.getItem("simplechat_nick") || ""; }
function saveNick(v) { localStorage.setItem("simplechat_nick", v); }
el.nick.value = loadNick();

el.nickSave.addEventListener("click", () => {
  const v = (el.nick.value || "").trim().slice(0,20);
  saveNick(v); el.nick.value = v;
  alert("표시 이름 저장됨");
});

function currentDisplayName() {
  const local = (el.nick.value || "").trim();
  if (local) return local.slice(0,20);
  const u = auth.currentUser;
  return (u?.displayName || u?.email?.split("@")[0] || u?.uid || "사용자").slice(0,20);
}

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
  bubble.appendChild(meta); bubble.appendChild(text);
  li.appendChild(bubble);
  return li;
}
function timeStr(ts) { try { return ts?.toDate()?.toLocaleString?.() || ""; } catch { return ""; } }
function scrollToBottom(){ el.messages.scrollTop = el.messages.scrollHeight; }

async function sendMessage() {
  if (!auth.currentUser) return; // gate에 의해 원래 올 수 없음, 방어
  const text = (el.input.value || "").trim();
  if (!text) return;
  const name = currentDisplayName();
  const uid  = auth.currentUser.uid;

  el.send.disabled = true;
  try {
    await addDoc(collection(db, "messages"), { text, name, uid, createdAt: serverTimestamp() });
    el.input.value = ""; scrollToBottom();
  } catch (e) { alert("전송 실패: " + (e?.message || e)); }
  finally { el.send.disabled = false; }
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
    requestAnimationFrame(scrollToBottom);
  }, (err) => alert("채팅 구독 실패: " + (err?.message || err)));
}

window.addEventListener("auth:ready", subscribe);
