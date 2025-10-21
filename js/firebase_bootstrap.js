// Firebase v10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** 🔧 본인 Firebase 설정으로 교체하세요 */
const firebaseConfig = {
  apiKey: "AIzaSyAzu2nWLELxL6fbK9xP1y9VcHECMGnx4pc",
  authDomain: "messenger-c6be1.firebaseapp.com",
  projectId: "messenger-c6be1",
  appId: "1:160967686629:web:98213b58604f3cec57170c",
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
