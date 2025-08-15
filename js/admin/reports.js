// Initialize reports when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await loadMembershipAnalytics();
  await loadFinancialReports(new Date(), new Date());
  await loadAttendanceReports();
  await loadTrainerPerformance();
  
  // Set up event listeners
  document.getElementById('generateReportBtn').addEventListener('click', async () => {
    const startDate = new Date(document.getElementById('reportStartDate').value);
    const endDate = new Date(document.getElementById('reportEndDate').value);
    await loadFinancialReports(startDate, endDate);
  });
  
  document.getElementById('attendanceMonth').addEventListener('change', loadAttendanceReports);
  document.getElementById('attendanceFilter').addEventListener('change', loadAttendanceReports);
});

// Membership Analytics
async function loadMembershipAnalytics() {
  try {
    // Get total members
    const membersSnapshot = await getDocs(collection(db, "members"));
    document.getElementById('totalMembers').textContent = membersSnapshot.size;
    
    // Get new members this month
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const q = query(collection(db, "members"), 
                  where("joinDate", ">=", firstDay));
    const newMembersSnapshot = await getDocs(q);
    document.getElementById('newMembers').textContent = newMembersSnapshot.size;
    
    // Get renewals due (you'll need to implement this based on your membership structure)
    document.getElementById('renewalsDue').textContent = "15"; // Example
    
    // Render membership trend chart (using Chart.js)
    renderMembershipTrendChart(membersSnapshot);
    
  } catch (error) {
    console.error("Error loading membership analytics:", error);
  }
}

// Financial Reports
async function loadFinancialReports(startDate, endDate) {
  try {
    // Query payments within date range
    const q = query(collection(db, "payments"),
                  where("paymentDate", ">=", startDate),
                  where("paymentDate", "<=", endDate),
                  orderBy("paymentDate"));
    
    const paymentsSnapshot = await getDocs(q);
    
    // Process payment data
    const revenueData = processPaymentData(paymentsSnapshot);
    
    // Render charts and tables
    renderRevenueChart(revenueData);
    renderTopProductsTable(revenueData.topProducts);
    
  } catch (error) {
    console.error("Error loading financial reports:", error);
  }
}

// Attendance Reports
async function loadAttendanceReports() {
  try {
    const selectedMonth = document.getElementById('attendanceMonth').value;
    const filter = document.getElementById('attendanceFilter').value;
    
    // Query check-ins based on filters
    let q = query(collection(db, "checkins"));
    
    if (selectedMonth) {
      const monthStart = new Date(selectedMonth + "-01");
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      q = query(q, where("checkinTime", ">=", monthStart),
                where("checkinTime", "<=", monthEnd));
    }
    
    const checkinsSnapshot = await getDocs(q);
    
    // Process attendance data
    const attendanceData = processAttendanceData(checkinsSnapshot);
    
    // Render attendance table
    renderAttendanceTable(attendanceData);
    
  } catch (error) {
    console.error("Error loading attendance reports:", error);
  }
}

// Trainer Performance
async function loadTrainerPerformance() {
  try {
    // Query training sessions
    const sessionsSnapshot = await getDocs(collection(db, "trainingSessions"));
    
    // Query member feedback
    const feedbackSnapshot = await getDocs(collection(db, "trainerFeedback"));
    
    // Process trainer data
    const trainerData = processTrainerData(sessionsSnapshot, feedbackSnapshot);
    
    // Render charts and tables
    renderTrainerSessionChart(trainerData);
    renderTrainerRatingsTable(trainerData);
    
  } catch (error) {
    console.error("Error loading trainer performance:", error);
  }
}