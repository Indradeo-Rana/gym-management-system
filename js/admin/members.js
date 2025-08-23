import {app, auth, db} from "../firebase-config.js"

import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ✅ Elements
const memberList = document.getElementById("memberList");
const addForm = document.getElementById("addMemberForm");

// ✅ Auth & Role Check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/public/login.html";
    return;
  }

  const currentUserDoc = await getDoc(doc(db, "users", user.uid));
  if (!currentUserDoc.exists() || currentUserDoc.data().role !== "admin") {
    alert("Unauthorized access!");
    window.location.href = "/public/login.html";
    return;
  }

  // Load members only if admin
  loadMembers();
});

// ✅ Load Members
async function loadMembers() {
  memberList.innerHTML = "<tr><td colspan='6'>Loading...</td></tr>";
  const snapshot = await getDocs(collection(db, "members"));

  if (snapshot.empty) {
    memberList.innerHTML = "<tr><td colspan='6'>No members found.</td></tr>";
    return;
  }

  let html = "";
  snapshot.forEach(docSnap => {
    const member = docSnap.data();
    html += `
      <tr>
        <td>${member.name}</td>
        <td>${member.email}</td>
        <td>${member.phone}</td>
        <td>${member.plan || "-"}</td>
        <td>${member.age || "-"}</td>
        <td>
          <button class="btn btn-sm btn-danger delete-btn" data-id="${docSnap.id}">Delete</button>
        </td>
      </tr>
    `;
  });

  memberList.innerHTML = html;

  // Attach delete event listeners
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (confirm("Are you sure to delete this member?")) {
        await deleteDoc(doc(db, "members", id));
        alert("🗑 Member deleted");
        loadMembers();
      }
    });
  });
}

// ✅ Add Member
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("memberName").value.trim();
  const email = document.getElementById("memberEmail").value.trim();
  const phone = document.getElementById("memberPhone").value.trim();
  const plan = document.getElementById("memberPlan").value.trim();
  const age = parseInt(document.getElementById("memberAge").value.trim()) || null;

  if (!name || !email || !phone) {
    alert("Please fill all required fields.");
    return;
  }

  try {
  await addDoc(collection(db, "members"), {
    name,
    email,
    phone,
    plan,
    age,
    role: "member",  // ✅ Add role field
    createdAt: serverTimestamp()
  });

  alert("✅ Member added successfully");
  addForm.reset();
  loadMembers();

} catch (err) {
  console.error("❌ Error adding member:", err);
  alert("Error: " + err.message);
}

});