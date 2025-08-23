import {app,auth, db, storage} from "../firebase-config.js"
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  limit,
  startAfter,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// DOM Elements
const supplementForm = document.getElementById("supplementForm");
const nameInput = document.getElementById("name");
const priceInput = document.getElementById("price");
const categorySelect = document.getElementById("category");
const stockInput = document.getElementById("stock");
const descriptionInput = document.getElementById("description");
const imageInput = document.getElementById("supplementImage");
const supplementList = document.getElementById("supplementList");
const filterCategory = document.getElementById("filterCategory");
const supplementCount = document.getElementById("supplementCount");
const pagination = document.getElementById("pagination");
const submitBtnText = document.getElementById("submitBtnText");
const submitBtnSpinner = document.getElementById("submitBtnSpinner");

// Data Stores
let lastVisibleDoc = null;
const itemsPerPage = 10;
let currentPage = 1;
let totalSupplements = 0;
let unsubscribeSupplements = null;

// Auth Check
onAuthStateChanged(auth, async (user) => {
  // No user signed in
  if (!user) {
    console.log("No authenticated user - redirecting to login");
    window.location.href = "/public/login.html";
    return;
  }

  try {
    console.log(
      `Authenticated user detected (UID: ${user.uid}), verifying admin access...`
    );

    // 1. Get user document from Firestore
    const userDocRef = doc(db, "users", user.uid);
    const userDocSnap = await getDoc(userDocRef);

    // 2. Check if document exists
    if (!userDocSnap.exists()) {
      console.error("User document does not exist in Firestore");
      alert("Your account is not properly configured. Please contact support.");
      await signOut(auth);
      window.location.href = "/public/login.html";
      return;
    }

    // 3. Check admin role
    const userData = userDocSnap.data();
    if (userData.role !== "admin") {
      console.log("User does not have admin privileges - redirecting");
      alert("Access Denied: Administrator privileges required");
      await signOut(auth);
      window.location.href = "/public/login.html";
      return;
    }

    console.log("Admin access confirmed - loading supplements system");

    // 4. Load application data
    loadSupplements();
    setupRealTimeCount();
  } catch (error) {
    console.error("Authentication process failed:", {
      code: error.code || "unknown",
      message: error.message,
      stack: error.stack,
    });

    // User-friendly error messages
    let errorMessage = "Error verifying your credentials";
    if (error.code === "permission-denied") {
      errorMessage = "Database access denied. Please try again later.";
    } else if (error.code === "unavailable") {
      errorMessage = "Network error. Please check your internet connection.";
    }

    alert(`${errorMessage} [${error.code || "unknown"}]`);

    // Attempt to sign out
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error("Failed to sign out:", signOutError);
    }

    // Redirect to login
    window.location.href = "/public/login.html";
  }
});

