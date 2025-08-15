import {app, auth, db, storage} from "../firebase-config.js"
import { 
  getFirestore, collection, addDoc, deleteDoc, doc,
  getDocs, getDoc, query, where, orderBy, serverTimestamp,
  onSnapshot, limit, startAfter, getCountFromServer, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// DOM Elements
const dietForm = document.getElementById("dietForm");
const dietMember = document.getElementById("dietMember");
const planType = document.getElementById("planType");
const planDetails = document.getElementById("planDetails");
const dietAttachment = document.getElementById("dietAttachment");
const dietList = document.getElementById("dietList");
const filterType = document.getElementById("filterType");
const dietPlanCount = document.getElementById("dietPlanCount");
const pagination = document.getElementById("pagination");
const submitBtnText = document.getElementById("submitBtnText");
const submitBtnSpinner = document.getElementById("submitBtnSpinner");

// Data Stores
let membersData = {};
let lastVisibleDoc = null;
const itemsPerPage = 10;
let currentPage = 1;
let totalDietPlans = 0;
let unsubscribeDietPlans = null;

// Auth Check
onAuthStateChanged(auth, async (user) => {
  // No user signed in
  if (!user) {
    console.log("No authenticated user - redirecting to login");
    window.location.href = "/public/login.html";
    return;
  }

  try {
    console.log(`Authenticated user detected (UID: ${user.uid}), verifying admin access...`);
    
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

    console.log("Admin access confirmed - loading diet plans system");
    
    // 4. Load application data
    await Promise.all([
      loadMembers(),
      loadDietPlans()
    ]);
    setupTemplateButtons();
    setupRealTimeCount();

  } catch (error) {
    console.error("Authentication process failed:", {
      code: error.code || 'unknown',
      message: error.message,
      stack: error.stack
    });

    // User-friendly error messages
    let errorMessage = "Error verifying your credentials";
    if (error.code === 'permission-denied') {
      errorMessage = "Database access denied. Please try again later.";
    } else if (error.code === 'unavailable') {
      errorMessage = "Network error. Please check your internet connection.";
    }

    alert(`${errorMessage} [${error.code || 'unknown'}]`);
    
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
// Load Members with Proper Names
async function loadMembers() {
  try {
    dietMember.innerHTML = '<option value="" selected disabled>Loading members...</option>';
    const querySnapshot = await getDocs(collection(db, "members"));
    
    membersData = {};
    dietMember.innerHTML = '<option value="" selected disabled>Select member</option>';
    
    querySnapshot.forEach(doc => {
      const member = doc.data();
      membersData[doc.id] = {
        id: doc.id,
        name: member.fullName || member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim(),
        ...member
      };
      
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = membersData[doc.id].name;
      dietMember.appendChild(option);
    });
    
    if (querySnapshot.empty) {
      dietMember.innerHTML = '<option value="" selected disabled>No members found</option>';
    }
    
  } catch (error) {
    console.error("Error loading members:", error);
    dietMember.innerHTML = '<option value="" selected disabled>Error loading members</option>';
  }
}

// Setup Template Buttons
function setupTemplateButtons() {
  document.querySelectorAll(".template-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      const type = this.getAttribute("data-type");
      planType.value = type;
      
      switch(type) {
        case "weight_loss":
          planDetails.value = `Weight Loss Plan\n\n- Caloric Deficit: 300-500 kcal below maintenance\n- Protein: 2.2g per kg of body weight\n- Carbs: 30-40% of calories\n- Fats: 20-30% of calories\n- 5-6 small meals per day\n- Emphasis on lean proteins and vegetables`;
          break;
        case "muscle_gain":
          planDetails.value = `Muscle Gain Plan\n\n- Caloric Surplus: 200-300 kcal above maintenance\n- Protein: 2.5g per kg of body weight\n- Carbs: 40-50% of calories\n- Fats: 20-30% of calories\n- Pre/Post workout nutrition focus\n- Balanced macros with whole foods`;
          break;
        case "maintenance":
          planDetails.value = `Maintenance Plan\n\n- Maintenance calories\n- Protein: 1.8-2.2g per kg of body weight\n- Flexible macronutrient distribution\n- Balanced whole food diet\n- 3-5 meals per day\n- 80% whole foods, 20% flexible`;
          break;
      }
    });
  });
}

// Submit Diet Plan
dietForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const memberId = dietMember.value;
  const type = planType.value;
  const details = planDetails.value.trim();
  const attachment = dietAttachment.files[0];
  
  if (!memberId || !type || !details) {
    alert("Please fill all required fields");
    return;
  }

  try {
    // Show loading state
    submitBtnText.classList.add("d-none");
    submitBtnSpinner.classList.remove("d-none");
    dietForm.querySelector("button").disabled = true;
    
    // Upload attachment if exists
    let attachmentUrl = "";
    if (attachment) {
      const storageRef = ref(storage, `diet-plans/${Date.now()}_${attachment.name}`);
      const snapshot = await uploadBytes(storageRef, attachment);
      attachmentUrl = await getDownloadURL(snapshot.ref);
    }
    
    // Create diet plan
    const dietPlanData = {
      memberId,
      memberName: membersData[memberId]?.name || `Member ${memberId.substring(0, 5)}`,
      type,
      details,
      attachmentUrl,
      assignedBy: auth.currentUser.uid,
      assignedAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    };
    
    await addDoc(collection(db, "dietPlans"), dietPlanData);
    
    // Reset form
    dietForm.reset();
    alert("Diet plan assigned successfully!");
    
    // Reload diet plans
    currentPage = 1;
    loadDietPlans();
    
  } catch (error) {
    console.error("Error assigning diet plan:", error);
    alert(`Failed to assign diet plan: ${error.message}`);
    
  } finally {
    // Reset button state
    submitBtnText.classList.remove("d-none");
    submitBtnSpinner.classList.add("d-none");
    dietForm.querySelector("button").disabled = false;
  }
});

