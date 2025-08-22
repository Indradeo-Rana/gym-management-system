// profile.js
import { auth, db } from "../firebase-config.js";  

import {  
  onAuthStateChanged  
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";  

import {  
  collection, query, where, getDocs  
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  console.log("🔑 Logged in UID:", user.uid);
  console.log("📧 Logged in Email:", user.email);

  try {
  // ✅ Correct query - decide whether to use UID or email
  const q = query(
    collection(db, "members"),
    where("email", "==", user.email)   // OR use ("memberId", "==", user.uid) if you stored UID
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    console.warn("⚠️ No member found for this user:", user.email);
    alert("⚠️ Profile not found. Please contact admin.");
    
    // Show "Not Found" in UI
    profileName.textContent = "Not Found";
    profileEmail.textContent = user.email || "-";
    profilePhone.textContent = "-";
    profilePlan.textContent = "-";
    profileAge.textContent = "-";
    profileJoinDate.textContent = "-";
    return;
  }

  // ✅ Agar record mil gaya to loop through
  snapshot.forEach((doc) => {
    const memberData = doc.data();
    console.log("📄 Member Data:", memberData);

    // Populate profile
    profileName.textContent = memberData.name || "-";
    profileEmail.textContent = memberData.email || "-";
    profilePhone.textContent = memberData.phone || "-";
    profilePlan.textContent = memberData.plan || "Not Assigned";
    profileAge.textContent = memberData.age || "-";
    profileJoinDate.textContent =
      memberData.createdAt?.toDate().toLocaleDateString() || "-";
  });

} catch (error) {
  console.error("❌ Error loading profile:", error);
  alert("⚠️ Failed to load profile data.");
}

});

// onAuthStateChanged(auth, async (user) => {
//   if (!user) {
//     window.location.href = "/login.html";
//     return;
//   }

//   try {
//     const q = query(
//       collection(db, "members"),
//       where("memberId", "==", user.uid)
//     );
//     const snapshot = await getDocs(q);

//     if (snapshot.empty) {
//       alert("⚠️ You are not registered as a Member. Please contact Admin.");
//       await signOut(auth);  // logout user
//       window.location.href = "/login.html";
//       return;
//     }

//     // ✅ Agar record mil gaya to Member Dashboard dikhao
//     const memberData = snapshot.docs[0].data();
//     console.log("📄 Member Data:", memberData);

//     // Populate Member Profile
//     profileName.textContent = memberData.fullName || "-";
//     profileEmail.textContent = memberData.email || "-";
//     profilePlan.textContent = memberData.plan || "Not Assigned";
//     // etc...

//   } catch (error) {
//     console.error("❌ Error loading member profile:", error);
//     alert("Failed to verify membership.");
//      window.location.href = "/login.html";
//   }
// });

