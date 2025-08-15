import {auth, app, db} from "../firebase-config.js"
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// DOM Elements
const editProfileBtn = document.getElementById('editProfileBtn');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const editProfileModal = new bootstrap.Modal('#editProfileModal');

// Load and Display Profile Data
async function loadProfileData(userId) {
  try {
    const docRef = doc(db, "members", userId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const memberData = docSnap.data();
      displayProfileData(memberData);
      
      // Populate edit form
      document.getElementById('editName').value = memberData.name || "";
      document.getElementById('editAge').value = memberData.age || "";
    } else {
      console.log("No member data found");
      // Display auth email as fallback
      document.getElementById('profileEmail').textContent = auth.currentUser.email;
    }
  } catch (error) {
    console.error("Error loading profile:", error);
    alert("Failed to load profile data");
  }
}

// Display Data in UI
function displayProfileData(data) {
  // Basic Info
  document.getElementById('profileName').textContent = data.name || "Member";
  document.getElementById('profileEmail').textContent = data.email || auth.currentUser.email;
  document.getElementById('profileAge').textContent = data.age ? `${data.age} years` : "Not specified";
  
  // Membership Info
  document.getElementById('membershipPlan').textContent = data.plan || "No plan";
  document.getElementById('planDetails').textContent = data.plan || "Not specified";
  
  // Join Date
  if (data.createdAt) {
    const joinDate = data.createdAt.toDate();
    document.getElementById('joinDate').textContent = joinDate.toLocaleDateString();
  } else {
    document.getElementById('joinDate').textContent = "Unknown";
  }
  
  // Profile Picture (generated from name)
  const name = data.name || "M";
  document.getElementById('profilePicture').src = 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4e73df&color=fff&size=128`;
}

// Event Listeners
function setupEventListeners() {
  // Edit Profile Button
  editProfileBtn.addEventListener('click', () => {
    editProfileModal.show();
  });
  
  // Save Profile Changes
  saveProfileBtn.addEventListener('click', async () => {
    try {
      const updates = {
        name: document.getElementById('editName').value,
        age: parseInt(document.getElementById('editAge').value)
      };
      
      await updateDoc(doc(db, "members", auth.currentUser.uid), updates);
      editProfileModal.hide();
      loadProfileData(auth.currentUser.uid); // Refresh data
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile");
    }
  });
  
  // Logout would be handled in your main dashboard.js
}

// Initialize
onAuthStateChanged(auth, (user) => {
  if (user) {
    loadProfileData(user.uid);
    setupEventListeners();
  } else {
    window.location.href = '/login.html';
  }
});