import { auth, db } from "./firebase_bootstrap.js";
import {
  collection, addDoc, serverTimestamp, query, where,
  onSnapshot, doc, setDoc, getDoc, updateDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// UI refs
const banner = $("lunch-banner");
const candWrap = $("lunch-candidates");
const ctaWrap = $("lunch-cta");
const activeSpan = $("lunch-active");
const timerSpan = $("lunch-timer");
const statusSpan = $("lunch-status");
const btnAccept = $("btn-lunch-accept");
const btnCancel = $("btn-lunch-cancel");

let currentPollId = null;
let unsubPoll = null;
let unsubResp = null;
let countdownTimer = null;
let presenceUnsub = null;

const ROOM_ONLINE_WINDOW_MS = 2 * 60 * 1000; // 최근 2분
const POLL_DURATION_MS = 5 * 60 * 1000;      // 5분

// Presence: 내가 접속 중임을 기록
function startPresence() {
  stopPresence();
  const ref = doc(db, "presence", auth.currentUser.uid);
  const tick = async () => {
    await setDoc(ref, {
      displayName: auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid,
      lastSeen: serverTimestamp()
    }, { merge: true });
  };
  tick();
  const iv = setInterval(tick, 60 * 1000);
  presenceUnsub = () => clearInterval(iv);
}
function stopPresence(){ if (presenceUnsub) presenceUnsub(), presenceUnsub=null; }

// Poll 생성 (채팅에서 호출)
async function createPollFromText(raw) {
  const parts = raw.split("_").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) { alert("후보가 필요합니다. 예) @점심메뉴_김밥_라멘"); return; }
  let cands = parts.slice(1, 1+5);
  cands = Array.from(new Set(cands));
  if (!cands.length) return;

  const since = new Date(Date.now() - ROOM_ONLINE_WINDOW_MS);
  // presence는 단일 where만 사용 → 인덱스 불필요
  const qPres = query(collection(db, "presence"), where("lastSeen", ">=", since));
  const presSnap = await getDocs(qPres);
  const participants = presSnap.docs.map(d => d.id);
  if (!participants.includes(auth.currentUser.uid)) participants.push(auth.currentUser.uid);

  const existing = await getOpenPoll();
  if (existing) { alert("진행 중인 점심 투표가 있습니다."); return; }

  const expiresAt = new Date(Date.now() + POLL_DURATION_MS);
  const ref = await addDoc(collection(db, "lunch_polls"), {
    creatorUid: auth.currentUser.uid,
    candidates: cands,
    participants,
    activeMenu: null,
    status: "open",
    createdAt: serverTimestamp(),
    expiresAt
  });
  attachPoll(ref.id);
}

// 🔧 인덱스 없이 '열린 폴' 하나 가져오기: where만 쓰고, 정렬은 프론트에서
async function getOpenPoll() {
  const qOpen = query(collection(db, "lunch_polls"), where("status", "==", "open"));
  const snap = await getDocs(qOpen);
  // createdAt 내림차순으로 정렬 후 맨 앞 반환
  const list = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
  return list[0] || null;
}

function startCountdown(expiresAt) {
  stopCountdown();
  function tick() {
    const expireMs = expiresAt?.toDate ? expiresAt.toDate().getTime() : new Date(expiresAt).getTime();
    const remain = expireMs - Date.now();
    if (remain <= 0) {
      timerSpan.textContent = "00:00";
      stopCountdown();
      if (currentPollId) expireIfOpen(currentPollId);
      return;
    }
    const m = Math.floor(remain / 60000);
    const s = Math.floor((remain % 60000) / 1000);
    timerSpan.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  countdownTimer = setInterval(tick, 250);
  tick();
}
function stopCountdown(){ if (countdownTimer) clearInterval(countdownTimer), countdownTimer=null; }

async function expireIfOpen(pollId) {
  const ref = doc(db, "lunch_polls", pollId);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().status === "open") {
    await updateDoc(ref, { status: "expired" });
  }
}

async function evaluatePoll(pollId, pollData, responses) {
  if (pollData.status !== "open") return;
  if (!pollData.activeMenu) return;

  let canceled = false;
  const accepted = new Set();
  responses.forEach(r => {
    if (r.choice === "cancel") canceled = true;
    if (r.choice === "accept" && r.menu === pollData.activeMenu) accepted.add(r.uid);
  });

  if (canceled) {
    await updateDoc(doc(db, "lunch_polls", pollId), { status: "failed" });
    return;
  }

  const allAccepted = pollData.participants.every(uid => accepted.has(uid));
  if (allAccepted) {
    await updateDoc(doc(db, "lunch_polls", pollId), { status: "success" });
  }
}

