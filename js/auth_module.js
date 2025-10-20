import { auth } from "./firebase_bootstrap.js";
import {
  onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const authModal = document.getElementById('auth-modal');
const btnOpenAuth = document.getElementById('btn-open-auth');
const btnCloseAuth = document.getElementById('btn-close-auth');
const btnSignup = document.getElementById('btn-signup');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userChip = document.getElementById('user-chip');
const userEmail = document.getElementById('user-email');

btnOpenAuth.addEventListener('click', () => authModal.classList.remove('hidden'));
btnCloseAuth.addEventListener('click', () => authModal.classList.add('hidden'));

btnSignup.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const pw = document.getElementById('auth-password').value;
  if (!email || pw.length < 6) return alert('이메일/비밀번호 확인');
  try {
    await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(auth.currentUser, { displayName: email.split('@')[0] });
  } catch (e) { alert(e.message); }
});

btnLogin.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const pw = document.getElementById('auth-password').value;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) { alert(e.message); }
});

btnLogout.addEventListener('click', async () => { await signOut(auth); });

onAuthStateChanged(auth, (user) => {
  if (user) {
    userEmail.textContent = user.email ?? user.uid;
    userChip.classList.remove('hidden');
    document.getElementById('btn-open-auth').classList.add('hidden');
    authModal.classList.add('hidden');
    window.dispatchEvent(new CustomEvent('auth:ready', { detail: user }));
  } else {
    userChip.classList.add('hidden');
    document.getElementById('btn-open-auth').classList.remove('hidden');
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }
});
