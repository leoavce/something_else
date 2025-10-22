import { auth } from "./firebase_bootstrap.js";
import {
  onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const $ = (id) => document.getElementById(id);

const form   = $("auth-form");
const email  = $("auth-email");
const pass   = $("auth-password");
const btnUp  = $("btn-signup");
const btnIn  = $("btn-login");
const msg    = $("auth-msg");

function setMsg(text, good = false) {
  msg.textContent = text || "";
  msg.style.color = good ? "#065f46" : "#b91c1c";
}

function friendly(e) {
  const code = e?.code || "";
  if (code.includes("invalid-credential")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (code.includes("user-not-found"))    return "가입되지 않은 이메일입니다.";
  if (code.includes("wrong-password"))    return "비밀번호가 올바르지 않습니다.";
  if (code.includes("too-many-requests")) return "요청이 많습니다. 잠시 후 다시 시도하세요.";
  if (code.includes("network-request-failed")) return "네트워크 오류입니다. 연결을 확인하세요.";
  return e?.message || "오류가 발생했습니다.";
}

async function run(btn, fn) {
  try {
    btn.disabled = true;
    setMsg("");
    await fn();
  } catch (e) {
    setMsg(friendly(e), false);
  } finally {
    btn.disabled = false;
  }
}

btnUp.addEventListener("click", () =>
  run(btnUp, async () => {
    const em = email.value.trim();
    const pw = pass.value;
    if (!em || pw.length < 6) throw new Error("이메일/비밀번호(6자 이상)를 확인하세요.");
    const cred = await createUserWithEmailAndPassword(auth, em, pw);
    const display = em.split("@")[0].slice(0, 20);
    await updateProfile(cred.user, { displayName: display });
    setMsg("회원가입 완료! 자동 로그인됩니다.", true);
    location.replace("./index.html");
  })
);

btnIn.addEventListener("click", () =>
  run(btnIn, async () => {
    const em = email.value.trim();
    const pw = pass.value;
    await signInWithEmailAndPassword(auth, em, pw);
    setMsg("로그인 성공", true);
    location.replace("./index.html");
  })
);

// Enter로 로그인
form.addEventListener("submit", (e) => {
  e.preventDefault();
  btnIn.click();
});

// 이미 로그인 상태면 바로 앱으로
onAuthStateChanged(auth, (user) => {
  if (user) location.replace("./index.html");
});
