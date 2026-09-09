"use strict";

const state = { canWrite: false };

const el = {
  status: document.getElementById("status"),

  sidebar: document.getElementById("sidebar"),
  sidebarToggleBtn: document.getElementById("sidebar-toggle-btn"),
  sidebarCollapseBtn: document.getElementById("sidebar-collapse-btn"),
  navSettings: document.getElementById("nav-settings"),

  lanToggle: document.getElementById("lan-toggle"),
  lanAddresses: document.getElementById("lan-addresses"),

  searchForm: document.getElementById("search-form"),
  searchResults: document.getElementById("search-results"),

  dashboardIdentity: document.getElementById("dashboard-identity"),
  dashboardStats: document.getElementById("dashboard-stats"),

  actorsReadonlyNote: document.getElementById("actors-readonly-note"),
  addActorForm: document.getElementById("add-actor-form"),
  actorsResults: document.getElementById("actors-results"),

  videosReadonlyNote: document.getElementById("videos-readonly-note"),
  addVideoForm: document.getElementById("add-video-form"),
  videosResults: document.getElementById("videos-results"),

  cardTemplate: document.getElementById("media-card-template"),
};

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.reason || body.error || `HTTP ${res.status}`);
  }
  return body;
}

// ---- sidebar: expanded / collapsed / hidden ------------------------------

const SIDEBAR_STATE_KEY = "sidebar-state";
let lastVisibleSidebarState = "expanded";

function applySidebarState(s) {
  el.sidebar.dataset.state = s;
  const collapsed = s === "collapsed";
  el.sidebarCollapseBtn.textContent = collapsed ? "»" : "«";
  el.sidebarCollapseBtn.title = collapsed ? "Déployer" : "Réduire";
}

function setSidebarState(s) {
  if (s !== "hidden") lastVisibleSidebarState = s;
  localStorage.setItem(SIDEBAR_STATE_KEY, s);
  applySidebarState(s);
}

function initSidebar() {
  let stored = "expanded";
  try {
    stored = localStorage.getItem(SIDEBAR_STATE_KEY) || "expanded";
  } catch {
    // localStorage unavailable — fall back to the default.
  }
  if (stored !== "hidden") lastVisibleSidebarState = stored;
  applySidebarState(stored);

  el.sidebarCollapseBtn.addEventListener("click", () => {
    const current = el.sidebar.dataset.state;
    setSidebarState(current === "collapsed" ? "expanded" : "collapsed");
  });

  el.sidebarToggleBtn.addEventListener("click", () => {
    const current = el.sidebar.dataset.state;
    setSidebarState(current === "hidden" ? lastVisibleSidebarState : "hidden");
  });
}

// ---- routing ---------------------------------------------------------

const PAGES = ["search", "settings", "dashboard", "actors", "videos"];

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "contribute") return PAGES.includes(parts[1]) ? parts[1] : "dashboard";
  return PAGES.includes(parts[0]) ? parts[0] : "search";
}

function navigateTo(page) {
  document.querySelectorAll(".page").forEach((p) => (p.hidden = p.dataset.page !== page));
  document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a.dataset.page === page));

  if (page === "dashboard") loadDashboard();
  if (page === "actors") loadActors();
  if (page === "videos") loadVideos();
}

function initRouter() {
  window.addEventListener("hashchange", () => navigateTo(parseHash()));
  if (!location.hash) location.hash = "#/search";
  navigateTo(parseHash());
}

// ---- status / write access --------------------------------------------

async function loadStatus() {
  const status = await api("/api/status");
  state.canWrite = status.canWrite;
  state.voterId = status.voterId;
  el.status.textContent = status.canWrite
    ? `Connecté en tant que ${status.voterId} (vote/tags activés)`
    : `Lecture seule${status.reason ? " — " + status.reason : ""}`;
  el.status.classList.toggle("can-write", status.canWrite);

  el.actorsReadonlyNote.hidden = status.canWrite;
  el.addActorForm.hidden = !status.canWrite;
  el.videosReadonlyNote.hidden = status.canWrite;
  el.addVideoForm.hidden = !status.canWrite;
}

async function loadLanControls() {
  // window.lanMode only exists inside the Electron shell (see preload.js) —
  // a browser hitting this page over LAN doesn't get the settings page at
  // all, since it has nothing to configure from there.
  if (!window.lanMode) return;
  el.navSettings.hidden = false;

  const refresh = (info) => {
    el.lanToggle.checked = info.enabled;
    el.lanAddresses.textContent = info.enabled
      ? `Accessible depuis : ${info.addresses.map((a) => `http://${a}:${info.port}`).join(", ") || "aucune interface réseau détectée"}`
      : "";
  };
  refresh(await window.lanMode.get());
  el.lanToggle.addEventListener("change", async () => {
    refresh(await window.lanMode.set(el.lanToggle.checked));
  });
}

// ---- media cards --------------------------------------------------------

function tagPill(tag) {
  const span = document.createElement("span");
  span.className = "tag";
  span.textContent = tag;
  return span;
}

