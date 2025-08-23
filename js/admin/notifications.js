import { app, auth, db, storage } from "../firebase-config.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc,
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
let currentUserRole = null;

// Console styling
const consoleStyles = {
  admin: 'background: #4e73df; color: white; padding: 2px 4px; border-radius: 3px;',
  member: 'background: #1cc88a; color: white; padding: 2px 4px; border-radius: 3px;',
  error: 'background: #e74a3b; color: white; padding: 2px 4px; border-radius: 3px;',
  info: 'background: #36b9cc; color: white; padding: 2px 4px; border-radius: 3px;'
};

/* ---------------------------------------
   SETUP TEMPLATE BUTTONS (Missing Function)
----------------------------------------*/
function setupTemplateButtons() {
  console.log("%cSetting up notification template buttons", consoleStyles.admin);
  
  // Check if template buttons exist in the DOM
  const templateButtons = document.querySelectorAll('[data-template]');
  
  if (templateButtons.length === 0) {
    console.log("%cNo template buttons found in DOM", consoleStyles.info);
    return;
  }
  
  const templates = {
    workout: "🏋️ Your workout schedule has been updated. Check the app for details.",
    diet: "🥗 Your new diet plan is ready! Please review and follow accordingly.",
    payment: "💳 Payment reminder: Your subscription is due for renewal.",
    general: "📢 Important announcement: Please check your member portal.",
    emergency: "🚨 Emergency: The gym will be closed today due to maintenance."
  };
  
  templateButtons.forEach(button => {
    button.addEventListener('click', () => {
      const templateType = button.getAttribute('data-template');
      if (templates[templateType]) {
        messageInput.value = templates[templateType];
        console.log(`%cLoaded template: ${templateType}`, consoleStyles.admin);
      }
    });
  });
  
  console.log(`%cSetup ${templateButtons.length} template buttons`, consoleStyles.admin);
}

/* ---------------------------------------
   AUTH + ROLE DETECTION (with fallback)
----------------------------------------*/
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.log("%cNo user signed in - redirecting to login", consoleStyles.error);
    window.location.href = "/public/login.html";
    return;
  }

  try {
    // Try users/{uid} first
    let role = null;
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      role = userDoc.data().role;
    } else {
      // Fallback: check members/{uid}
      const memberDocRef = doc(db, "members", user.uid);
      const memberDoc = await getDoc(memberDocRef);
      if (memberDoc.exists()) {
        role = "member";
      }
    }

    currentUserRole = role;
    console.log(`%cUser authenticated with role: ${currentUserRole}`, consoleStyles.info);

    if (currentUserRole === "admin") {
      console.log("%cLoading admin notifications interface", consoleStyles.admin);
      await loadMembers();
      setupTemplateButtons(); // This function now exists
      loadNotifications();
      setupRealTimeCount();
    } else if (currentUserRole === "member") {
      console.log("%cLoading member notifications interface", consoleStyles.member);
      if (notifyForm) notifyForm.style.display = "none";
      // Member gets their notifications
      loadMemberNotifications(user.uid);
    } else {
      console.log("%cAccess Denied - Unknown role", consoleStyles.error);
      alert("Access Denied");
      await signOut(auth);
      window.location.href = "/public/login.html";
    }

  } catch (error) {
    console.error("%cAuthentication error:", consoleStyles.error, error);
    alert(`Error verifying access: ${error.message}`);
    await signOut(auth);
    window.location.href = "/public/login.html";
  }
});

