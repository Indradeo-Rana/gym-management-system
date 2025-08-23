import { auth } from "../firebase-config.js";
import { onAuthStateChanged, signOut, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase-config.js";

// ✅ Emulators (for localhost only)
const initializeEmulators = () => {
  if (window.location.hostname === "localhost") {
    try {
      connectAuthEmulator(auth, "http://localhost:9099");
      connectFirestoreEmulator(db, "localhost", 8080);
      console.log("Firebase emulators initialized");
    } catch (err) {
      console.error("Emulator initialization failed:", err);
    }
  }
};

// ✅ Load modules dynamically
const moduleCache = new Map();

const loadModule = async (moduleName, uid) => {
  const moduleContainer = document.getElementById("moduleContainer");
  if (!moduleContainer) return;

  try {
    moduleContainer.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="mt-2">Loading ${moduleName}...</p>
      </div>`;

    // Load HTML content
    if (moduleCache.has(moduleName)) {
      moduleContainer.innerHTML = moduleCache.get(moduleName);
    } else {
      // Try different paths for HTML files
      const htmlPaths = [
        `/member/${moduleName}.html`,
        `../member/${moduleName}.html`,
        `./${moduleName}.html`
      ];
      
      let htmlContent = null;
      for (const path of htmlPaths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            htmlContent = await response.text();
            console.log(`Loaded HTML from: ${path}`);
            break;
          }
        } catch (err) {
          console.warn(`Failed to load HTML from ${path}:`, err);
        }
      }
      
      if (!htmlContent) {
        throw new Error(`Failed to load ${moduleName}.html from any known path`);
      }
      
      moduleCache.set(moduleName, htmlContent);
      moduleContainer.innerHTML = htmlContent;
    }

    // Try to load corresponding JS - FIXED PATH
    try {
      console.log(`Attempting to load JS for: ${moduleName}`);
      
      // FIX: Use absolute path instead of relative path
      // Since your JS files are in /js/member/ folder
      const modulePath = `/js/member/${moduleName}.js`;
      console.log(`Importing from: ${modulePath}`);
      
      // Add a cache-buster to prevent caching issues during development
      const cacheBuster = `?v=${new Date().getTime()}`;
      const moduleJS = await import(`${modulePath}${cacheBuster}`);
      
      console.log(`Successfully loaded ${moduleName}.js`);
      
      if (typeof moduleJS.init === "function") {
        await moduleJS.init(db, uid, auth);
      } else {
        console.warn(`${moduleName}.js loaded but no init function found`);
      }
    } catch (err) {
      console.error(`Failed to load JS for ${moduleName}:`, err);
      
      // Provide helpful debugging information
      if (err.message.includes('Failed to fetch')) {
        console.error(`The file /js/member/${moduleName}.js might not exist or is not accessible`);
        console.error('Check:');
        console.error('1. File exists at that path');
        console.error('2. Server is configured to serve JS files');
        console.error('3. No syntax errors in the JS file');
        
        // Show user-friendly message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-warning mt-3';
        errorDiv.innerHTML = `
          <h5>Partial Functionality</h5>
          <p>The ${moduleName} module is working with limited functionality.</p>
          <p>Some features may not be available at this time.</p>
        `;
        moduleContainer.appendChild(errorDiv);
      }
    }

    updateActiveMenu(moduleName);
  } catch (err) {
    console.error('Error loading module:', err);
    moduleContainer.innerHTML = `
      <div class="alert alert-danger">
        <h5>Error loading ${moduleName}</h5>
        <p>${err.message}</p>
        <button class="btn btn-secondary mt-2" onclick="location.reload()">
          Try Again
        </button>
      </div>`;
  }
};

const updateActiveMenu = (activeModule) => {
  document.querySelectorAll(".menu-link").forEach(link => {
    link.classList.toggle("active", link.dataset.module === activeModule);
  });
};

const setupEventListeners = (uid) => {
  document.querySelectorAll(".menu-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      loadModule(link.dataset.module, uid);
    });
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (confirm("Are you sure you want to log out?")) {
        await signOut(auth);
        window.location.href = "/index.html";
      }
    });
  }
};

// Debugging function to check if file exists
const checkFileExists = async (url) => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    console.log(`File ${url} exists: ${response.ok}`);
    return response.ok;
  } catch (err) {
    console.log(`File ${url} exists: false`);
    return false;
  }
};

initializeEmulators();

// Debug: Check if bills.js exists when page loads
window.addEventListener('load', async () => {
  console.log('Checking if bills.js exists...');
  await checkFileExists('/js/member/bills.js');
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/login.html";
  } else {
    loadModule("profile", user.uid);
    setupEventListeners(user.uid);
  }
});