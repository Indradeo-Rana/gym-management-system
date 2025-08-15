import {app, auth, db, storage} from "../firebase-config.js"
import { 
  getFirestore, collection, addDoc, deleteDoc, doc,
  getDocs, getDoc, query, where, orderBy, serverTimestamp,
  onSnapshot, limit, startAfter, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// DOM Elements
const notifyForm = document.getElementById("notifyForm");
const notifyType = document.getElementById("notifyType");
const memberSelect = document.getElementById("notifyMember");
const messageInput = document.getElementById("message");
const attachmentInput = document.getElementById("attachment");
const notificationList = document.getElementById("notificationList");
const filterType = document.getElementById("filterType");
const notificationCount = document.getElementById("notificationCount");
const pagination = document.getElementById("pagination");
const sendBtnText = document.getElementById("sendBtnText");
const sendBtnSpinner = document.getElementById("sendBtnSpinner");

// Data Stores
let membersMap = {};
let lastVisibleDoc = null;
const itemsPerPage = 10;
let currentPage = 1;
let totalNotifications = 0;
let unsubscribeNotifications = null;

// 🔐 Enhanced Authentication Check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log("No user signed in - redirecting to login");
    window.location.href = "/public/login.html";
    return;
  }

  try {
    console.log("User signed in, verifying admin status...");
    
    // Get user document
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    // Check if document exists
    if (!userDoc.exists()) {
      console.error("User document not found in Firestore");
      alert("Your account is not properly configured. Please contact support.");
      await signOut(auth);
      window.location.href = "/public/login.html";
      return;
    }

    // Check admin role
    const userData = userDoc.data();
    if (userData.role !== "admin") {
      console.log("User is not admin - redirecting");
      alert("Access Denied: Administrator privileges required");
      await signOut(auth);
      window.location.href = "/public/login.html";
      return;
    }

    console.log("Admin access verified - loading notifications system");
    
    // Load initial data
    await loadMembers();
    setupTemplateButtons();
    loadNotifications();
    setupRealTimeCount();
    
  } catch (error) {
    console.error("Detailed authentication error:", {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    let errorMessage = "Error verifying access";
    if (error.code === 'permission-denied') {
      errorMessage = "Database permissions error. Please try again later.";
    } else if (error.code === 'unavailable') {
      errorMessage = "Network error. Please check your internet connection.";
    }
    
    alert(`${errorMessage}. Please try again.`);
    
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error("Sign out failed:", signOutError);
    }
    
    window.location.href = "/public/login.html";
  }
});

// Load Members
async function loadMembers() {
  try {
    memberSelect.innerHTML = '<option value="" selected disabled>Loading members...</option>';
    const querySnapshot = await getDocs(collection(db, "members"));
    
    membersMap = {};
    memberSelect.innerHTML = `
      <option value="" selected disabled>Select member</option>
      <option value="all">All Members</option>
    `;
    
    querySnapshot.forEach(doc => {
      const member = doc.data();
      membersMap[doc.id] = member.fullName || `Member ${doc.id.substring(0, 5)}`;
      
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = membersMap[doc.id];
      memberSelect.appendChild(option);
    });
    
  } catch (error) {
    console.error("Error loading members:", error);
    memberSelect.innerHTML = '<option value="" selected disabled>Error loading members</option>';
  }
}

// Setup Template Buttons
function setupTemplateButtons() {
  document.querySelectorAll(".template-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      const type = this.getAttribute("data-type");
      notifyType.value = type;
      
      switch(type) {
        case "payment":
          messageInput.value = `Dear member,\n\nThis is a reminder that your monthly payment is due on [date].\n\nAmount: ₹[amount]\n\nPlease make the payment at your earliest convenience to avoid any service interruptions.\n\nThank you,\n[Your Gym Name]`;
          break;
        case "announcement":
          messageInput.value = `Attention all members,\n\nThe gym will be closed on [date] for [reason].\n\nWe apologize for any inconvenience and appreciate your understanding.\n\nRegular hours will resume on [reopening date].\n\nThank you,\n[Your Gym Name]`;
          break;
        case "schedule":
          messageInput.value = `Dear member,\n\nYour [class name] class scheduled for [date] at [time] has been changed to [new time].\n\nWe apologize for any inconvenience this may cause.\n\nPlease update your schedule accordingly.\n\nThank you,\n[Your Gym Name]`;
          break;
      }
    });
  });
}

