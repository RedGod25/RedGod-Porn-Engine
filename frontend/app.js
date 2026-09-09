"use strict";

const state = { canWrite: false };

const el = {
  status: document.getElementById("status"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsOverlay: document.getElementById("settings-overlay"),
  settingsClose: document.getElementById("settings-close"),
  lanToggle: document.getElementById("lan-toggle"),
  lanAddresses: document.getElementById("lan-addresses"),
  addPanel: document.getElementById("add-panel"),
  addForm: document.getElementById("add-form"),
  searchForm: document.getElementById("search-form"),
  results: document.getElementById("results"),
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

async function loadStatus() {
  const status = await api("/api/status");
  state.canWrite = status.canWrite;
  el.status.textContent = status.canWrite
    ? `Connecté en tant que ${status.voterId} (vote/tags activés)`
    : `Lecture seule${status.reason ? " — " + status.reason : ""}`;
  el.status.classList.toggle("can-write", status.canWrite);
  el.addPanel.hidden = !status.canWrite;
}

async function loadLanControls() {
  // window.lanMode only exists inside the Electron shell (see preload.js) —
  // a browser hitting this page over LAN doesn't get the settings button at
  // all, since it has nothing to configure from there.
  if (!window.lanMode) return;
  el.settingsBtn.hidden = false;

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

  el.settingsBtn.addEventListener("click", () => (el.settingsOverlay.hidden = false));
  el.settingsClose.addEventListener("click", () => (el.settingsOverlay.hidden = true));
  el.settingsOverlay.addEventListener("click", (e) => {
    if (e.target === el.settingsOverlay) el.settingsOverlay.hidden = true;
  });
}

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
  const title = node.querySelector(".title");
  const tags = node.querySelector(".tags");
  const score = node.querySelector(".score");
  const voteUp = node.querySelector(".vote-up");
  const voteDown = node.querySelector(".vote-down");
  const proposeBtn = node.querySelector(".propose-tag");

  thumbLink.href = media.sourceUrl;
  thumb.src = media.thumbnailUrl || "";
  thumb.alt = media.title;
  title.href = media.sourceUrl;
  title.textContent = media.title;
  score.textContent = `★ ${media.score}`;
  media.tags.forEach((t) => tags.appendChild(tagPill(t)));

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
    await runSearch();
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

async function runSearch() {
  const q = document.getElementById("q").value;
  const kind = document.getElementById("kind").value;
  const sort = document.getElementById("sort").value;

  el.results.innerHTML = "";
  try {
    const params = new URLSearchParams({ q, sort });
    if (kind) params.set("kind", kind);
    const { results } = await api(`/api/search?${params}`);

    if (results.length === 0) {
      el.results.innerHTML = `<p class="empty">Aucun résultat.</p>`;
      return;
    }
    for (const media of results) {
      el.results.appendChild(renderCard(media));
    }
  } catch (err) {
    el.results.innerHTML = `<p class="error">Erreur de recherche : ${err.message}</p>`;
  }
}

el.searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});

el.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById("add-title").value,
    sourceUrl: document.getElementById("add-sourceUrl").value,
    thumbnailUrl: document.getElementById("add-thumbnailUrl").value || undefined,
  };
  try {
    await api("/api/videos", { method: "POST", body: JSON.stringify(payload) });
    el.addForm.reset();
    await runSearch();
  } catch (err) {
    alert("Ajout impossible : " + err.message);
  }
});

(async function init() {
  await loadStatus();
  await loadLanControls();
  await runSearch();
})();
