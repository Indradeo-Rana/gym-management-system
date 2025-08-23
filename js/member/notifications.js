import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, orderBy, onSnapshot, updateDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "../firebase-config.js"; 

const notificationList = document.getElementById("notificationList");
const notificationCount = document.getElementById("notificationCount");
const filterType = document.getElementById("filterType");
const markAllReadBtn = document.getElementById("markAllRead");

let notifications = [];
let unsubscribe = null;
let memberDocId = null;
let isInitialized = false;

// Console styling
const consoleStyles = {
    member: 'background: #1cc88a; color: white; padding: 2px 4px; border-radius: 3px;',
    error: 'background: #e74a3b; color: white; padding: 2px 4px; border-radius: 3px;',
    info: 'background: #36b9cc; color: white; padding: 2px 4px; border-radius: 3px;',
    success: 'background: #4e73df; color: white; padding: 2px 4px; border-radius: 3px;'
};

// ✅ INIT FUNCTION - Required by dashboard.js
export function init(db, uid, auth) {
    if (isInitialized) {
        console.log("%cNotifications already initialized", consoleStyles.info);
        return;
    }
    
    isInitialized = true;
    console.log("%cNotifications module initialized for auth UID:", consoleStyles.member, uid);
    
    // Get the correct member document ID from the members collection
    findCorrectMemberDocumentId(uid).then(correctMemberId => {
        if (correctMemberId) {
            memberDocId = correctMemberId;
            console.log("%cUsing correct member document ID:", consoleStyles.success, memberDocId);
            loadAllNotificationsForMember(memberDocId, "all");
        } else {
            // If we can't find the correct ID, try a different approach
            console.log("%cUsing alternative notification loading approach", consoleStyles.info);
            loadAllNotificationsAlternativeApproach(uid);
        }
    }).catch(error => {
        console.error("%cError finding member document:", consoleStyles.error, error);
        loadAllNotificationsAlternativeApproach(uid);
    });
}

// Find the correct member document ID from the members collection
async function findCorrectMemberDocumentId(authUid) {
    console.log("%cSearching for member document in Firestore...", consoleStyles.info);
    
    try {
        // Get all members to find the one with matching auth UID
        const membersSnapshot = await getDocs(collection(db, "members"));
        
        for (const doc of membersSnapshot.docs) {
            const memberData = doc.data();
            
            // Check various possible fields that might contain the auth UID
            if (memberData.uid === authUid || 
                memberData.authUid === authUid || 
                memberData.userId === authUid ||
                memberData.firebaseUid === authUid ||
                memberData.authId === authUid) {
                
                console.log("%cFound matching member document:", consoleStyles.success, {
                    documentId: doc.id,
                    authUid: authUid,
                    memberData: memberData
                });
                
                return doc.id; // Return the document ID (Sftsr0nBWHaK8bRs69Ei)
            }
        }
        
        console.log("%cNo member document found with auth UID, checking all notifications...", consoleStyles.info);
        return null;
        
    } catch (error) {
        console.error("%cError searching members collection:", consoleStyles.error, error);
        return null;
    }
}

// Load all notifications for a member using the correct document ID
function loadAllNotificationsForMember(memberDocumentId, type = "all") {
    // Clean up any previous listeners
    if (unsubscribe) {
        unsubscribe();
    }
    
    console.log(`%cLoading notifications for member document: ${memberDocumentId}`, consoleStyles.info);
    
    // Show loading state
    if (notificationList) {
        notificationList.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2">Loading notifications...</p>
            </div>
        `;
    }
    
    try {
        // Query for notifications sent to this specific member OR to all members
        let q;
        if (type === "all") {
            q = query(
                collection(db, "notifications"),
                where("memberId", "in", [memberDocumentId, null]),
                orderBy("createdAt", "desc")
            );
        } else {
            q = query(
                collection(db, "notifications"),
                where("memberId", "in", [memberDocumentId, null]),
                where("type", "==", type),
                orderBy("createdAt", "desc")
            );
        }
        
        // Set up real-time listener
        unsubscribe = onSnapshot(q, (snapshot) => {
            notifications = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                notifications.push({ id: doc.id, ...data });
                
                console.log("%cNotification loaded:", consoleStyles.info, {
                    id: doc.id,
                    type: data.type,
                    memberId: data.memberId,
                    message: data.message ? data.message.substring(0, 50) + "..." : "No message"
                });
            });
            
            console.log(`%cTotal notifications found: ${notifications.length}`, notifications.length > 0 ? consoleStyles.success : consoleStyles.info);
            
            if (notifications.length === 0) {
                renderNoNotifications();
            } else {
                renderNotifications();
            }
            
        }, (error) => {
            console.error("%cError in notification listener:", consoleStyles.error, error);
            renderError("Failed to load notifications. Please try again.");
        });
        
    } catch (error) {
        console.error("%cError setting up notification query:", consoleStyles.error, error);
        renderError("Error loading notifications. Please refresh the page.");
    }
}

// Alternative approach if we can't find the member document
function loadAllNotificationsAlternativeApproach(authUid) {
    console.log("%cUsing alternative approach to load notifications", consoleStyles.info);
    
    // Clean up any previous listeners
    if (unsubscribe) {
        unsubscribe();
    }
    
    // Show loading state
    if (notificationList) {
        notificationList.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <p class="mt-2">Loading notifications...</p>
            </div>
        `;
    }
    
    try {
        // Get ALL notifications and filter client-side
        const q = query(
            collection(db, "notifications"),
            orderBy("createdAt", "desc")
        );
        
        // Set up real-time listener
        unsubscribe = onSnapshot(q, (snapshot) => {
            notifications = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                
                // Check if this notification is for this user
                // Since we don't know the member document ID, we'll show all notifications
                // that are either for "all members" or don't have a memberId specified
                if (data.memberId === null || data.memberId === undefined) {
                    notifications.push({ id: doc.id, ...data });
                    
                    console.log("%cNotification (all members):", consoleStyles.info, {
                        id: doc.id,
                        type: data.type,
                        message: data.message ? data.message.substring(0, 50) + "..." : "No message"
                    });
                }
            });
            
            console.log(`%cTotal notifications found: ${notifications.length}`, notifications.length > 0 ? consoleStyles.success : consoleStyles.info);
            
            if (notifications.length === 0) {
                renderNoNotifications();
            } else {
                renderNotifications();
            }
            
        }, (error) => {
            console.error("%cError in notification listener:", consoleStyles.error, error);
            renderError("Failed to load notifications. Please try again.");
        });
        
    } catch (error) {
        console.error("%cError setting up alternative notification query:", consoleStyles.error, error);
        renderError("Error loading notifications. Please refresh the page.");
    }
}