// Submit Notification
notifyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const type = notifyType.value;
  const memberId = memberSelect.value;
  const message = messageInput.value.trim();
  const attachment = attachmentInput.files[0];
  
  if (!type || !memberId || !message) {
    alert("Please fill all required fields");
    return;
  }

  try {
    // Show loading state
    sendBtnText.classList.add("d-none");
    sendBtnSpinner.classList.remove("d-none");
    notifyForm.querySelector("button").disabled = true;
    
    // Upload attachment if exists
    let attachmentUrl = "";
    if (attachment) {
      const storageRef = ref(storage, `notifications/${Date.now()}_${attachment.name}`);
      const snapshot = await uploadBytes(storageRef, attachment);
      attachmentUrl = await getDownloadURL(snapshot.ref);
    }
    
    // Create notification
    const notificationData = {
      type,
      memberId: memberId === "all" ? null : memberId,
      memberName: memberId === "all" ? "All Members" : membersMap[memberId],
      message,
      attachmentUrl,
      status: "sent",
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    };
    
    await addDoc(collection(db, "notifications"), notificationData);
    
    // Reset form
    notifyForm.reset();
    attachmentInput.value = "";
    alert("Notification sent successfully!");
    
    // Reload notifications
    currentPage = 1;
    loadNotifications();
    
  } catch (error) {
    console.error("Error sending notification:", error);
    alert(`Failed to send notification: ${error.message}`);
    
  } finally {
    // Reset button state
    sendBtnText.classList.remove("d-none");
    sendBtnSpinner.classList.add("d-none");
    notifyForm.querySelector("button").disabled = false;
  }
});

// Load Notifications with Pagination
async function loadNotifications() {
  try {
    notificationList.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </td>
      </tr>
    `;
    
    // Build query
    let q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
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
    
    // Render notifications
    let html = "";
    querySnapshot.forEach(doc => {
      const n = doc.data();
      const time = n.createdAt?.toDate().toLocaleString() || "N/A";
      
      html += `
        <tr>
          <td>
            <span class="badge ${getTypeBadgeClass(n.type)}">
              ${n.type || 'other'}
            </span>
          </td>
          <td>${n.memberName || "All Members"}</td>
          <td class="message-cell">
            <div class="message-preview">${n.message.substring(0, 50)}${n.message.length > 50 ? '...' : ''}</div>
            ${n.attachmentUrl ? '<i class="bi bi-paperclip ms-2"></i>' : ''}
          </td>
          <td>${time}</td>
          <td>
            <span class="badge ${getStatusBadgeClass(n.status)}">
              ${n.status}
            </span>
          </td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" onclick="viewNotification('${doc.id}')">
              <i class="bi bi-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteNotification('${doc.id}')">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });
    
    notificationList.innerHTML = html || `
      <tr>
        <td colspan="6" class="text-center py-4">No notifications found</td>
      </tr>
    `;
    
    // Update pagination
    updatePagination();
    
  } catch (error) {
    console.error("Error loading notifications:", error);
    notificationList.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-danger">Error loading notifications</td>
      </tr>
    `;
  }
}

// Setup real-time notification count
function setupRealTimeCount() {
  const q = query(collection(db, "notifications"));
  
  getCountFromServer(q).then((snapshot) => {
    totalNotifications = snapshot.data().count;
    updateNotificationCount();
  });
  
  // Update count when notifications change
  unsubscribeNotifications = onSnapshot(q, (snapshot) => {
    totalNotifications = snapshot.size;
    updateNotificationCount();
  });
}

function updateNotificationCount() {
  notificationCount.textContent = `Showing ${Math.min(itemsPerPage, totalNotifications)} of ${totalNotifications} notifications`;
}

function updatePagination() {
  const totalPages = Math.ceil(totalNotifications / itemsPerPage);
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
      loadNotifications();
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
      loadNotifications();
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
      loadNotifications();
    }
  });
  pagination.appendChild(nextLi);
}

// Filter notifications by type
filterType.addEventListener("change", () => {
  currentPage = 1;
  lastVisibleDoc = null;
  loadNotifications();
});

// Helper functions
function getTypeBadgeClass(type) {
  switch(type) {
    case 'payment': return 'bg-warning text-dark';
    case 'announcement': return 'bg-info text-dark';
    case 'schedule': return 'bg-primary';
    default: return 'bg-secondary';
  }
}

function getStatusBadgeClass(status) {
  switch(status) {
    case 'sent': return 'bg-success';
    case 'read': return 'bg-primary';
    case 'failed': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

// Global functions
window.viewNotification = async (id) => {
  const docSnap = await getDoc(doc(db, "notifications", id));
  if (docSnap.exists()) {
    const n = docSnap.data();
    let message = `Type: ${n.type}\n\n`;
    message += `To: ${n.memberName || "All Members"}\n\n`;
    message += `Message:\n${n.message}\n\n`;
    message += `Sent: ${n.createdAt?.toDate().toLocaleString() || 'N/A'}`;
    
    if (n.attachmentUrl) {
      message += `\n\nAttachment: ${n.attachmentUrl}`;
    }
    
    alert(message);
  } else {
    alert("Notification not found");
  }
};

window.deleteNotification = async (id) => {
  if (confirm("Are you sure you want to delete this notification?")) {
    try {
      await deleteDoc(doc(db, "notifications", id));
      alert("Notification deleted successfully");
      loadNotifications();
    } catch (error) {
      console.error("Error deleting notification:", error);
      alert("Failed to delete notification");
    }
  }
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (unsubscribeNotifications) {
    unsubscribeNotifications();
  }
});