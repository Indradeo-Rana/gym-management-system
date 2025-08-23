
import {auth,db, app} from "./firebase-config.js"

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ✅ SIGNUP LOGIC
const signupBtn = document.getElementById("signupBtn");
if (signupBtn) {
  signupBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const fullName = document.getElementById("fName").value.trim();
    const email = document.getElementById("rEmail").value.trim();
    const password = document.getElementById("rPassword").value;
    const role = document.getElementById("role").value;

    if (!fullName || !email || !password || !role) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // ✅ Save user role and basic info in `/users`
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullName,
        email,
        role
      });

      // ✅ Also save in role-specific collection
      if (role === "member") {
        await setDoc(doc(db, "members", user.uid), {
          uid: user.uid,
          fullName,
          email,
          phone: "",
          age: "",
          gender: ""
        });
      } else if (role === "admin") {
        await setDoc(doc(db, "admin", user.uid), {
          uid: user.uid,
          fullName,
          email,
          phone: "",
          createdAt: new Date()
        });
      }

      alert("Registration successful! Please log in.");
      window.location.href = "/login.html";

    } catch (error) {
      console.error("Signup Error:", error.message);
      alert("Signup failed: " + error.message);
    }
  });
}

// ✅ LOGIN LOGIC
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  loginBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      alert("Please enter email and password.");
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // ✅ Get user role from `/users`
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const role = userDoc.data().role;
        redirectToDashboard(role);
      } else {
        alert("User data not found in database.");
      }

    } catch (error) {
      console.error("Login Error:", error.message);
      alert("Login failed: " + error.message);
    }
  });
}

// ✅ Role-based redirection
function redirectToDashboard(role) {
  switch (role) {
    case "admin":
      window.location.href = "/admin/dashboard.html";
      break;
    case "member":
      window.location.href = "/member/dashboard.html";
      break;
    case "trainer":
      window.location.href = "/trainer/dashboard.html";
      break;
    case "user":
    default:
      window.location.href = "/user/dashboard.html";
  }
}