import { auth } from "./firebase_bootstrap.js";
import {
  onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// 요소
const userInfo     = $("user-info");
const userNameSpan = $("user-name");
const authButtons  = $("auth-buttons");
const btnOpenAuth  = $("btn-open-auth");
const btnLogout    = $("btn-logout");

const modal        = $("auth-modal");
const btnCloseAuth = $("btn-close-auth");
const btnSignup    = $("btn-signup");
const btnLogin     = $("btn-login");
const emailInput   = $("auth-email");
const pwInput      = $("auth-password");

// 모달 열고닫기
btnOpenAuth.addEventListener("click", () => { modal.classList.remove("hidden"); modal.setAttribute("aria-hidden","false"); });
btnCloseAuth.addEventListener("click", () => { modal.classList.add("hidden"); modal.setAttribute("aria-hidden","true"); });

btnSignup.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const pw    = pwInput.value;
  if (!email || pw.length < 6) return alert("이메일/비밀번호를 확인하세요(6자 이상)");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    // 표시이름 기본값: 이메일 앞부분
    const display = email.split("@")[0].slice(0,20);
    await updateProfile(cred.user, { displayName: display });
    alert("회원가입 완료");
    modal.classList.add("hidden");
  } catch (e) {
    alert("회원가입 실패: " + (e?.message || e));
  }
});

btnLogin.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const pw    = pwInput.value;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    modal.classList.add("hidden");
  } catch (e) {
    alert("로그인 실패: " + (e?.message || e));
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

// 상태 반영
onAuthStateChanged(auth, (user) => {
  if (user) {
    userNameSpan.textContent = user.displayName || user.email || user.uid;
    userInfo.classList.remove("hidden");
    authButtons.classList.add("hidden");
    window.dispatchEvent(new CustomEvent("auth:ready", { detail: user }));
  } else {
    userInfo.classList.add("hidden");
    authButtons.classList.remove("hidden");
    window.dispatchEvent(new CustomEvent("auth:logout"));
  }
});