// Load Supplements with Pagination
async function loadSupplements() {
  try {
    supplementList.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </td>
      </tr>
    `;

    // Build query
    let q = query(
      collection(db, "supplements"),
      orderBy("createdAt", "desc"),
      limit(itemsPerPage)
    );

    if (filterCategory.value !== "all") {
      q = query(q, where("category", "==", filterCategory.value));
    }

    if (currentPage > 1 && lastVisibleDoc) {
      q = query(q, startAfter(lastVisibleDoc));
    }

    const querySnapshot = await getDocs(q);

    // Update last visible document for pagination
    if (querySnapshot.docs.length > 0) {
      lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
    }

    // Render supplements
    let html = "";
    querySnapshot.forEach((doc) => {
      const supplement = doc.data();

      html += `
        <tr>
          <td>
            <div class="d-flex align-items-center">
              ${
                supplement.imageUrl
                  ? `
                <img src="${supplement.imageUrl}" alt="${supplement.name}" 
                  class="rounded me-3" style="width: 50px; height: 50px; object-fit: cover;">
              `
                  : `
                <div class="bg-light rounded me-3 d-flex align-items-center justify-content-center" 
                  style="width: 50px; height: 50px;">
                  <i class="bi bi-capsule text-muted"></i>
                </div>
              `
              }
              <div>
                <strong>${supplement.name}</strong>
                ${
                  supplement.description
                    ? `<div class="text-muted small">${supplement.description.substring(
                        0,
                        50
                      )}${
                        supplement.description.length > 50 ? "..." : ""
                      }</div>`
                    : ""
                }
              </div>
            </div>
          </td>
          <td>₹${supplement.price.toFixed(2)}</td>
          <td>
            <span class="badge ${getCategoryBadgeClass(supplement.category)}">
              ${supplement.category}
            </span>
          </td>
          <td>
            <span class="badge ${
              supplement.stock > 0 ? "bg-success" : "bg-danger"
            }">
              ${supplement.stock} in stock
            </span>
          </td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="viewSupplement('${
              doc.id
            }')">
              <i class="bi bi-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteSupplement('${
              doc.id
            }')">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });

    supplementList.innerHTML =
      html ||
      `
      <tr>
        <td colspan="5" class="text-center py-4">No supplements found</td>
      </tr>
    `;

    // Update pagination
    updatePagination();
  } catch (error) {
    console.error("Error loading supplements:", error);
    supplementList.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-danger">Error loading supplements</td>
      </tr>
    `;
  }
}

// Add New Supplement
supplementForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value);
  const category = categorySelect.value;
  const stock = parseInt(stockInput.value);
  const description = descriptionInput.value.trim();
  const image = imageInput.files[0];

  if (!name || isNaN(price) || !category || isNaN(stock)) {
    alert("Please fill all required fields with valid values");
    return;
  }

  try {
    // Show loading state
    submitBtnText.classList.add("d-none");
    submitBtnSpinner.classList.remove("d-none");
    supplementForm.querySelector("button").disabled = true;

    // Upload image if exists
    let imageUrl = "";
    if (image) {
      const storageRef = ref(
        storage,
        `supplements/${Date.now()}_${image.name}`
      );
      const snapshot = await uploadBytes(storageRef, image);
      imageUrl = await getDownloadURL(snapshot.ref);
    }

    // Create supplement
    await addDoc(collection(db, "supplements"), {
      name,
      price,
      category,
      stock,
      description,
      imageUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Reset form
    supplementForm.reset();
    alert("Supplement added successfully!");

    // Reload supplements
    currentPage = 1;
    loadSupplements();
  } catch (error) {
    console.error("Error adding supplement:", error);
    alert(`Failed to add supplement: ${error.message}`);
  } finally {
    // Reset button state
    submitBtnText.classList.remove("d-none");
    submitBtnSpinner.classList.add("d-none");
    supplementForm.querySelector("button").disabled = false;
  }
});

// Setup real-time supplement count
function setupRealTimeCount() {
  const q = query(collection(db, "supplements"));

  getCountFromServer(q).then((snapshot) => {
    totalSupplements = snapshot.data().count;
    updateSupplementCount();
  });

  // Update count when supplements change
  unsubscribeSupplements = onSnapshot(q, (snapshot) => {
    totalSupplements = snapshot.size;
    updateSupplementCount();
  });
}

function updateSupplementCount() {
  supplementCount.textContent = `Showing ${Math.min(
    itemsPerPage,
    totalSupplements
  )} of ${totalSupplements} supplements`;
}

function updatePagination() {
  const totalPages = Math.ceil(totalSupplements / itemsPerPage);
  pagination.innerHTML = "";

  if (totalPages <= 1) return;

  // Previous button
  const prevLi = document.createElement("li");
  prevLi.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
  prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous">&laquo;</a>`;
  prevLi.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage > 1) {
      currentPage--;
      loadSupplements();
    }
  });
  pagination.appendChild(prevLi);

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    const li = document.createElement("li");
    li.className = `page-item ${currentPage === i ? "active" : ""}`;
    li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
    li.addEventListener("click", (e) => {
      e.preventDefault();
      currentPage = i;
      loadSupplements();
    });
    pagination.appendChild(li);
  }

  // Next button
  const nextLi = document.createElement("li");
  nextLi.className = `page-item ${
    currentPage === totalPages ? "disabled" : ""
  }`;
  nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next">&raquo;</a>`;
  nextLi.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage < totalPages) {
      currentPage++;
      loadSupplements();
    }
  });
  pagination.appendChild(nextLi);
}

// Filter supplements by category
filterCategory.addEventListener("change", () => {
  currentPage = 1;
  lastVisibleDoc = null;
  loadSupplements();
});

// Helper functions
function getCategoryBadgeClass(category) {
  switch (category) {
    case "Protein":
      return "bg-primary";
    case "Pre-Workout":
      return "bg-warning text-dark";
    case "BCAA":
      return "bg-info text-dark";
    case "Vitamins":
      return "bg-success";
    default:
      return "bg-secondary";
  }
}

// Global functions
window.viewSupplement = async (id) => {
  const docSnap = await getDoc(doc(db, "supplements", id));
  if (docSnap.exists()) {
    const supplement = docSnap.data();
    let message = `Product: ${supplement.name}\n\n`;
    message += `Price: ₹${supplement.price.toFixed(2)}\n\n`;
    message += `Category: ${supplement.category}\n\n`;
    message += `Stock: ${supplement.stock}\n\n`;
    message += `Description: ${supplement.description || "N/A"}\n\n`;
    message += `Added On: ${
      supplement.createdAt?.toDate().toLocaleString() || "N/A"
    }`;

    if (supplement.imageUrl) {
      message += `\n\nImage: ${supplement.imageUrl}`;
    }

    alert(message);
  } else {
    alert("Supplement not found");
  }
};

window.deleteSupplement = async (id) => {
  if (confirm("Are you sure you want to delete this supplement?")) {
    try {
      await deleteDoc(doc(db, "supplements", id));
      alert("Supplement deleted successfully");
      loadSupplements();
    } catch (error) {
      console.error("Error deleting supplement:", error);
      alert("Failed to delete supplement");
    }
  }
};

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (unsubscribeSupplements) {
    unsubscribeSupplements();
  }
});
 