/* ---------------------------------------
   LOAD MEMBERS (Admin Only)
----------------------------------------*/
async function loadMembers() {
  try {
    if (!memberSelect) return;

    console.log("%cLoading members for notification dropdown", consoleStyles.admin);
    memberSelect.innerHTML = '<option value="" selected disabled>Loading members...</option>';

    const snap = await getDocs(collection(db, "members"));
    membersMap = {};

    memberSelect.innerHTML = `
      <option value="" selected disabled>Select member</option>
      <option value="all">All Members</option>
    `;

    snap.forEach(docSnap => {
      const m = docSnap.data();

      const displayName =
        (m.fullName && m.fullName.trim()) ||
        (m.name && m.name.trim()) ||
        `${(m.firstName || "").trim()} ${(m.lastName || "").trim()}`.trim() ||
        (m.email ? m.email.split("@")[0] : "") ||
        `Member ${docSnap.id.substring(0, 5)}`;

      membersMap[docSnap.id] = displayName;

      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = displayName;
      memberSelect.appendChild(opt);
    });

    console.log(`%cLoaded ${snap.size} members for notifications`, consoleStyles.admin);
    
    if (snap.empty) {
      console.log("%cNo members found in database", consoleStyles.error);
      memberSelect.innerHTML = '<option value="" disabled>No members found</option>';
    }
  } catch (error) {
    console.error("%cError loading members:", consoleStyles.error, error);
    memberSelect.innerHTML = '<option value="" disabled>Error loading members</option>';
  }
}

/* ---------------------------------------
   SUBMIT NOTIFICATION (Admin)
----------------------------------------*/
if (notifyForm) {
  notifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const type = notifyType.value;
    const memberId = memberSelect.value;
    const message = messageInput.value.trim();
    const attachment = attachmentInput.files[0];
    
    if (!type || !memberId || !message) {
      console.log("%cNotification form validation failed - missing fields", consoleStyles.error);
      alert("Please fill all required fields");
      return;
    }

    try {
      sendBtnText.classList.add("d-none");
      sendBtnSpinner.classList.remove("d-none");
      notifyForm.querySelector("button").disabled = true;
      
      let attachmentUrl = "";
      if (attachment) {
        console.log("%cUploading notification attachment", consoleStyles.admin);
        const storageRef = ref(storage, `notifications/${Date.now()}_${attachment.name}`);
        const snapshot = await uploadBytes(storageRef, attachment);
        attachmentUrl = await getDownloadURL(snapshot.ref);
        console.log("%cAttachment uploaded successfully", consoleStyles.admin, attachmentUrl);
      }

      const notificationData = {
        type,
        memberId: memberId === "all" ? null : memberId,
        memberName: memberId === "all" ? "All Members" : (membersMap[memberId] || "Member"),
        message,
        attachmentUrl,
        status: "sent",
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
        read: false
      };

      console.log("%cCreating new notification:", consoleStyles.admin, notificationData);
      
      const docRef = await addDoc(collection(db, "notifications"), notificationData);
      console.log("%cNotification created successfully with ID:", consoleStyles.admin, docRef.id);
      
      notifyForm.reset();
      attachmentInput.value = "";
      alert("Notification sent successfully!");
      currentPage = 1;
      loadNotifications();

    } catch (error) {
      console.error("%cError sending notification:", consoleStyles.error, error);
      alert(`Failed to send notification: ${error.message}`);
    } finally {
      sendBtnText.classList.remove("d-none");
      sendBtnSpinner.classList.add("d-none");
      notifyForm.querySelector("button").disabled = false;
    }
  });
}

