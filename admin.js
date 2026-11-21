
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const $ = id => document.getElementById(id);

const WORKER_URL =
  "https://mango-wedding-media.mangoweddingdev.workers.dev";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function message(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// Load projects
async function loadProjects() {
  try {
    const snapshot = await getDocs(collection(db, "projects"));

    const projects = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    projects.sort((a, b) =>
      (b.createdAt?.toMillis?.() || 0) -
      (a.createdAt?.toMillis?.() || 0)
    );

    $("adminProjects").innerHTML = projects.length
      ? projects.map(p => `
          <div class="admin-project">
            <span>
              <strong>${safe(p.title)}</strong><br>
              ${safe(p.category)}
              ${p.featured ? " ★ Featured" : ""}
            </span>
            <button type="button" data-delete="${safe(p.id)}">
              Delete
            </button>
          </div>
        `).join("")
      : "<p>No projects uploaded yet.</p>";

  } catch (error) {
    console.error("Project loading failed:", error);
    $("adminProjects").textContent =
      "Could not load projects: " + error.message;
  }
}

// Load contact settings
async function loadSettings() {
  try {
    const snapshot = await getDoc(doc(db, "settings", "contact"));

    if (!snapshot.exists()) return;

    const settings = snapshot.data();

    for (const [key, value] of Object.entries(settings)) {
      const field = $("settingsForm").elements.namedItem(key);
      if (field) field.value = value ?? "";
    }

  } catch (error) {
    console.error("Settings loading failed:", error);
  }
}

// Google Drive connection button
function setupDriveButton() {
  if ($("driveConnectPanel")) return;

  const panel = document.createElement("section");
  panel.id = "driveConnectPanel";
  panel.style.cssText =
    "padding:16px;margin:16px 0;border:1px solid #ccc;border-radius:10px;";

  const heading = document.createElement("h3");
  heading.textContent = "Google Drive Media Storage";

  const description = document.createElement("p");
  description.textContent =
    "Connect Google Drive to store portfolio photos and videos.";

  const button = document.createElement("button");
  button.type = "button";
  button.id = "driveConnectButton";
  button.textContent = "Connect Google Drive";

  const status = document.createElement("p");
  status.id = "driveConnectMessage";
  status.setAttribute("aria-live", "polite");

  button.addEventListener("click", async () => {
    const user = auth.currentUser;

    if (!user) {
      status.textContent = "Please log in first.";
      return;
    }

    button.disabled = true;
    status.textContent = "Preparing Google authorization...";

    try {
      const idToken = await user.getIdToken(true);

      const response = await fetch(`${WORKER_URL}/oauth/start`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authorization request failed.");
      }

      if (!data.authorizationUrl) {
        throw new Error("Google authorization URL was not returned.");
      }

      window.location.assign(data.authorizationUrl);

    } catch (error) {
      console.error("Google Drive connection failed:", error);
      status.textContent = error.message;
      button.disabled = false;
    }
  });

  panel.append(heading, description, button, status);
  $("dashboard").prepend(panel);
}

// Upload project to Google Drive and save details in Firestore
async function uploadProject(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');

  const formData = new FormData(form);

  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const file = formData.get("media");
  const featured = formData.get("featured") === "true";

  if (!title || !category) {
    message("uploadMessage", "Please enter a title and category.");
    return;
  }

  if (!(file instanceof File) || file.size === 0) {
    message("uploadMessage", "Please select a photo or video.");
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    message("uploadMessage", "File size must not exceed 20 MB.");
    return;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm"
  ];

  if (!allowedTypes.includes(file.type)) {
    message("uploadMessage", "Unsupported photo or video format.");
    return;
  }

  const user = auth.currentUser;

  if (!user) {
    message("uploadMessage", "Please log in again.");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Uploading...";
  message("uploadMessage", "Preparing your upload...");

  try {
    // Get Firebase authentication token
    const idToken = await user.getIdToken(true);

    // Upload file to Cloudflare Worker / Google Drive
    const driveForm = new FormData();
    driveForm.append("file", file, file.name);

    message("uploadMessage", "Uploading media to Google Drive...");

    const response = await fetch(`${WORKER_URL}/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`
      },
      body: driveForm
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Google Drive upload failed.");
    }

    if (!result.mediaUrl || !result.fileId) {
      throw new Error("Google Drive did not return a valid media URL.");
    }

    // Determine whether uploaded media is an image or video
    const mediaType = file.type.startsWith("video/")
      ? "video"
      : "image";

    message("uploadMessage", "Saving project details...");

    // Save project information in Firestore
    await addDoc(collection(db, "projects"), {
      title,
      category,
      description,
      media: result.mediaUrl,
      media_type: mediaType,
      featured,
      driveFileId: result.fileId,
      viewUrl: result.viewUrl || "",
      createdAt: serverTimestamp()
    });

    message(
      "uploadMessage",
      "Project uploaded successfully!"
    );

    form.reset();

    await loadProjects();

  } catch (error) {
    console.error("Project upload failed:", error);

    message(
      "uploadMessage",
      "Upload failed: " + error.message
    );

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Upload project";
  }
}

// Show dashboard
async function showDashboard() {
  $("loginPanel").classList.add("hidden");
  $("dashboard").classList.remove("hidden");

  setupDriveButton();

  await Promise.all([
    loadProjects(),
    loadSettings()
  ]);
}

// Login
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  const form = new FormData(e.currentTarget);
  const email = form.get("email").trim();
  const password = form.get("password");

  message("loginMessage", "Signing in...");

  try {
    await setPersistence(auth, browserLocalPersistence);

    await signInWithEmailAndPassword(auth, email, password);

    message("loginMessage", "Login successful!");

    await showDashboard();

  } catch (error) {
    console.error("Login error:", error);
    message("loginMessage", error.message);
  }
});

// Logout
$("logoutButton").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("Could not sign out. Please try again.");
  }
});

// Authentication state
onAuthStateChanged(auth, async user => {
  if (user) {
    await showDashboard();
  } else {
    $("dashboard").classList.add("hidden");
    $("loginPanel").classList.remove("hidden");
  }
});

// Upload form
$("uploadForm").addEventListener("submit", uploadProject);

// Delete project
$("adminProjects").addEventListener("click", async e => {
  const button = e.target.closest("button[data-delete]");

  if (!button || !confirm("Delete this portfolio project?")) return;

  try {
    await deleteDoc(doc(db, "projects", button.dataset.delete));
    await loadProjects();

  } catch (error) {
    console.error(error);
    alert("Could not delete project. Check your admin permissions.");
  }
});

// Save contact settings
$("settingsForm").addEventListener("submit", async e => {
  e.preventDefault();

  const body = Object.fromEntries(
    new FormData(e.currentTarget).entries()
  );

  try {
    await setDoc(doc(db, "settings", "contact"), body, {
      merge: true
    });

    message("settingsMessage", "Contact details saved successfully.");

  } catch (error) {
    console.error(error);

    message(
      "settingsMessage",
      "Could not save details. Check Firestore rules."
    );
  }
});
