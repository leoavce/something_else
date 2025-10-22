// keeper.js — 알람(토스트) + 탭 전환

// ===== 탭 전환 =====
const $ = (id) => document.getElementById(id);
const tabNotes   = $("tab-notes");
const tabAlarms  = $("tab-alarms");
const notesPanel = $("notes-panel");
const alarmsPanel= $("alarms-panel");

function showNotes(){ tabNotes.classList.add("active"); tabAlarms.classList.remove("active"); notesPanel.classList.remove("hidden"); alarmsPanel.classList.add("hidden"); }
function showAlarms(){ tabAlarms.classList.add("active"); tabNotes.classList.remove("active"); alarmsPanel.classList.remove("hidden"); notesPanel.classList.add("hidden"); }

tabNotes.addEventListener("click", showNotes);
tabAlarms.addEventListener("click", showAlarms);

// ===== 토스트 =====
const toastRoot = $("toast-root");
function toast(title, body){
  const wrap = document.createElement("div");
  wrap.className = "toast";
  wrap.style.position = "relative";
  const h = document.createElement("h4"); h.textContent = title || "알림";
  const p = document.createElement("p");  p.textContent = body || "";
  const x = document.createElement("button"); x.className = "close"; x.textContent = "×";
  x.addEventListener("click", () => wrap.remove());
  wrap.appendChild(x); wrap.appendChild(h); wrap.appendChild(p);
  toastRoot.appendChild(wrap);
  setTimeout(() => { wrap.style.opacity="0"; wrap.style.transition="opacity .25s"; setTimeout(()=>wrap.remove(), 260); }, 5000);
}

// ===== 브라우저 알림(권한 허용 시) =====
async function notify(title, body){
  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") new Notification(title, { body });
      }
    }
  } catch {}
  // 항상 토스트는 띄움
  toast(title, body);
}

// ===== Keeper (알림 스케줄러) =====
let eyeTimer = null, stretchTimer = null, tickerInt = null;

const eyeInput = $("eyeMins");
const stInput  = $("stretchMins");
const ticker   = $("ticker");
const btnStart = $("btnStart");
const btnStop  = $("btnStop");

// 저장된 값 불러오기
(function restore(){
  const eye = Number(localStorage.getItem("keeper_eye_mins") || 20);
  const st  = Number(localStorage.getItem("keeper_stretch_mins") || 60);
  eyeInput.value = Math.max(1, eye);
  stInput.value  = Math.max(1, st);
})();

function log(msg){ /* 필요시 콘솔/서버 로깅 */ }

function startKeeper() {
  const eyeMins = Math.max(1, Number(eyeInput?.value || 20));
  const stMins  = Math.max(1, Number(stInput?.value || 60));
  localStorage.setItem("keeper_eye_mins", String(eyeMins));
  localStorage.setItem("keeper_stretch_mins", String(stMins));

  stopKeeper();
  const loopEye = () => { notify("먼 곳을 바라볼 시간 👀", "개인 설정 간격으로 눈 휴식을 취해보세요."); log("눈 휴식 알림"); eyeTimer = setTimeout(loopEye, eyeMins*60*1000); };
  const loopSt  = () => { notify("스트레칭 시간! 🧘", "잠깐 일어나 몸을 풀어볼까요?"); log("스트레칭 알림"); stretchTimer = setTimeout(loopSt, stMins*60*1000); };

  eyeTimer = setTimeout(loopEye, eyeMins*60*1000);
  stretchTimer = setTimeout(loopSt, stMins*60*1000);

  tick(); tickerInt = setInterval(tick, 1000);
  toast("알림 시작", `눈 ${eyeMins}분 / 스트레칭 ${stMins}분 간격으로 알림합니다.`);
}

function stopKeeper() {
  if (eyeTimer) { clearTimeout(eyeTimer); eyeTimer = null; }
  if (stretchTimer) { clearTimeout(stretchTimer); stretchTimer = null; }
  if (tickerInt) { clearInterval(tickerInt); tickerInt = null; }
  if (ticker) ticker.textContent = "대기 중…";
  toast("알림 정지", "알림이 중단되었습니다.");
}

function tick() {
  const e = Number(eyeInput?.value || 20);
  const s = Number(stInput?.value || 60);
  if (ticker) ticker.textContent = `알림 동작 중 • 눈 ${e}분 / 스트레칭 ${s}분 간격`;
}

btnStart?.addEventListener("click", startKeeper);
btnStop ?.addEventListener("click", stopKeeper);

// (선택) 서비스워커 등록: 알림 클릭 시 창 포커스 (원한다면 사용)
// 파일 루트에 app-sw.js 있으면 활성화됨. 없어도 무시됨.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./app-sw.js').catch(()=>{});
}