/* ---------------------------------------
   LOAD NOTIFICATIONS (Admin list with pagination)
----------------------------------------*/
async function loadNotifications() {
  if (currentUserRole !== "admin") return;
  
  try {
    console.log("%cLoading admin notifications list", consoleStyles.admin);
    notificationList.innerHTML = `<tr><td colspan="6" class="text-center py-4">
      <div class="spinner-border text-primary" role="status"></div></td></tr>`;
    
    let q1 = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
      limit(itemsPerPage)
    );

    if (filterType && filterType.value !== "all") {
      q1 = query(q1, where("type", "==", filterType.value));
      console.log(`%cFiltering notifications by type: ${filterType.value}`, consoleStyles.admin);
    }

    if (currentPage > 1 && lastVisibleDoc) {
      q1 = query(q1, startAfter(lastVisibleDoc));
    }

    const querySnapshot = await getDocs(q1);

    if (querySnapshot.docs.length > 0) {
      lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
    }

    console.log(`%cLoaded ${querySnapshot.size} notifications for admin view`, consoleStyles.admin);
    
    let html = "";
    querySnapshot.forEach(docSnap => {
      const n = docSnap.data();
      const time = n.createdAt?.toDate?.().toLocaleString?.() || "N/A";
      html += `<tr>
        <td><span class="badge ${getTypeBadgeClass(n.type)}">${n.type}</span></td>
        <td>${n.memberName || "All Members"}</td>
        <td class="message-cell">${(n.message || "").substring(0,50)}${(n.message || "").length>50?'...':''}${n.attachmentUrl?'<i class="bi bi-paperclip ms-2"></i>':''}</td>
        <td>${time}</td>
        <td><span class="badge ${getStatusBadgeClass(n.status)}">${n.status || "sent"}</span></td>
        <td class="text-nowrap">
          <button class="btn btn-sm btn-outline-primary me-1" onclick="viewNotification('${docSnap.id}')">
            <i class="bi bi-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteNotification('${docSnap.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
    });

    notificationList.innerHTML = html || `<tr><td colspan="6" class="text-center py-4">No notifications found</td></tr>`;
    updatePagination();

  } catch (error) {
    console.error("%cError loading notifications:", consoleStyles.error, error);
    notificationList.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error loading notifications</td></tr>`;
  }
}

/* ---------------------------------------
   LOAD NOTIFICATIONS (Member Only)
----------------------------------------*/
async function loadMemberNotifications(authUid) {
  try {
    // Use the actual user UID
    const memberId = authUid;
    console.log(`%cLoading notifications for member: ${memberId}`, consoleStyles.member);

    notificationList.innerHTML = `<tr><td colspan="5" class="text-center py-4">
      <div class="spinner-border text-primary" role="status"></div></td></tr>`;

    // Query for notifications sent to this specific member OR to all members
    const q = query(
      collection(db, "notifications"),
      where("memberId", "in", [memberId, null]),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        notifications.push({ id: docSnap.id, ...data });
        
        // Log each notification that's being sent to the member
        console.log(`%cMember received notification:`, consoleStyles.member, {
          id: docSnap.id,
          type: data.type,
          message: data.message,
          createdAt: data.createdAt?.toDate?.() || null,
          read: data.read || false
        });
      });

      console.log(`%cMember has ${notifications.length} notifications`, consoleStyles.member);

      if (notifications.length === 0) {
        notificationList.innerHTML = `<tr><td colspan="5" class="text-center">No notifications found</td></tr>`;
        return;
      }

      let html = "";
      notifications.forEach(n => {
        const dateObj = n.createdAt?.toDate?.() || null;
        const time = dateObj ? dateObj.toLocaleString() : "N/A";
        const isUnread = !n.read;
        
        html += `<tr class="${isUnread ? 'table-info' : ''}">
          <td><span class="badge ${getTypeBadgeClass(n.type)}">${n.type || "general"}</span></td>
          <td>${n.message || ""}</td>
          <td>${n.attachmentUrl ? `<a href="${n.attachmentUrl}" target="_blank">View Attachment</a>` : 'N/A'}</td>
          <td>${time}</td>
          <td>
            <span class="badge ${isUnread ? 'bg-warning' : 'bg-success'}">
              ${isUnread ? 'Unread' : 'Read'}
            </span>
          </td>
          <td>
            <button class="btn btn-sm btn-outline-primary" onclick="markAsRead('${n.id}')">
              Mark as Read
            </button>
          </td>
        </tr>`;
      });

      notificationList.innerHTML = html;
    });

    // Store unsubscribe function to clean up later
    window.addEventListener('beforeunload', () => unsubscribe());

  } catch (error) {
    console.error("%cError loading member notifications:", consoleStyles.error, error);
    notificationList.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Failed to load notifications</td></tr>`;
  }
}

/* ---------------------------------------
   REAL-TIME COUNT (Admin)
----------------------------------------*/
function setupRealTimeCount() {
  if (currentUserRole !== "admin") return;

  const q = query(collection(db, "notifications"));
  
  getCountFromServer(q).then((snapshot) => {
    totalNotifications = snapshot.data().count;
    console.log(`%cTotal notifications in system: ${totalNotifications}`, consoleStyles.admin);
    updateNotificationCount();
  });

  unsubscribeNotifications = onSnapshot(q, (snapshot) => {
    totalNotifications = snapshot.size;
    updateNotificationCount();
  });
}

/* ---------------------------------------
   HELPER FUNCTIONS (Missing functions)
----------------------------------------*/
function getTypeBadgeClass(type) {
  switch(type) {
    case 'workout': return 'bg-primary';
    case 'diet': return 'bg-success';
    case 'payment': return 'bg-warning text-dark';
    case 'emergency': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

function getStatusBadgeClass(status) {
  switch(status) {
    case 'sent': return 'bg-info';
    case 'read': return 'bg-success';
    case 'failed': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

function updateNotificationCount() {
  if (notificationCount) {
    notificationCount.textContent = totalNotifications;
  }
}

function updatePagination() {
  if (!pagination) return;
  
  const totalPages = Math.ceil(totalNotifications / itemsPerPage);
  
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }
  
  let html = `<nav><ul class="pagination pagination-sm">`;
  
  // Previous button
  html += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
    <a class="page-link" href="#" onclick="changePage(${currentPage - 1}); return false;">Previous</a>
  </li>`;
  
  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    html += `<li class="page-item ${i === currentPage ? 'active' : ''}">
      <a class="page-link" href="#" onclick="changePage(${i}); return false;">${i}</a>
    </li>`;
  }
  
  // Next button
  html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
    <a class="page-link" href="#" onclick="changePage(${currentPage + 1}); return false;">Next</a>
  </li>`;
  
  html += `</ul></nav>`;
  pagination.innerHTML = html;
}

/* ---------------------------------------
   GLOBAL FUNCTIONS (Admin actions)
----------------------------------------*/
window.viewNotification = async (id)=>{
  console.log(`%cAdmin viewing notification: ${id}`, consoleStyles.admin);
  const docSnap = await getDoc(doc(db,"notifications",id));
  if(docSnap.exists()){
    const n=docSnap.data();
    const dateObj = n.createdAt?.toDate?.() || null;
    let message=`Type: ${n.type}\n\nTo: ${n.memberName||"All Members"}\n\nMessage:\n${n.message}\n\nSent: ${dateObj ? dateObj.toLocaleString() : 'N/A'}`;
    if(n.attachmentUrl) message+=`\n\nAttachment: ${n.attachmentUrl}`;
    
    console.log("%cNotification details:", consoleStyles.admin, {
      id: id,
      type: n.type,
      recipient: n.memberName || "All Members",
      message: n.message,
      attachment: n.attachmentUrl || "None",
      createdAt: dateObj,
      status: n.status
    });
    
    alert(message);
  }else{
    console.log(`%cNotification not found: ${id}`, consoleStyles.error);
    alert("Notification not found");
  }
};

window.deleteNotification = async (id)=>{
  if(confirm("Are you sure you want to delete this notification?")){
    try {
      console.log(`%cDeleting notification: ${id}`, consoleStyles.admin);
      await deleteDoc(doc(db,"notifications",id));
      console.log(`%cNotification deleted successfully: ${id}`, consoleStyles.admin);
      alert("Notification deleted successfully");
      loadNotifications();
    } catch(error){
      console.error("%cError deleting notification:", consoleStyles.error, error);
      alert("Failed to delete notification");
    }
  }
};

window.markAsRead = async (id) => {
  try {
    console.log(`%cMember marking notification as read: ${id}`, consoleStyles.member);
    await updateDoc(doc(db, "notifications", id), { 
      read: true,
      readAt: new Date() 
    });
    console.log(`%cNotification marked as read: ${id}`, consoleStyles.member);
    
    // Reload notifications to update UI
    if (currentUserRole === "member") {
      loadMemberNotifications(auth.currentUser.uid);
    }
  } catch (error) {
    console.error("%cError marking notification as read:", consoleStyles.error, error);
  }
};

window.changePage = (page) => {
  currentPage = page;
  loadNotifications();
};

window.addEventListener('beforeunload',()=>{ 
  if(unsubscribeNotifications) {
    console.log("%cCleaning up admin notification listeners", consoleStyles.admin);
    unsubscribeNotifications(); 
  }
});