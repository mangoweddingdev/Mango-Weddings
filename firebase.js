
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZzFE-yfMs_o-WI_bFL4WOl4zUtN3Ar8g",
  authDomain: "mango-wedding.firebaseapp.com",
  projectId: "mango-wedding",
  storageBucket: "mango-wedding.firebasestorage.app",
  messagingSenderId: "689128729445",
  appId: "1:689128729445:web:e3be95af95a11e31de0f8c",
  measurementId: "G-EZPXKDGT8T"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
