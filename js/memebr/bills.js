import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function init(db, uid) {
  try {
    const billsList = document.getElementById('billsList');
    billsList.innerHTML = '<div class="text-center py-3"><div class="spinner-border"></div></div>';

    const q = query(collection(db, "bills"), where("memberId", "==", uid));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      billsList.innerHTML = '<div class="alert alert-info">No bills found</div>';
      return;
    }

    let html = '';
    querySnapshot.forEach((doc) => {
      const bill = doc.data();
      html += `
        <div class="list-group-item mb-2">
          <div class="d-flex justify-content-between">
            <div>
              <h5>${bill.packageName || 'Unnamed Package'}</h5>
              <p class="mb-1">Amount: ₹${bill.amount || '0'}</p>
              <small class="text-muted">Due: ${bill.dueDate || 'No due date'}</small>
            </div>
            <button class="btn btn-primary btn-sm align-self-center">Pay Now</button>
          </div>
        </div>`;
    });

    billsList.innerHTML = html || '<div class="alert alert-info">No bills found</div>';

  } catch (error) {
    console.error("Bills error:", error);
    document.getElementById('billsList').innerHTML = `
      <div class="alert alert-danger">
        Failed to load bills: ${error.message}
      </div>`;
  }
}