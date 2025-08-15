// Import initialized instances and emulator connectors from config
import { auth, db } from "../firebase-config.js";

import { 
  onAuthStateChanged, 
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { 
  connectFirestoreEmulator 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Initialize Emulators (development only)
const initializeEmulators = () => {
  if (window.location.hostname === "localhost") {
    try {
      connectAuthEmulator(auth, "http://localhost:9099");
      connectFirestoreEmulator(db, "localhost", 8080);
      console.log("Firebase emulators initialized");
    } catch (emulatorError) {
      console.error("Emulator initialization failed:", emulatorError);
    }
  }
};

// Module Loader with Cache
const moduleCache = new Map();

const loadModule = async (moduleName, uid) => {
  const moduleContainer = document.getElementById('moduleContainer');
  if (!moduleContainer) {
    console.error('Module container not found');
    return;
  }

  try {
    // Show loading state
    moduleContainer.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2">Loading ${moduleName}...</p>
      </div>`;

    // Check cache first
    if (moduleCache.has(moduleName)) {
      moduleContainer.innerHTML = moduleCache.get(moduleName);
    } else {
      // Load HTML content
      const htmlPath = `/member/${moduleName}.html`;
      const response = await fetch(htmlPath);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const htmlContent = await response.text();
      moduleCache.set(moduleName, htmlContent);
      moduleContainer.innerHTML = htmlContent;
    }

    // Load JS module
    try {
      const modulePath = `/js/member/${moduleName}.js`;
      const moduleJS = await import(modulePath);
      
      if (typeof moduleJS.init === 'function') {
        await moduleJS.init(db, uid, auth);
      }
    } catch (jsError) {
      console.warn(`No JS module found for ${moduleName}:`, jsError);
    }

    updateActiveMenu(moduleName);

  } catch (error) {
    console.error(`Module load error (${moduleName}):`, error);
    moduleContainer.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle"></i>
        Failed to load ${moduleName}: ${error.message}
        <button class="btn btn-sm btn-outline-primary mt-2" onclick="location.reload()">
          Retry
        </button>
      </div>`;
  }
};

// Helper function
const updateActiveMenu = (activeModule) => {
  document.querySelectorAll('.menu-link').forEach(link => {
    link.classList.toggle('active', link.dataset.module === activeModule);
  });
};

// Event Listeners with Error Handling
const setupEventListeners = (uid) => {
  // Menu navigation
  document.querySelectorAll('.menu-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      try {
        loadModule(link.dataset.module, uid);
      } catch (navError) {
        console.error('Navigation error:', navError);
      }
    });
  });

  // Logout with enhanced feedback
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        const confirmLogout = confirm('Are you sure you want to log out?');
        if (confirmLogout) {
          await signOut(auth);
          window.location.href = '/login.html';
        }
      } catch (logoutError) {
        console.error('Logout failed:', logoutError);
        alert('Logout failed. Please try again.');
      }
    });
  }
};

// Initialize App with Error Boundary
try {
  initializeEmulators();
  
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    
    try {
      loadModule('profile', user.uid);
      setupEventListeners(user.uid);
    } catch (initError) {
      console.error('Initialization error:', initError);
      document.getElementById('moduleContainer').innerHTML = `
        <div class="alert alert-danger">
          System initialization failed. Please refresh the page.
        </div>`;
    }
  });
} catch (appError) {
  console.error('Fatal application error:', appError);
  document.body.innerHTML = `
    <div class="container mt-5">
      <div class="alert alert-danger">
        <h4>Application Error</h4>
        <p>Critical system failure. Please contact support.</p>
      </div>
    </div>`;
}