function attachPoll(pollId) {
  detachPoll();
  currentPollId = pollId;

  const pref = doc(db, "lunch_polls", pollId);
  unsubPoll = onSnapshot(pref, (psnap) => {
    if (!psnap.exists()) { hideBanner(); return; }
    const p = psnap.data();

    showBanner(p);
    startCountdown(p.expiresAt);

    if (unsubResp) unsubResp();
    unsubResp = onSnapshot(collection(db, "lunch_polls", pollId, "responses"), (rsnap) => {
      const res = [];
      rsnap.forEach(d => res.push({ uid: d.id, ...d.data() }));
      evaluatePoll(pollId, p, res);
    });

    if (p.status === "success") {
      successConfetti();
      statusSpan.textContent = "점심 메뉴가 결정되었습니다! 🎉";
      ctaWrap.classList.add("hidden");
      candWrap.innerHTML = "";
      stopCountdown();
    } else if (p.status === "failed") {
      statusSpan.textContent = "취소되어 무효가 되었어요 😢";
      ctaWrap.classList.add("hidden");
      candWrap.innerHTML = "";
      stopCountdown();
    } else if (p.status === "expired") {
      statusSpan.textContent = "시간 초과로 종료되었습니다 ⏰";
      ctaWrap.classList.add("hidden");
      candWrap.innerHTML = "";
      stopCountdown();
    } else {
      statusSpan.textContent = "";
    }
  });
}

function detachPoll() {
  if (unsubPoll) unsubPoll(), unsubPoll=null;
  if (unsubResp) unsubResp(), unsubResp=null;
  stopCountdown();
  currentPollId = null;
  hideBanner();
}

function hideBanner(){ banner.classList.add("hidden"); }
function showBanner(p){
  banner.classList.remove("hidden");
  if (!p.activeMenu) {
    ctaWrap.classList.add("hidden");
    activeSpan.textContent = "";
    candWrap.innerHTML = "";
    (p.candidates||[]).forEach(c => {
      const b = document.createElement("button");
      b.className = "lunch-btn";
      b.textContent = c;
      b.addEventListener("click", async () => {
        if (!p.participants?.includes(auth.currentUser.uid)) { alert("참여자만 선택할 수 있습니다."); return; }
        await updateDoc(doc(db, "lunch_polls", currentPollId), { activeMenu: c });
      });
      candWrap.appendChild(b);
    });
  } else {
    candWrap.innerHTML = "";
    activeSpan.textContent = `선택된 메뉴: ${p.activeMenu}`;
    ctaWrap.classList.remove("hidden");
  }
}

btnAccept.addEventListener("click", async () => {
  if (!currentPollId) return;
  const poll = await getDoc(doc(db,"lunch_polls", currentPollId));
  if (!poll.exists()) return;
  const p = poll.data();
  if (!p.activeMenu) return alert("먼저 메뉴를 선택하세요.");
  await setDoc(doc(db, "lunch_polls", currentPollId, "responses", auth.currentUser.uid), {
    uid: auth.currentUser.uid,
    choice: "accept",
    menu: p.activeMenu,
    updatedAt: serverTimestamp()
  }, { merge: true });
});

btnCancel.addEventListener("click", async () => {
  if (!currentPollId) return;
  const poll = await getDoc(doc(db,"lunch_polls", currentPollId));
  if (!poll.exists()) return;
  const p = poll.data();
  await setDoc(doc(db, "lunch_polls", currentPollId, "responses", auth.currentUser.uid), {
    uid: auth.currentUser.uid,
    choice: "cancel",
    menu: p.activeMenu || null,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await updateDoc(doc(db, "lunch_polls", currentPollId), { status: "failed" });
});

// 간단 컨페티
function successConfetti() {
  const root = document.createElement("div");
  root.className = "confetti";
  for (let i=0;i<120;i++){
    const p = document.createElement("i");
    p.style.left = Math.random()*100 + "vw";
    p.style.top = "-10px";
    p.style.background = `hsl(${Math.floor(Math.random()*360)},90%,60%)`;
    p.style.transform = `translateY(0) rotate(${Math.random()*360}deg)`;
    p.style.animationDelay = (Math.random()*300)+"ms";
    root.appendChild(p);
  }
  document.body.appendChild(root);
  setTimeout(()=>root.remove(), 1400);
}

// 페이지 진입: 진행 중 폴 연결 + presence 시작
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  startPresence();
  const open = await getOpenPoll();
  if (open) attachPoll(open.id);
});

// 외부에서 호출(채팅 커맨드)
window.__lunchCreatePollFromText = createPollFromText;
