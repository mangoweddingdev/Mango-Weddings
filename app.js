
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const gallery = document.getElementById("gallery");
const filters = document.getElementById("filters");
const video = document.getElementById("heroVideo");
const viewer = document.getElementById("viewer");
const viewerContent = document.getElementById("viewerContent");

let projects = [];

document.getElementById("year").textContent = new Date().getFullYear();

document.getElementById("menuToggle").addEventListener("click", () => {
  const nav = document.getElementById("mainNav");
  const open = nav.classList.toggle("open");
  document.getElementById("menuToggle").setAttribute("aria-expanded", String(open));
});

document.querySelectorAll("#mainNav a").forEach(a =>
  a.addEventListener("click", () =>
    document.getElementById("mainNav").classList.remove("open")
  )
);

window.addEventListener("scroll", () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  document.getElementById("progress").style.width =
    `${max > 0 ? scrollY / max * 100 : 0}%`;
}, { passive: true });

if (video) {
  const attempt = video.play();
  if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
  video.addEventListener("error", () => {
    video.style.display = "none";
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// Allow only HTTP and HTTPS media URLs

function safeMediaUrl(value, mediaType = "image") {
  try {
    const url = new URL(String(value ?? ""), window.location.href);

    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    // Use Google Drive thumbnail URLs for images.
    if (
      mediaType === "image" &&
      url.hostname === "drive.google.com" &&
      url.pathname === "/uc"
    ) {
      const fileId = url.searchParams.get("id");

      if (!fileId) return "";

      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
    }

    return url.href;

  } catch {
    return "";
  }
}


function renderGallery(category = "all") {
  const visible = category === "all"
    ? projects
    : projects.filter(p => p.category === category);

  if (!visible.length) {
    gallery.innerHTML =
      '<div class="empty-state">No projects in this category yet. New stories will appear here soon.</div>';
    return;
  }

  gallery.innerHTML = visible.map(p => {
    const url = safeMediaUrl(p.media, p.media_type);

    const media = !url
      ? '<div class="empty-state">Media unavailable</div>'
      : p.media_type === "video"
        ? `<video src="${escapeHtml(url)}" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(url)}" alt="${escapeHtml(p.title)}" loading="lazy">`;

    return `
      <article class="project"
        tabindex="0"
        role="button"
        aria-label="View ${escapeHtml(p.title)}"
        data-id="${escapeHtml(p.id)}">
        ${media}
        <div class="project-info">
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.category)}</p>
        </div>
      </article>
    `;
  }).join("");

  gallery.querySelectorAll(".project").forEach(card => {
    const open = () => {
      const p = projects.find(x => String(x.id) === card.dataset.id);
      if (!p) return;

      const url = safeMediaUrl(p.media);
      if (!url) return;

      viewerContent.innerHTML = p.media_type === "video"
        ? `<video src="${escapeHtml(url)}" controls autoplay playsinline></video>`
        : `<img src="${escapeHtml(url)}" alt="${escapeHtml(p.title)}">`;

      viewer.classList.add("open");
      viewer.setAttribute("aria-hidden", "false");
    };

    card.addEventListener("click", open);

    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

filters.addEventListener("click", e => {
  const btn = e.target.closest("button[data-category]");
  if (!btn) return;

  filters.querySelectorAll("button").forEach(b =>
    b.classList.remove("active")
  );

  btn.classList.add("active");
  renderGallery(btn.dataset.category);
});

function closeViewer() {
  viewer.classList.remove("open");
  viewer.setAttribute("aria-hidden", "true");
  viewerContent.innerHTML = "";
}

document.getElementById("viewerClose").addEventListener("click", closeViewer);

viewer.addEventListener("click", e => {
  if (e.target === viewer) closeViewer();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeViewer();
});

// Load projects and contact settings from Firebase
async function loadSite() {
  try {
    const [projectSnapshot, settingsSnapshot] = await Promise.all([
      getDocs(collection(db, "projects")),
      getDoc(doc(db, "settings", "contact"))
    ]);

    projects = projectSnapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    projects.sort((a, b) =>
      (b.createdAt?.toMillis?.() || 0) -
      (a.createdAt?.toMillis?.() || 0)
    );

    renderGallery();

    const settings = settingsSnapshot.exists()
      ? settingsSnapshot.data()
      : {};

    document.title =
      `${settings.businessName || "Mango Wedding"} | Stories That Stay`;

    document.querySelectorAll(".brand span:last-child").forEach(el => {
      el.innerHTML =
        `${escapeHtml(settings.businessName || "Mango Wedding").toUpperCase()} <i>PHOTOGRAPHY & FILMS</i>`;
    });

    if (settings.instagram) {
      document.getElementById("instagramLink").href = settings.instagram;
    }

    if (settings.whatsapp) {
      document.getElementById("whatsappLink").href =
        `https://wa.me/${encodeURIComponent(settings.whatsapp)}`;
    }

    if (settings.phone1) {
      const el = document.getElementById("phone1Link");
      el.textContent = settings.phone1;
      el.href = `tel:${settings.phone1.replace(/[^\d+]/g, "")}`;
    }

    if (settings.phone2) {
      const el = document.getElementById("phone2Link");
      el.textContent = settings.phone2;
      el.href = `tel:${settings.phone2.replace(/[^\d+]/g, "")}`;
    }

    if (settings.email) {
      document.getElementById("emailText").textContent = settings.email;
    }

    console.log("Main website loaded from Firebase.");
    console.log("Projects:", projects.length);

  } catch (error) {
    console.error("Website loading failed:", error);

    gallery.innerHTML =
      '<div class="empty-state">The portfolio is temporarily unavailable. Please try again in a moment.</div>';
  }
}

loadSite();
