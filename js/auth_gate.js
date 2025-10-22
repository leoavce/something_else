import { auth } from "./firebase_bootstrap.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const appRoot   = document.getElementById("app-root");
const userName  = document.getElementById("user-name");
const btnLogout = document.getElementById("btn-logout");

// 로그인 안 되어 있으면 auth.html로
onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.replace("./auth.html");
    return;
  }
  userName.textContent = user.displayName || user.email || user.uid;
  appRoot.classList.remove("hidden");
  window.dispatchEvent(new CustomEvent("auth:ready", { detail: user }));
});

btnLogout.addEventListener("click", async () => {
  try { await signOut(auth); } finally { location.replace("./auth.html"); }
});
