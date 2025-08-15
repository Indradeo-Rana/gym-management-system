import {app, auth, db } from "../firebase-config.js"
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// DOM Elements
const billForm = document.getElementById("billForm");
const memberSelect = document.getElementById("memberSelect");
const packageSelect = document.getElementById("packageSelect");
const dueDate = document.getElementById("dueDate");
const amountField = document.getElementById("amount");
const billList = document.getElementById("billList");
const submitText = document.getElementById("submitText");
const submitSpinner = document.getElementById("submitSpinner");

// Data Stores
let packagesData = {};
let membersData = {};
let billsData = {};

// 🔐 Authentication Check
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/public/login.html";
    return;
  }

  try {
    // Verify admin role
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists() || userDoc.data().role !== "admin") {
      alert("Access Denied: Administrator privileges required");
      await signOut(auth);
      window.location.href = "/public/login.html";
      return;
    }

    // Load initial data
    await loadMembers();
    await loadPackages();
    setupRealTimeUpdates();
    
    // Set default due date to today + 7 days
    const today = new Date();
    const nextWeek = new Date(today.setDate(today.getDate() + 7));
    dueDate.valueAsDate = nextWeek;
    
  } catch (error) {
    console.error("Authentication error:", error);
    alert("Error verifying access. Please try again.");
    window.location.href = "/public/login.html";
  }
});


// ✅ Load Members with Proper Names
async function loadMembers() {
  try {
    const querySnapshot = await getDocs(collection(db, "members"));
    
    membersData = {};
    memberSelect.innerHTML = '<option value="" selected disabled>Select member</option>';
    
    querySnapshot.forEach(doc => {
      const member = doc.data();
      membersData[doc.id] = member;
      
      // Check for different possible name fields
      const memberName = member.fullName || member.name || member.memberName || 
                        `${member.firstName || ''} ${member.lastName || ''}`.trim() || 
                        `Member ${doc.id.substring(0, 5)}`;
      
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = memberName;
      memberSelect.appendChild(option);
    });
    
    if (querySnapshot.empty) {
      memberSelect.innerHTML = '<option value="" selected disabled>No members found</option>';
    }
    
  } catch (error) {
    console.error("Error loading members:", error);
    memberSelect.innerHTML = '<option value="" selected disabled>Error loading members</option>';
  }
}

// ✅ Load Fee Packages
async function loadPackages() {
  try {
    const querySnapshot = await getDocs(collection(db, "feePackages"));
    
    packagesData = {};
    packageSelect.innerHTML = '<option value="" selected disabled>Select package</option>';
    
    querySnapshot.forEach(doc => {
      const pkg = doc.data();
      packagesData[doc.id] = pkg;
      
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = `${pkg.name} (₹${pkg.price || pkg.amount})`;
      packageSelect.appendChild(option);
    });
    
    if (querySnapshot.empty) {
      packageSelect.innerHTML = '<option value="" selected disabled>No packages found</option>';
    }
    
  } catch (error) {
    console.error("Error loading packages:", error);
    packageSelect.innerHTML = '<option value="" selected disabled>Error loading packages</option>';
  }
}

// Auto-update amount when package changes
packageSelect.addEventListener("change", () => {
  const selectedPackage = packagesData[packageSelect.value];
  amountField.value = selectedPackage ? (selectedPackage.price || selectedPackage.amount) : "";
});


// ✅ Generate Bill with Correct Member Name
billForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const memberId = memberSelect.value;
  const packageId = packageSelect.value;
  const due = dueDate.value;
  const selectedPackage = packagesData[packageId];
  const selectedMember = membersData[memberId];
  
  // Get the member name from all possible fields
  const memberName = selectedMember?.fullName || selectedMember?.name || 
                    selectedMember?.memberName ||
                    `${selectedMember?.firstName || ''} ${selectedMember?.lastName || ''}`.trim() || 
                    `Member ${memberId.substring(0, 5)}`;

  // Validation
  if (!memberId || !packageId || !due) {
    alert("Please fill all required fields");
    return;
  }
  
  if (!selectedPackage) {
    alert("Invalid package selected");
    return;
  }

  try {
    // Show loading state
    submitText.classList.add("d-none");
    submitSpinner.classList.remove("d-none");
    billForm.querySelector("button").disabled = true;
    
    await addDoc(collection(db, "bills"), {
      memberId,
      memberName: memberName, // Store the resolved name
      packageId,
      packageName: selectedPackage.name,
      amount: selectedPackage.price || selectedPackage.amount,
      dueDate: due,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    // Reset form
    billForm.reset();
    amountField.value = "";
    
  } catch (error) {
    console.error("Error generating bill:", error);
    alert(`Failed to generate bill: ${error.message}`);
    
  } finally {
    // Reset button state
    submitText.classList.remove("d-none");
    submitSpinner.classList.add("d-none");
    billForm.querySelector("button").disabled = false;
  }
});

//✅ Update real-time display to use stored memberName
function setupRealTimeUpdates() {
  const q = query(collection(db, "bills"), orderBy("createdAt", "desc"));
  
  onSnapshot(q, (snapshot) => {
    billsData = {};
    let html = "";
    
    if (snapshot.empty) {
      html = '<tr><td colspan="6" class="text-center">No bills found</td></tr>';
    } else {
      snapshot.forEach(doc => {
        const bill = doc.data();
        billsData[doc.id] = bill;
        
        html += `
          <tr>
            <td>${bill.memberName || 'Unknown Member'}</td>
            <td>${bill.packageName}</td>
            <td>₹${bill.amount}</td>
            <td>${formatDate(bill.dueDate)}</td>
            <td>
              <span class="badge ${getStatusBadgeClass(bill.status)}">
                ${bill.status || 'pending'}
              </span>
            </td>
            <td class="text-nowrap">
              <button class="btn btn-sm btn-danger" onclick="deleteBill('${doc.id}')">
                Delete
              </button>
            </td>
          </tr>
        `;
      });
    }
    
    billList.innerHTML = html;
  });
}

// Helper function to format date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return isNaN(date) ? dateString : date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

// Helper function for status badges
function getStatusBadgeClass(status) {
  switch (status) {
    case 'paid': return 'bg-success';
    case 'pending': return 'bg-warning text-dark';
    case 'overdue': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

// ✅ Delete Bill
window.deleteBill = async (id) => {
  if (!confirm("Are you sure you want to delete this bill?")) return;
  
  try {
    await deleteDoc(doc(db, "bills", id));
  } catch (error) {
    console.error("Error deleting bill:", error);
    alert(`Failed to delete bill: ${error.message}`);
  }
};