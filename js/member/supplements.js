import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "../firebase-config.js"; 

// DOM Elements
const supplementList = document.getElementById("supplementList");
const supplementCount = document.getElementById("supplementCount");
const filterCategory = document.getElementById("filterCategory");

// Data Stores
let supplements = [];
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
        console.log("%cSupplements already initialized", consoleStyles.info);
        return;
    }
    
    isInitialized = true;
    console.log("%cSupplements module initialized for auth UID:", consoleStyles.member, uid);
    
    // Get the correct member document ID
    findCorrectMemberDocumentId(uid).then(correctMemberId => {
        if (correctMemberId) {
            memberDocId = correctMemberId;
            console.log("%cUsing member document ID for supplements:", consoleStyles.success, memberDocId);
            loadMemberSupplements(memberDocId, "all");
        } else {
            console.log("%cUsing auth UID for supplements:", consoleStyles.info, uid);
            memberDocId = uid;
            loadMemberSupplements(memberDocId, "all");
        }
    }).catch(error => {
        console.error("%cError finding member document:", consoleStyles.error, error);
        memberDocId = uid;
        loadMemberSupplements(memberDocId, "all");
    });
}

// Find the correct member document ID
async function findCorrectMemberDocumentId(authUid) {
    console.log("%cFinding member document for supplements...", consoleStyles.info);
    
    try {
        // Check members collection for matching auth UID
        const membersQuery = query(
            collection(db, "members"),
            where("authUid", "==", authUid)
        );
        
        const querySnapshot = await getDocs(membersQuery);
        
        if (!querySnapshot.empty) {
            const docId = querySnapshot.docs[0].id;
            console.log("%cFound member document:", consoleStyles.success, docId);
            return docId;
        }
        
        // Check other common field names
        const fieldNames = ["uid", "userId", "firebaseUid", "authId"];
        for (const fieldName of fieldNames) {
            try {
                const fieldQuery = query(
                    collection(db, "members"),
                    where(fieldName, "==", authUid)
                );
                
                const fieldSnapshot = await getDocs(fieldQuery);
                if (!fieldSnapshot.empty) {
                    const docId = fieldSnapshot.docs[0].id;
                    console.log("%cFound member document via field '" + fieldName + "':", consoleStyles.success, docId);
                    return docId;
                }
            } catch (error) {
                // Field might not exist, continue to next field
                continue;
            }
        }
        
        console.log("%cNo member document found, using auth UID", consoleStyles.info);
        return null;
        
    } catch (error) {
        console.error("%cError searching for member document:", consoleStyles.error, error);
        return null;
    }
}