// Load Diet Plans with Pagination
async function loadDietPlans() {
  try {
    dietList.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </td>
      </tr>
    `;
    
    // Build query
    let q = query(
      collection(db, "dietPlans"),
      orderBy("assignedAt", "desc"),
      limit(itemsPerPage)
    );
    
    if (filterType.value !== "all") {
      q = query(q, where("type", "==", filterType.value));
    }
    
    if (currentPage > 1 && lastVisibleDoc) {
      q = query(q, startAfter(lastVisibleDoc));
    }
    
    const querySnapshot = await getDocs(q);
    
    // Update last visible document for pagination
    if (querySnapshot.docs.length > 0) {
      lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
    }
    
    // Render diet plans
    let html = "";
    querySnapshot.forEach(doc => {
      const plan = doc.data();
      const time = plan.assignedAt?.toDate().toLocaleDateString() || "N/A";
      
      html += `
        <tr>
          <td>${plan.memberName || membersData[plan.memberId]?.name || plan.memberId}</td>
          <td>
            <span class="badge ${getTypeBadgeClass(plan.type)}">
              ${plan.type.replace('_', ' ')}
            </span>
          </td>
          <td>${time}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="viewDietPlan('${doc.id}')">
              <i class="bi bi-eye"></i> View
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteDietPlan('${doc.id}')">
              <i class="bi bi-trash"></i> Delete
            </button>
          </td>
        </tr>
      `;
    });
    
    dietList.innerHTML = html || `
      <tr>
        <td colspan="4" class="text-center py-4">No diet plans found</td>
      </tr>
    `;
    
    // Update pagination
    updatePagination();
    
  } catch (error) {
    console.error("Error loading diet plans:", error);
    dietList.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4 text-danger">Error loading diet plans</td>
      </tr>
    `;
  }
}

// Setup real-time diet plan count
function setupRealTimeCount() {
  const q = query(collection(db, "dietPlans"));
  
  getCountFromServer(q).then((snapshot) => {
    totalDietPlans = snapshot.data().count;
    updateDietPlanCount();
  });
  
  // Update count when diet plans change
  unsubscribeDietPlans = onSnapshot(q, (snapshot) => {
    totalDietPlans = snapshot.size;
    updateDietPlanCount();
  });
}

function updateDietPlanCount() {
  dietPlanCount.textContent = `Showing ${Math.min(itemsPerPage, totalDietPlans)} of ${totalDietPlans} diet plans`;
}

function updatePagination() {
  const totalPages = Math.ceil(totalDietPlans / itemsPerPage);
  pagination.innerHTML = '';
  
  if (totalPages <= 1) return;
  
  // Previous button
  const prevLi = document.createElement('li');
  prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
  prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous">&laquo;</a>`;
  prevLi.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentPage > 1) {
      currentPage--;
      loadDietPlans();
    }
  });
  pagination.appendChild(prevLi);
  
  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    const li = document.createElement('li');
    li.className = `page-item ${currentPage === i ? 'active' : ''}`;
    li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
    li.addEventListener('click', (e) => {
      e.preventDefault();
      currentPage = i;
      loadDietPlans();
    });
    pagination.appendChild(li);
  }
  
  // Next button
  const nextLi = document.createElement('li');
  nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
  nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next">&raquo;</a>`;
  nextLi.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentPage < totalPages) {
      currentPage++;
      loadDietPlans();
    }
  });
  pagination.appendChild(nextLi);
}

// Filter diet plans by type
filterType.addEventListener("change", () => {
  currentPage = 1;
  lastVisibleDoc = null;
  loadDietPlans();
});

// Helper functions
function getTypeBadgeClass(type) {
  switch(type) {
    case 'weight_loss': return 'bg-success';
    case 'muscle_gain': return 'bg-primary';
    case 'maintenance': return 'bg-info text-dark';
    default: return 'bg-secondary';
  }
}

// Global functions
window.viewDietPlan = async (id) => {
  const docSnap = await getDoc(doc(db, "dietPlans", id));
  if (docSnap.exists()) {
    const plan = docSnap.data();
    let message = `Member: ${plan.memberName}\n\n`;
    message += `Plan Type: ${plan.type}\n\n`;
    message += `Details:\n${plan.details}\n\n`;
    message += `Assigned On: ${plan.assignedAt?.toDate().toLocaleString() || 'N/A'}`;
    
    if (plan.attachmentUrl) {
      message += `\n\nAttachment: ${plan.attachmentUrl}`;
    }
    
    alert(message);
  } else {
    alert("Diet plan not found");
  }
};

window.deleteDietPlan = async (id) => {
  if (confirm("Are you sure you want to delete this diet plan?")) {
    try {
      await deleteDoc(doc(db, "dietPlans", id));
      alert("Diet plan deleted successfully");
      loadDietPlans();
    } catch (error) {
      console.error("Error deleting diet plan:", error);
      alert("Failed to delete diet plan");
    }
  }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (unsubscribeDietPlans) {
    unsubscribeDietPlans();
  }
});