// Render notifications list
function renderNotifications() {
    if (!notificationList) return;
    
    const unreadCount = notifications.filter(n => !n.read).length;
    console.log(`%cRendering ${notifications.length} notifications, ${unreadCount} unread`, consoleStyles.info);
    
    let html = '';
    
    notifications.forEach(n => {
        const dateObj = n.createdAt?.toDate?.() || null;
        const time = dateObj ? dateObj.toLocaleString() : "Recent";
        const isUnread = !n.read;
        
        html += `
            <div class="list-group-item list-group-item-action ${isUnread ? 'unread bg-light' : ''}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between">
                            <span class="badge bg-primary">${n.type || "General"}</span>
                            <small class="text-muted">${time}</small>
                        </div>
                        <p class="mt-2 mb-1">${n.message || "No message"}</p>
                        ${n.attachmentUrl ? `
                            <div class="mt-2">
                                <a href="${n.attachmentUrl}" target="_blank" class="btn btn-sm btn-outline-primary">
                                    <i class="fas fa-paperclip"></i> View Attachment
                                </a>
                            </div>
                        ` : ''}
                    </div>
                    <div class="ms-3">
                        ${isUnread ? `
                            <button class="btn btn-sm btn-success" onclick="markNotificationAsRead('${n.id}')">
                                <i class="fas fa-check"></i> Mark Read
                            </button>
                        ` : `
                            <span class="badge bg-secondary">Read</span>
                        `}
                    </div>
                </div>
            </div>
        `;
    });
    
    notificationList.innerHTML = html;
    
    if (notificationCount) {
        notificationCount.textContent = `${notifications.length} notifications (${unreadCount} unread)`;
    }
}

// Render no notifications state
function renderNoNotifications() {
    if (!notificationList) return;
    
    console.log("%cNo notifications found", consoleStyles.info);
    
    notificationList.innerHTML = `
        <div class="text-center py-5">
            <i class="fas fa-bell-slash fa-3x text-muted mb-3"></i>
            <h5>No notifications yet</h5>
            <p class="text-muted">You'll see notifications here when they're sent to you.</p>
            <div class="mt-3">
                <p class="small text-muted">If you expect to see notifications, please contact support with your member ID.</p>
                <p class="small text-muted">Your auth UID: ${auth.currentUser?.uid || 'N/A'}</p>
            </div>
        </div>
    `;
    
    if (notificationCount) {
        notificationCount.textContent = "0 notifications";
    }
}

// Render error state
function renderError(message) {
    if (!notificationList) return;
    
    notificationList.innerHTML = `
        <div class="alert alert-warning">
            <h5><i class="fas fa-exclamation-triangle"></i> Notice</h5>
            <p>${message}</p>
            <button class="btn btn-sm btn-outline-primary mt-2" onclick="window.location.reload()">
                <i class="fas fa-sync-alt"></i> Refresh Page
            </button>
        </div>
    `;
}

// Mark notification as read
window.markNotificationAsRead = async (id) => {
    try {
        console.log("%cMarking notification as read:", consoleStyles.info, id);
        await updateDoc(doc(db, "notifications", id), { 
            read: true,
            readAt: new Date() 
        });
        console.log("%cNotification marked as read:", consoleStyles.success, id);
    } catch (error) {
        console.error("%cError marking notification as read:", consoleStyles.error, error);
        alert("Failed to mark notification as read. Please try again.");
    }
};

// Mark all as read
if (markAllReadBtn) {
    markAllReadBtn.addEventListener("click", async () => {
        try {
            const unreadNotifications = notifications.filter(n => !n.read);
            console.log("%cMarking all notifications as read:", consoleStyles.info, unreadNotifications.length);
            
            if (unreadNotifications.length === 0) {
                alert("No unread notifications to mark as read.");
                return;
            }
            
            for (const notification of unreadNotifications) {
                await updateDoc(doc(db, "notifications", notification.id), { 
                    read: true,
                    readAt: new Date() 
                });
            }
            
            console.log("%cAll notifications marked as read", consoleStyles.success);
            alert(`Marked ${unreadNotifications.length} notifications as read.`);
            
        } catch (error) {
            console.error("%cError marking all as read:", consoleStyles.error, error);
            alert("Failed to mark all notifications as read. Please try again.");
        }
    });
}

// Filter notifications
if (filterType) {
    filterType.addEventListener("change", () => {
        if (memberDocId) {
            console.log("%cFiltering notifications by:", consoleStyles.info, filterType.value);
            loadAllNotificationsForMember(memberDocId, filterType.value);
        }
    });
}

// Clean up listener when page is unloaded
window.addEventListener('beforeunload', () => {
    if (unsubscribe) {
        console.log("%cCleaning up notification listener", consoleStyles.info);
        unsubscribe();
    }
});

// Prevent double initialization
window.__notifications_initialized = true;