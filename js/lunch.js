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

let currentPollId   = null;
let unsubPoll       = null;
let unsubResp       = null;
let countdownTimer  = null;
let presenceUnsub   = null;

const ROOM_ONLINE_WINDOW_MS = 2 * 60 * 1000; // 최근 2분
const POLL_DURATION_MS      = 5 * 60 * 1000; // 5분

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

// Poll 생성 (채팅 커맨드에서 호출)
async function createPollFromText(raw) {
  // @점심메뉴_김밥_라멘_버거
  const parts = raw.split("_").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) { alert("후보가 필요합니다. 예) @점심메뉴_김밥_라멘"); return; }
  let candidates = parts.slice(1, 1+5);
  candidates = Array.from(new Set(candidates));
  if (!candidates.length) return;

  // 온라인 참가자 수집(최근 2분)
  const since = new Date(Date.now() - ROOM_ONLINE_WINDOW_MS);
  const qPres = query(collection(db, "presence"), where("lastSeen", ">=", since));
  const presSnap = await getDocs(qPres);
  const participants = presSnap.docs.map(d => d.id);
  if (!participants.includes(auth.currentUser.uid)) participants.push(auth.currentUser.uid);

  // 기존 open 폴 있으면 중복 생성 방지
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
  attachPoll(ref.id);
}

// 인덱스 없이 열린 폴 하나 가져오기 (where만, 클라 정렬)
async function getOpenPoll() {
  const qOpen = query(collection(db, "lunch_polls"), where("status", "==", "open"));
  const snap = await getDocs(qOpen);
  const list = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
  return list[0] || null;
}

// 카운트다운
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

// 만료 처리
async function expireIfOpen(pollId) {
  const ref = doc(db, "lunch_polls", pollId);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().status === "open") {
    await updateDoc(ref, { status: "expired" });
  }
}

// 응답 평가(전원 수락/누구든 취소)
async function evaluatePoll(pollId, pollData, responses) {
  if (pollData.status !== "open") return;

  // 남은 인원 계산 표시(활성 메뉴가 없으면 계산 불가)
  if (pollData.activeMenu) {
    const accepted = new Set(
      responses.filter(r => r.choice === "accept" && r.menu === pollData.activeMenu)
               .map(r => r.uid)
    );
    const remain = (pollData.participants || []).filter(uid => !accepted.has(uid)).length;
    updateRemaining(remain);
  } else {
    updateRemaining(null);
  }

  // 취소가 하나라도 있으면 즉시 실패
  if (responses.some(r => r.choice === "cancel")) {
    await updateDoc(doc(db, "lunch_polls", pollId), { status: "failed" });
    return;
  }

  // 전원 수락 체크
  if (!pollData.activeMenu) return;
  const acceptedSet = new Set(
    responses.filter(r => r.choice === "accept" && r.menu === pollData.activeMenu)
             .map(r => r.uid)
  );
  const allAccepted = (pollData.participants || []).every(uid => acceptedSet.has(uid));
  if (allAccepted) {
    await updateDoc(doc(db, "lunch_polls", pollId), { status: "success" });
  }
}

function updateRemaining(remain) {
  if (remain == null) {
    remainSpan.textContent = "수락까지 남은 인원: —명";
    return;
  }
  remainSpan.textContent = `수락까지 남은 인원: ${remain}명`;
}

// UI 구독/표시
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

    // 상태 메시지/닫기 버튼
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
}

function hideBanner(){ banner.classList.add("hidden"); }
function showBanner(p){
  banner.classList.remove("hidden");
  // 후보/CTA 렌더
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
  } else {
    candWrap.innerHTML = "";
    activeSpan.textContent = `선택된 메뉴: ${p.activeMenu}`;
    ctaWrap.classList.remove("hidden");
  }
}

// 상태 메시지/닫기 버튼
function renderStatus(text, kind /* success|failed|expired */){
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

// 수락/취소/닫기 버튼 핸들러
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

// 알림 닫기(배너도 숨김 + 구독 해제)
btnDismiss.addEventListener("click", () => {
  detachPoll(); // 현재 폴 UI 정리
});

// 페이지 진입: 진행 중 폴 연결 + presence 시작
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  startPresence();
  const open = await getOpenPoll();
  if (open) attachPoll(open.id);
});

// 외부에서 호출(채팅 커맨드)
window.__lunchCreatePollFromText = createPollFromText;