// Load supplements for member
function loadMemberSupplements(memberId, category = "all") {
    // Clean up previous listener
    if (unsubscribe) {
        console.log("%cCleaning up previous supplements listener", consoleStyles.info);
        unsubscribe();
    }
    
    console.log(`%cLoading supplements for member: ${memberId}`, consoleStyles.info);
    
    // Show loading state
    if (supplementList) {
        supplementList.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading supplements...</span>
                </div>
                <p class="mt-2">Loading your supplements...</p>
            </div>
        `;
    }
    
    try {
        // Query for supplements - this will need to be adjusted based on how you store member supplements
        let q;
        
        if (category === "all") {
            q = query(
                collection(db, "supplements"),
                orderBy("createdAt", "desc")
            );
        } else {
            q = query(
                collection(db, "supplements"),
                where("category", "==", category),
                orderBy("createdAt", "desc")
            );
        }
        
        // Set up real-time listener
        unsubscribe = onSnapshot(q, (snapshot) => {
            supplements = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                supplements.push({ id: doc.id, ...data });
                
                console.log("%cSupplement found:", consoleStyles.info, {
                    id: doc.id,
                    name: data.name,
                    category: data.category,
                    price: data.price
                });
            });
            
            console.log(`%cTotal supplements found: ${supplements.length}`, supplements.length > 0 ? consoleStyles.success : consoleStyles.info);
            
            if (supplements.length === 0) {
                renderNoSupplements();
            } else {
                renderSupplements();
            }
            
            updateSupplementCount();
            
        }, (error) => {
            console.error("%cError in supplements listener:", consoleStyles.error, error);
            renderError("Failed to load supplements. Please try again.");
        });
        
    } catch (error) {
        console.error("%cError setting up supplements query:", consoleStyles.error, error);
        renderError("Error loading supplements. Please refresh the page.");
    }
}

// Render supplements list
function renderSupplements() {
    if (!supplementList) return;
    
    console.log(`%cRendering ${supplements.length} supplements`, consoleStyles.info);
    
    let html = '';
    
    supplements.forEach(supplement => {
        const dateObj = supplement.createdAt?.toDate?.() || null;
        const time = dateObj ? dateObj.toLocaleDateString() : "Recent";
        
        html += `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card h-100 supplement-card">
                    ${supplement.imageUrl ? `
                        <img src="${supplement.imageUrl}" class="card-img-top" alt="${supplement.name}" 
                             style="height: 200px; object-fit: cover;">
                    ` : `
                        <div class="card-img-top bg-light d-flex align-items-center justify-content-center" 
                             style="height: 200px;">
                            <i class="fas fa-capsules fa-3x text-muted"></i>
                        </div>
                    `}
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title">${supplement.name}</h5>
                            <span class="badge ${getCategoryBadgeClass(supplement.category)}">
                                ${supplement.category}
                            </span>
                        </div>
                        <p class="card-text text-muted small">
                            ${supplement.description ? supplement.description.substring(0, 80) + (supplement.description.length > 80 ? '...' : '') : 'No description available'}
                        </p>
                        <div class="d-flex justify-content-between align-items-center mt-3">
                            <span class="h5 text-primary mb-0">₹${supplement.price?.toFixed(2) || '0.00'}</span>
                            <span class="badge ${supplement.stock > 0 ? 'bg-success' : 'bg-danger'}">
                                ${supplement.stock > 0 ? `${supplement.stock} in stock` : 'Out of stock'}
                            </span>
                        </div>
                    </div>
                    <div class="card-footer bg-transparent">
                        <button class="btn btn-outline-primary w-100" onclick="viewSupplement('${supplement.id}')">
                            <i class="fas fa-eye me-2"></i>View Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    supplementList.innerHTML = html;
}

// Render no supplements state
function renderNoSupplements() {
    if (!supplementList) return;
    
    console.log("%cNo supplements found", consoleStyles.info);
    
    const template = document.getElementById("noSupplementsTemplate");
    if (template) {
        supplementList.innerHTML = template.innerHTML;
    } else {
        supplementList.innerHTML = `
            <div class="col-12">
                <div class="text-center py-5">
                    <i class="fas fa-capsules fa-3x text-muted mb-3"></i>
                    <h5>No Supplements Available</h5>
                    <p class="text-muted">You don't have any supplements assigned yet.</p>
                </div>
            </div>
        `;
    }
}

// Render error state
function renderError(message) {
    if (!supplementList) return;
    
    supplementList.innerHTML = `
        <div class="col-12">
            <div class="alert alert-warning">
                <h5><i class="fas fa-exclamation-triangle"></i> Notice</h5>
                <p>${message}</p>
                <button class="btn btn-sm btn-outline-primary mt-2" onclick="window.location.reload()">
                    <i class="fas fa-sync-alt"></i> Refresh Page
                </button>
            </div>
        </div>
    `;
}

// Update supplement count
function updateSupplementCount() {
    if (supplementCount) {
        supplementCount.textContent = `${supplements.length} supplement${supplements.length !== 1 ? 's' : ''}`;
    }
}

// View supplement details
window.viewSupplement = async (id) => {
    try {
        console.log("%cViewing supplement:", consoleStyles.info, id);
        
        const docSnap = await getDoc(doc(db, "supplements", id));
        if (docSnap.exists()) {
            const supplement = docSnap.data();
            
            // Update modal content
            document.getElementById('modalTitle').textContent = supplement.name;
            document.getElementById('modalName').textContent = supplement.name;
            document.getElementById('modalPrice').textContent = `₹${supplement.price?.toFixed(2) || '0.00'}`;
            document.getElementById('modalCategory').textContent = supplement.category;
            document.getElementById('modalCategory').className = `badge ${getCategoryBadgeClass(supplement.category)}`;
            document.getElementById('modalStock').textContent = `${supplement.stock} in stock`;
            document.getElementById('modalStock').className = `badge ${supplement.stock > 0 ? 'bg-success' : 'bg-danger'}`;
            document.getElementById('modalDescription').textContent = supplement.description || 'No description available';
            
            const dateObj = supplement.createdAt?.toDate?.() || null;
            document.getElementById('modalDate').textContent = dateObj ? dateObj.toLocaleDateString() : 'Unknown';
            
            // Handle image
            const modalImage = document.getElementById('modalImage');
            if (supplement.imageUrl) {
                modalImage.src = supplement.imageUrl;
                modalImage.style.display = 'block';
            } else {
                modalImage.style.display = 'none';
            }
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('supplementModal'));
            modal.show();
            
        } else {
            alert("Supplement not found");
        }
    } catch (error) {
        console.error("%cError viewing supplement:", consoleStyles.error, error);
        alert("Failed to load supplement details. Please try again.");
    }
};

// Helper function for category badge classes
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

// Filter supplements by category
if (filterCategory) {
    filterCategory.addEventListener("change", () => {
        if (memberDocId) {
            console.log("%cFiltering supplements by:", consoleStyles.info, filterCategory.value);
            loadMemberSupplements(memberDocId, filterCategory.value);
        }
    });
}

// Clean up listener when page is unloaded
window.addEventListener('beforeunload', () => {
    if (unsubscribe) {
        console.log("%cCleaning up supplements listener", consoleStyles.info);
        unsubscribe();
    }
});

// Prevent double initialization
window.__supplements_initialized = true;