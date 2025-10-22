import { auth, db } from "./firebase_bootstrap.js";
import {
  collection, addDoc, serverTimestamp, query, where,
  onSnapshot, doc, setDoc, getDoc, updateDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// UI refs
const banner      = $("lunch-banner");
const candWrap    = $("lunch-candidates");
const ctaWrap     = $("lunch-cta");
const activeSpan  = $("lunch-active");
const remainSpan  = $("lunch-remaining");
const timerSpan   = $("lunch-timer");
const statusWrap  = $("lunch-status");
const btnDismiss  = $("btn-lunch-dismiss");
const btnAccept   = $("btn-lunch-accept");
const btnCancel   = $("btn-lunch-cancel");
const acceptedBox = $("lunch-accepted");
const rejectedTxt = $("lunch-rejected");

let currentPollId   = null;
let unsubPoll       = null;
let unsubResp       = null;
let countdownTimer  = null;
let presenceUnsub   = null;

// ✅ 닫은 투표는 다시 자동 표시하지 않도록 (세션 기준)
let dismissedPollId = sessionStorage.getItem("dismissed_poll_id") || null;

const ROOM_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const POLL_DURATION_MS      = 5 * 60 * 1000;

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

async function createPollFromText(raw) {
  const parts = raw.split("_").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) { alert("후보가 필요합니다. 예) @점심메뉴_김밥_라멘"); return; }
  let candidates = parts.slice(1, 1+5);
  candidates = Array.from(new Set(candidates));
  if (!candidates.length) return;

  const since = new Date(Date.now() - ROOM_ONLINE_WINDOW_MS);
  const qPres = query(collection(db, "presence"), where("lastSeen", ">=", since));
  const presSnap = await getDocs(qPres);
  const participants = presSnap.docs.map(d => d.id);
  if (!participants.includes(auth.currentUser.uid)) participants.push(auth.currentUser.uid);

  const existing = await getOpenPoll();
  if (existing) { alert("진행 중인 점심 투표가 있습니다."); return; }

  const expiresAt = new Date(Date.now() + POLL_DURATION_MS);
  const ref = await addDoc(collection(db, "lunch_polls"), {
    creatorUid: auth.currentUser.uid,
    candidates,
    participants,
    activeMenu: null,
    status: "open",
    createdAt: serverTimestamp(),
    expiresAt
  });

  // 새 폴을 생성했으므로 이전에 닫아둔 배너는 무효화
  dismissedPollId = null;
  sessionStorage.removeItem("dismissed_poll_id");

  attachPoll(ref.id);
}

