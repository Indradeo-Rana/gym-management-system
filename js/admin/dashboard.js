//  Firebase Imports
import {app, auth, db} from "../firebase-config.js"
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


// 🔒 Auth check + role check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (!userDoc.exists() || userDoc.data().role !== "admin") {
    alert("Unauthorized Access!");
    signOut(auth);
    window.location.href = "/login.html";
    return;
  }

  // Load dashboard stats on first load
  loadDashboardStats();
});

// 📊 Load Dashboard Summary
async function loadDashboardStats() {
  const memberSnap = await getDocs(collection(db, "members"));
  const billsSnap = await getDocs(collection(db, "bills"));
  const packagesSnap = await getDocs(collection(db, "feePackages"));

  const totalIncome = Array.from(billsSnap.docs).reduce((acc, bill) => {
    return acc + (Number(bill.data().amount) || 0);
  }, 0);

  const content = `
    <div class="row g-3">
      <div class="col-md-3"><div class="card text-center"><div class="card-body">
        <h5>Total Members</h5><p class="fs-3 fw-bold text-primary">${memberSnap.size}</p>
      </div></div></div>

      <div class="col-md-3"><div class="card text-center"><div class="card-body">
        <h5>Total Income</h5><p class="fs-3 fw-bold text-success">₹${totalIncome}</p>
      </div></div></div>

      <div class="col-md-3"><div class="card text-center"><div class="card-body">
        <h5>Fee Packages</h5><p class="fs-3 fw-bold text-warning">${packagesSnap.size}</p>
      </div></div></div>

      <div class="col-md-3"><div class="card text-center"><div class="card-body">
        <h5>Bills</h5><p class="fs-3 fw-bold text-danger">${billsSnap.size}</p>
      </div></div></div>
    </div>
  `;
  document.getElementById("mainContent").innerHTML = content;
}

// 🔄 Sidebar Navigation & Module Loader
document.querySelectorAll(".sidebar a").forEach(link => {
  link.addEventListener("click", async (e) => {
    e.preventDefault();

    // Toggle active state
    document.querySelectorAll(".sidebar a").forEach(l => l.classList.remove("active"));
    link.classList.add("active");

    const page = link.getAttribute("data-page");

    if (page === "dashboard") {
      loadDashboardStats();
    } else {
      // Load HTML
      const res = await fetch(`/admin/modules/${page}.html`);
      const html = await res.text();
      document.getElementById("mainContent").innerHTML = html;

      // Load respective JS after HTML
      const script = document.createElement("script");
      script.type = "module";
      script.src = `/js/admin/${page}.js`;
      document.body.appendChild(script);
    }
  });
});

// 🚪 Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  alert("Are you sure to Logout..")
  signOut(auth).then(() => window.location.href = "/index.html");
});
