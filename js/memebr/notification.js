import {app, auth, db} from "../firebase-config.js"
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc, 
  deleteDoc,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// DOM Elements
const notificationsList = document.getElementById('notificationsList');
const unreadCountBadge = document.getElementById('unreadCountBadge');
const clearAllBtn = document.getElementById('clearAllBtn');
const filterBtns = document.querySelectorAll('.filter-btn');

// Current User
let currentUser = null;

// Auth State Listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loadNotifications(user.uid);
    setupEventListeners();
  } else {
    window.location.href = '/login.html';
  }
});

// Load Notifications with Real-Time Updates
function loadNotifications(userId) {
  const q = query(
    collection(db, "notifications"),
    where("memberId", "in", [userId, "all"]),
    orderBy("timestamp", "desc")
  );

  onSnapshot(q, (snapshot) => {
    let unreadCount = 0;
    notificationsList.innerHTML = '';

    snapshot.forEach((doc) => {
      const notification = doc.data();
      const isUnread = !notification.read;
      if (isUnread) unreadCount++;

      const notificationElement = `
        <div class="list-group-item notification-item ${isUnread ? 'unread-notification' : ''}" 
             data-id="${doc.id}" 
             data-read="${notification.read}">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <h6 class="mb-1">${notification.title || 'Notification'}</h6>
              <p class="mb-1 small">${notification.message}</p>
              <small class="text-muted">${formatDate(notification.timestamp)}</small>
            </div>
            <div class="ms-3">
              <button class="btn btn-sm ${isUnread ? 'btn-outline-success' : 'btn-outline-secondary'} mark-as-read">
                ${isUnread ? 'Mark Read' : 'Read'}
              </button>
              <button class="btn btn-sm btn-outline-danger delete-notification ms-1">×</button>
            </div>
          </div>
        </div>
      `;

      notificationsList.innerHTML += notificationElement;
    });

    // Update unread count badge
    updateUnreadBadge(unreadCount);

    // Show empty state if no notifications
    if (snapshot.empty) {
      showEmptyState();
    }
  });
}

// Format Firestore Timestamp
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate();
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Update Unread Badge
function updateUnreadBadge(count) {
  if (count > 0) {
    unreadCountBadge.textContent = count;
    unreadCountBadge.classList.remove('d-none');
  } else {
    unreadCountBadge.classList.add('d-none');
  }
}

// Show Empty State
function showEmptyState() {
  notificationsList.innerHTML = `
    <div class="text-center py-4 text-muted">
      <i class="bi bi-bell-slash fs-1"></i>
      <p class="mt-2">No notifications yet</p>
    </div>
  `;
}

// Setup Event Listeners
function setupEventListeners() {
  // Mark as Read
  notificationsList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('mark-as-read')) {
      await handleMarkAsRead(e);
    }
    
    // Delete Notification
    if (e.target.classList.contains('delete-notification')) {
      await handleDeleteNotification(e);
    }
  });

  // Clear All Notifications
  clearAllBtn.addEventListener('click', handleClearAllNotifications);

  // Filter Notifications
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => handleFilterNotifications(btn));
  });

  // Menu Navigation
  document.querySelectorAll('.menu-link').forEach(link => {
    link.addEventListener('click', handleMenuNavigation);
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

// Event Handler Functions
async function handleMarkAsRead(event) {
  const notificationItem = event.target.closest('.notification-item');
  const notificationId = notificationItem.dataset.id;
  
  try {
    await updateDoc(doc(db, "notifications", notificationId), {
      read: true
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    alert("Failed to mark as read. Please try again.");
  }
}

async function handleDeleteNotification(event) {
  if (confirm('Are you sure you want to delete this notification?')) {
    const notificationItem = event.target.closest('.notification-item');
    const notificationId = notificationItem.dataset.id;
    
    try {
      await deleteDoc(doc(db, "notifications", notificationId));
    } catch (error) {
      console.error("Error deleting notification:", error);
      alert("Failed to delete notification. Please try again.");
    }
  }
}

async function handleClearAllNotifications() {
  if (!confirm('Are you sure you want to clear all notifications?')) return;
  
  try {
    const q = query(
      collection(db, "notifications"),
      where("memberId", "in", [currentUser.uid, "all"])
    );
    
    const querySnapshot = await getDocs(q);
    const deletePromises = [];
    
    querySnapshot.forEach((doc) => {
      deletePromises.push(deleteDoc(doc.ref));
    });
    
    await Promise.all(deletePromises);
  } catch (error) {
    console.error("Error clearing notifications:", error);
    alert("Failed to clear notifications. Please try again.");
  }
}

function handleFilterNotifications(btn) {
  // Update active button
  filterBtns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  const filter = btn.dataset.filter;
  const allNotifications = document.querySelectorAll('.notification-item');
  
  allNotifications.forEach(notification => {
    const isRead = notification.dataset.read === 'true';
    
    switch (filter) {
      case 'all':
        notification.style.display = 'flex';
        break;
      case 'unread':
        notification.style.display = isRead ? 'none' : 'flex';
        break;
    }
  });
}

function handleMenuNavigation(event) {
  event.preventDefault();
  document.querySelectorAll('.menu-link').forEach(l => l.classList.remove('active'));
  event.currentTarget.classList.add('active');
  
  const target = event.currentTarget.dataset.target;
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.add('d-none');
  });
  document.getElementById(target).classList.remove('d-none');
}

function handleLogout() {
  signOut(auth).then(() => {
    window.location.href = '/login.html';
  }).catch((error) => {
    console.error("Logout error:", error);
    alert("Failed to log out. Please try again.");
  });
}