function renderCard(media) {
  const node = el.cardTemplate.content.cloneNode(true);
  const thumbLink = node.querySelector(".thumb-link");
  const thumb = node.querySelector(".thumb");
  const placeholder = node.querySelector(".thumb-placeholder");
  const title = node.querySelector(".title");
  const tags = node.querySelector(".tags");
  const score = node.querySelector(".score");
  const voteUp = node.querySelector(".vote-up");
  const voteDown = node.querySelector(".vote-down");
  const proposeBtn = node.querySelector(".propose-tag");

  if (media.sourceUrl) {
    thumbLink.href = media.sourceUrl;
    title.href = media.sourceUrl;
  } else {
    // Actors (and any entry without a source link) get a non-clickable card.
    thumbLink.classList.add("no-link");
    title.classList.add("no-link");
  }

  if (media.thumbnailUrl) {
    thumb.src = media.thumbnailUrl;
  } else {
    thumbLink.classList.add("no-thumb");
    placeholder.textContent = (media.title || "?").charAt(0).toUpperCase();
  }
  thumb.alt = media.title;
  title.textContent = media.title;
  score.textContent = `★ ${media.score}`;
  (media.tags || []).forEach((t) => tags.appendChild(tagPill(t)));

  if (!state.canWrite) {
    voteUp.disabled = voteDown.disabled = proposeBtn.disabled = true;
  }

  voteUp.addEventListener("click", () => vote(media.id, 1, score));
  voteDown.addEventListener("click", () => vote(media.id, -1, score));
  proposeBtn.addEventListener("click", () => proposeTag(media.id, tags));

  return node;
}

async function vote(mediaId, value, scoreEl) {
  try {
    await api(`/api/entries/${mediaId}/vote`, { method: "POST", body: JSON.stringify({ value }) });
    navigateTo(parseHash());
  } catch (err) {
    alert("Vote impossible : " + err.message);
  }
}

async function proposeTag(mediaId, tagsEl) {
  const tag = prompt("Proposer un tag :");
  if (!tag) return;
  try {
    await api(`/api/entries/${mediaId}/tags`, { method: "POST", body: JSON.stringify({ tag }) });
    alert("Tag proposé — il apparaîtra une fois validé par la communauté.");
  } catch (err) {
    alert("Proposition impossible : " + err.message);
  }
}

function renderInto(container, results) {
  container.innerHTML = "";
  if (results.length === 0) {
    container.innerHTML = `<p class="empty">Aucun résultat.</p>`;
    return;
  }
  for (const media of results) container.appendChild(renderCard(media));
}

// ---- page: Recherche ------------------------------------------------

async function runSearch() {
  const q = document.getElementById("q").value;
  const kind = document.getElementById("kind").value;
  const sort = document.getElementById("sort").value;

  try {
    const params = new URLSearchParams({ q, sort });
    if (kind) params.set("kind", kind);
    const { results } = await api(`/api/search?${params}`);
    renderInto(el.searchResults, results);
  } catch (err) {
    el.searchResults.innerHTML = `<p class="error">Erreur de recherche : ${err.message}</p>`;
  }
}

el.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});

// ---- page: Contribuer / Dashboard ------------------------------------

async function loadDashboard() {
  el.dashboardIdentity.textContent = state.canWrite
    ? `Connecté en tant que ${state.voterId} — vote et propositions de tags activés.`
    : "Lecture seule sur cet appareil — le dashboard reste consultable, mais voter/proposer des tags nécessite un accès en écriture au dépôt.";

  el.dashboardStats.innerHTML = `<p class="empty">Chargement…</p>`;
  try {
    const [videos, actors] = await Promise.all([
      api("/api/search?q=&kind=video&limit=1"),
      api("/api/search?q=&kind=actor&limit=1"),
    ]);
    el.dashboardStats.innerHTML = "";
    [
      { label: "Vidéos indexées", value: videos.total },
      { label: "Acteurs indexés", value: actors.total },
    ].forEach(({ label, value }) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      card.innerHTML = `<div class="stat-value">${value}</div><div class="stat-label">${label}</div>`;
      el.dashboardStats.appendChild(card);
    });
  } catch (err) {
    el.dashboardStats.innerHTML = `<p class="error">Erreur : ${err.message}</p>`;
  }
}

// ---- page: Contribuer / Acteurs --------------------------------------

async function loadActors() {
  try {
    const { results } = await api("/api/search?q=&kind=actor&sort=recent&limit=100");
    renderInto(el.actorsResults, results);
  } catch (err) {
    el.actorsResults.innerHTML = `<p class="error">Erreur : ${err.message}</p>`;
  }
}

el.addActorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("add-actor-name").value;
  try {
    await api("/api/actors", { method: "POST", body: JSON.stringify({ name }) });
    el.addActorForm.reset();
    await loadActors();
  } catch (err) {
    alert("Ajout impossible : " + err.message);
  }
});

// ---- page: Contribuer / Vidéos ---------------------------------------

async function loadVideos() {
  try {
    const { results } = await api("/api/search?q=&kind=video&sort=recent&limit=100");
    renderInto(el.videosResults, results);
  } catch (err) {
    el.videosResults.innerHTML = `<p class="error">Erreur : ${err.message}</p>`;
  }
}

el.addVideoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById("add-video-title").value,
    sourceUrl: document.getElementById("add-video-sourceUrl").value,
    thumbnailUrl: document.getElementById("add-video-thumbnailUrl").value || undefined,
  };
  try {
    await api("/api/videos", { method: "POST", body: JSON.stringify(payload) });
    el.addVideoForm.reset();
    await loadVideos();
  } catch (err) {
    alert("Ajout impossible : " + err.message);
  }
});

// ---- boot ---------------------------------------------------------------

(async function init() {
  initSidebar();
  await loadStatus();
  await loadLanControls();
  initRouter();
  await runSearch();
})();
