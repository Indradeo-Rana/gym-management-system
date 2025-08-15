import {app, auth, db} from "../firebase-config.js"
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc, // Add this import
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut // Add this import for proper sign out
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// DOM elements
const feeList = document.getElementById("feeList");
const addFeeForm = document.getElementById("addFeeForm");

// Check authentication and admin role
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log("No user signed in - redirecting to login");
    window.location.href = "/login.html";
    return;
  }

  try {
    console.log("Checking admin status for user:", user.uid);
    
    // Get user document reference
    const userDocRef = doc(db, "users", user.uid);
    
    // Get the document snapshot
    const userDocSnap = await getDoc(userDocRef);
    
    if (!userDocSnap.exists()) {
      console.error("User document not found");
      alert("Your account is not properly configured. Please contact support.");
      await signOut(auth);
      window.location.href = "/login.html";
      return;
    }

    const userData = userDocSnap.data();
    console.log("User data retrieved:", userData);
    
    if (!userData.role) {
      console.error("Role field missing in user document");
      alert("Your account is missing required information. Please contact support.");
      await signOut(auth);
      window.location.href = "/login.html";
      return;
    }

    if (userData.role !== "admin") {
      console.log("Non-admin user detected - redirecting");
      alert("Access denied. Administrator privileges required.");
      window.location.href = "/member-dashboard.html";
      return;
    }

    console.log("Admin access granted - loading packages");
    loadFeePackages();
    setupRealTimeUpdates();

  } catch (error) {
    console.error("Detailed authentication error:", {
      name: error.name,
      code: error.code,
      message: error.message,
      stack: error.stack
    });

    let errorMessage = "Error verifying your access";
    if (error.code === 'permission-denied') {
      errorMessage = "Database permissions error. Please try again later.";
    } else if (error.code === 'unavailable') {
      errorMessage = "Network error. Please check your internet connection.";
    } else {
      errorMessage = error.message || error.toString();
    }
    
    alert(`${errorMessage}`);
    
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error("Sign out failed:", signOutError);
    }
    
    window.location.href = "/login.html";
  }
});

// Load fee packages
async function loadFeePackages() {
  try {
    feeList.innerHTML = '<tr><td colspan="4" class="text-center">Loading packages...</td></tr>';
    
    const q = query(collection(db, "feePackages"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      feeList.innerHTML = '<tr><td colspan="4" class="text-center">No packages found. Add your first package!</td></tr>';
      return;
    }

    let html = '';
    querySnapshot.forEach((doc) => {
      const packageData = doc.data();
      html += `
        <tr>
          <td>${packageData.name}</td>
          <td>₹${packageData.price.toLocaleString()}</td>
          <td>${packageData.createdAt?.toDate().toLocaleDateString() || 'N/A'}</td>
          <td class="action-btns">
            <button class="btn btn-sm btn-danger" onclick="deletePackage('${doc.id}')">Delete</button>
          </td>
        </tr>
      `;
    });

    feeList.innerHTML = html;
  } catch (error) {
    console.error("Error loading packages:", error);
    feeList.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error loading packages. Please refresh.</td></tr>';
  }
}

// Set up real-time updates
function setupRealTimeUpdates() {
  const q = query(collection(db, "feePackages"), orderBy("createdAt", "desc"));
  
  onSnapshot(q, (snapshot) => {
    let html = '';
    snapshot.forEach((doc) => {
      const packageData = doc.data();
      html += `
        <tr>
          <td>${packageData.name}</td>
          <td>₹${packageData.price.toLocaleString()}</td>
          <td>${packageData.createdAt?.toDate().toLocaleDateString() || 'N/A'}</td>
          <td class="action-btns">
            <button class="btn btn-sm btn-danger" onclick="deletePackage('${doc.id}')">Delete</button>
          </td>
        </tr>
      `;
    });

    if (html === '') {
      html = '<tr><td colspan="4" class="text-center">No packages found. Add your first package!</td></tr>';
    }

    feeList.innerHTML = html;
  });
}

// Add new package
addFeeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const name = document.getElementById("packageName").value.trim();
  const price = parseFloat(document.getElementById("packagePrice").value.trim());

  if (!name || isNaN(price) || price <= 0) {
    alert("Please enter valid package name and price (must be greater than 0)");
    return;
  }

  try {
    const addButton = addFeeForm.querySelector("button[type='submit']");
    addButton.disabled = true;
    addButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';

    await addDoc(collection(db, "feePackages"), {
      name,
      price,
      createdAt: serverTimestamp()
    });

    // Reset form
    addFeeForm.reset();
    addButton.disabled = false;
    addButton.textContent = "Add Package";
  } catch (error) {
    console.error("Error adding package:", error);
    alert("Failed to add package. Please try again.");
    addFeeForm.querySelector("button[type='submit']").disabled = false;
    addFeeForm.querySelector("button[type='submit']").textContent = "Add Package";
  }
});

// Delete package (attached to window for HTML onclick)
window.deletePackage = async (packageId) => {
  if (!confirm("Are you sure you want to delete this package?")) return;

  try {
    await deleteDoc(doc(db, "feePackages", packageId));
    // No need to alert here - the real-time update will show the change
  } catch (error) {
    console.error("Error deleting package:", error);
    alert("Failed to delete package. Please try again.");
  }
};