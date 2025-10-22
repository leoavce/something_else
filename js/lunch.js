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

// 닫은 투표는 같은 세션에서 다시 자동 표시하지 않도록 메모
let dismissedPollId = sessionStorage.getItem("dismissed_poll_id") || null;

const ROOM_ONLINE_WINDOW_MS = 2 * 60 * 1000; // 최근 2분
const POLL_DURATION_MS      = 5 * 60 * 1000; // 5분

/* ========= Presence ========= */
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

/* ========= Poll 생성 ========= */
// 채팅 입력 "@점심메뉴_김밥_라멘_버거" → 이 함수 호출
async function createPollFromText(raw) {
  const parts = raw.split("_").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) { alert("후보가 필요합니다. 예) @점심메뉴_김밥_라멘"); return; }
  let candidates = parts.slice(1, 1+5);
  candidates = Array.from(new Set(candidates));
  if (!candidates.length) return;

  // 최근 2분 내 활동자(online 추정) → participants
  const since = new Date(Date.now() - ROOM_ONLINE_WINDOW_MS);
  const qPres = query(collection(db, "presence"), where("lastSeen", ">=", since));
  const presSnap = await getDocs(qPres);
  const participants = presSnap.docs.map(d => d.id);
  if (!participants.includes(auth.currentUser.uid)) participants.push(auth.currentUser.uid);

  // 열린 폴이 이미 있으면 생성 차단
  const existing = await getOpenPoll();
  if (existing) { alert("진행 중인 점심 투표가 있습니다."); return; }

  const expiresAt = new Date(Date.now() + POLL_DURATION_MS);
  const ref = await addDoc(collection(db, "lunch_polls"), {
    creatorUid: auth.currentUser.uid,
    candidates,
    participants,
    activeMenu: null,
    status: "open",       // open | success | failed | expired
    createdAt: serverTimestamp(),
    expiresAt
  });

  // 새 폴 생성 시, 이전에 닫아둔 배너 상태 초기화
  dismissedPollId = null;
  sessionStorage.removeItem("dismissed_poll_id");

  attachPoll(ref.id);
}

// 인덱스 없이: where('status'=='open')만 사용 → 클라에서 createdAt 내림차순 정렬
async function getOpenPoll() {
  const qOpen = query(collection(db, "lunch_polls"), where("status", "==", "open"));
  const snap = await getDocs(qOpen);
  const list = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
  return list[0] || null;
}

/* ========= 타이머 ========= */
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

/* ========= 남은 인원/현황 ========= */
function updateRemaining(remain) {
  remainSpan.textContent = (remain == null)
    ? "수락까지 남은 인원: —명"
    : `수락까지 남은 인원: ${remain}명`;
}

function renderResponseStats(pollData, responses) {
  // 수락자(현재 활성 메뉴 기준)
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

/* ========= 평가(상태 전환: 생성자만 시도) ========= */
async function evaluatePoll(pollId, pollData, responses) {
  if (pollData.status !== "open") {
    renderResponseStats(pollData, responses);
    return;
  }

  // 활성 메뉴가 없으면 남은 인원 계산 불가
  if (!pollData.activeMenu) {
    updateRemaining(null);
    renderResponseStats(pollData, responses);
    // 거부가 들어오면 실패 (생성자만 상태 변경 시도)
    if (responses.some(r => r.choice === "cancel")) {
      if (auth.currentUser?.uid === pollData.creatorUid) {
        await updateDoc(doc(db, "lunch_polls", pollId), { status: "failed" });
      }
    }
    return;
  }

  const acceptedSet = new Set(
    responses.filter(r => r.choice === "accept" && r.menu === pollData.activeMenu).map(r => r.uid)
  );
  const remain = (pollData.participants || []).filter(uid => !acceptedSet.has(uid)).length;
  updateRemaining(remain);

  // 거부자 있으면 즉시 실패 (생성자만)
  if (responses.some(r => r.choice === "cancel")) {
    if (auth.currentUser?.uid === pollData.creatorUid) {
      await updateDoc(doc(db, "lunch_polls", pollId), { status: "failed" });
    }
    renderResponseStats(pollData, responses);
    return;
  }

  // 전원 수락 시 성공 (생성자만)
  const allAccepted = (pollData.participants || []).every(uid => acceptedSet.has(uid));
  if (allAccepted) {
    if (auth.currentUser?.uid === pollData.creatorUid) {
      await updateDoc(doc(db, "lunch_polls", pollId), { status: "success" });
    }
  }

  renderResponseStats(pollData, responses);
}

/* ========= 상태 메시지 ========= */
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

/* ========= 구독/표시 ========= */
function attachPoll(pollId) {
  detachPoll();
  currentPollId = pollId;

  const pref = doc(db, "lunch_polls", pollId);
  unsubPoll = onSnapshot(pref, (psnap) => {
    if (!psnap.exists()) { hideBanner(); return; }
    const p = psnap.data();

    // 사용자가 닫은 배너면 표시하지 않음
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
        // 후보 선택은 참가자 또는 생성자만
        if (!(p.participants?.includes(auth.currentUser.uid) || auth.currentUser?.uid === p.creatorUid)) {
          alert("참여자만 선택할 수 있습니다."); return;
        }
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

/* ========= 사용자 입력 ========= */
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

  // 상태 전환은 생성자만 시도(권한 에러 방지)
  if (auth.currentUser?.uid === p.creatorUid) {
    await updateDoc(doc(db, "lunch_polls", currentPollId), { status: "failed" });
  }
});

// 닫기(X): 이 세션에서는 다시 자동 표시하지 않음
btnDismiss.addEventListener("click", () => {
  if (currentPollId) {
    dismissedPollId = currentPollId;
    sessionStorage.setItem("dismissed_poll_id", dismissedPollId);
  }
  hideBanner();
});

/* ========= 초기 진입 ========= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  startPresence();
  const open = await getOpenPoll();
  if (open && open.id !== dismissedPollId) attachPoll(open.id);
});

// 외부에서 호출(채팅 커맨드 훅)
window.__lunchCreatePollFromText = createPollFromText;