async function getOpenPoll() {
  const qOpen = query(collection(db, "lunch_polls"), where("status", "==", "open"));
  const snap = await getDocs(qOpen);
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

function updateRemaining(remain) {
  remainSpan.textContent = (remain == null)
    ? "수락까지 남은 인원: —명"
    : `수락까지 남은 인원: ${remain}명`;
}

// ✅ 수락/거부 현황 렌더
function renderResponseStats(pollData, responses) {
  // 수락자
  const accepts = responses.filter(r => r.choice === "accept" && r.menu === pollData.activeMenu);
  acceptedBox.innerHTML = "";
  accepts.forEach(r => {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = r.displayName || (r.uid?.slice(0,6) || "사용자");
    acceptedBox.appendChild(b);
  });

  // 거부자 수
  const rejectCount = responses.filter(r => r.choice === "cancel").length;
  rejectedTxt.textContent = `${rejectCount}명이 거부함`;
}

// 응답 평가 + 남은 인원 집계
async function evaluatePoll(pollId, pollData, responses) {
  if (pollData.status !== "open") {
    renderResponseStats(pollData, responses);
    return;
  }

  // 활성 메뉴 미선택 시
  if (!pollData.activeMenu) {
    updateRemaining(null);
    renderResponseStats(pollData, responses);
    // 취소가 들어오면 바로 실패
    if (responses.some(r => r.choice === "cancel")) {
      await updateDoc(doc(db, "lunch_polls", pollId), { status: "failed" });
    }
    return;
  }

  const acceptedSet = new Set(
    responses.filter(r => r.choice === "accept" && r.menu === pollData.activeMenu).map(r => r.uid)
  );
  const remain = (pollData.participants || []).filter(uid => !acceptedSet.has(uid)).length;
  updateRemaining(remain);

  // 거부자 있으면 즉시 실패
  if (responses.some(r => r.choice === "cancel")) {
    await updateDoc(doc(db, "lunch_polls", pollId), { status: "failed" });
    renderResponseStats(pollData, responses);
    return;
  }

  // 전원 수락 시 성공
  const allAccepted = (pollData.participants || []).every(uid => acceptedSet.has(uid));
  if (allAccepted) {
    await updateDoc(doc(db, "lunch_polls", pollId), { status: "success" });
  }

  renderResponseStats(pollData, responses);
}

function renderStatus(text, kind){
  statusWrap.innerHTML = "";
  const msg = document.createElement("div");
  msg.className = `lunch-alert ${kind}`;
  msg.textContent = text;
  statusWrap.prepend(msg);
  btnDismiss.classList.remove("hidden");
}
function clearStatus(){
  statusWrap.innerHTML = "";
  btnDismiss.classList.add("hidden");
}

function attachPoll(pollId) {
  detachPoll();
  currentPollId = pollId;

  const pref = doc(db, "lunch_polls", pollId);
  unsubPoll = onSnapshot(pref, (psnap) => {
    if (!psnap.exists()) { hideBanner(); return; }
    const p = psnap.data();

    // 닫아둔 배너는 계속 숨김
    if (dismissedPollId === pollId) { hideBanner(); return; }

    showBanner(p);
    startCountdown(p.expiresAt);

    if (unsubResp) unsubResp();
    unsubResp = onSnapshot(collection(db, "lunch_polls", pollId, "responses"), (rsnap) => {
      const res = [];
      rsnap.forEach(d => res.push({ uid: d.id, ...d.data() }));
      evaluatePoll(pollId, p, res);
    });

    // 상태 메시지
    if (p.status === "success") {
      renderStatus("점심 메뉴가 결정되었습니다! 🎉", "success");
      stopCountdown();
    } else if (p.status === "failed") {
      renderStatus("취소되어 무효가 되었어요 😢", "failed");
      stopCountdown();
    } else if (p.status === "expired") {
      renderStatus("시간 초과로 종료되었습니다 ⏰", "expired");
      stopCountdown();
    } else {
      clearStatus();
    }
  });
}

function detachPoll() {
  if (unsubPoll) unsubPoll(), unsubPoll=null;
  if (unsubResp) unsubResp(), unsubResp=null;
  stopCountdown();
  currentPollId = null;
  hideBanner();
  clearStatus();
  updateRemaining(null);
  acceptedBox.innerHTML = "";
  rejectedTxt.textContent = "0명이 거부함";
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
    updateRemaining(null);
    acceptedBox.innerHTML = "";
    rejectedTxt.textContent = "0명이 거부함";
  } else {
    candWrap.innerHTML = "";
    activeSpan.textContent = `선택된 메뉴: ${p.activeMenu}`;
    ctaWrap.classList.remove("hidden");
  }
}

// 응답 버튼(이름 포함 저장)
btnAccept.addEventListener("click", async () => {
  if (!currentPollId) return;
  const snap = await getDoc(doc(db,"lunch_polls", currentPollId));
  if (!snap.exists()) return;
  const p = snap.data();
  if (!p.activeMenu) return alert("먼저 메뉴를 선택하세요.");

  await setDoc(doc(db, "lunch_polls", currentPollId, "responses", auth.currentUser.uid), {
    uid: auth.currentUser.uid,
    displayName: auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid,
    choice: "accept",
    menu: p.activeMenu,
    updatedAt: serverTimestamp()
  }, { merge: true });
});

btnCancel.addEventListener("click", async () => {
  if (!currentPollId) return;
  const snap = await getDoc(doc(db,"lunch_polls", currentPollId));
  if (!snap.exists()) return;
  const p = snap.data();

  await setDoc(doc(db, "lunch_polls", currentPollId, "responses", auth.currentUser.uid), {
    uid: auth.currentUser.uid,
    displayName: auth.currentUser.displayName || auth.currentUser.email || auth.currentUser.uid,
    choice: "cancel",
    menu: p.activeMenu || null,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await updateDoc(doc(db, "lunch_polls", currentPollId), { status: "failed" });
});

// 닫기(X) — 이 세션에서는 다시 안 띄움
btnDismiss.addEventListener("click", () => {
  if (currentPollId) {
    dismissedPollId = currentPollId;
    sessionStorage.setItem("dismissed_poll_id", dismissedPollId);
  }
  hideBanner();
});

// 최초 진입 시 열려있는 폴이 있고, 내가 닫지 않은 경우만 붙이기
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  startPresence();
  const open = await getOpenPoll();
  if (open && open.id !== dismissedPollId) attachPoll(open.id);
});

// 외부에서 호출(채팅 커맨드)
window.__lunchCreatePollFromText = createPollFromText;
