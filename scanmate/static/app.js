const state = {
  config: null,
  scanners: [],
  selectedPreset: "document",
  batch: null,
  recent: [],
};

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `Request failed: ${response.status}`);
  }
  return data;
}

function setActivity(message, kind = "info") {
  $("activity").textContent = message || "";
  $("activity").dataset.kind = kind;
}

async function loadConfig() {
  state.config = await api("/api/config");
  state.selectedPreset = state.config.presets[0]?.id || "document";
  $("filename-template").value = state.config.naming.template;
  renderPresets();
  renderDestinations();
}

async function loadScanners() {
  const dot = $("scanner-state");
  dot.className = "dot";
  $("scanner-message").textContent = "Looking for scanners...";
  try {
    const result = await api("/api/scanners");
    state.scanners = result.devices;
    renderScanners();
    dot.className = `dot ${state.scanners.length ? "ok" : "error"}`;
    $("scanner-message").textContent = state.scanners.length
      ? `${state.scanners.length} scanner${state.scanners.length === 1 ? "" : "s"} available`
      : result.message;
  } catch (error) {
    state.scanners = [];
    renderScanners();
    dot.className = "dot error";
    $("scanner-message").textContent = error.message;
  }
}

function renderScanners() {
  const select = $("scanner-select");
  select.innerHTML = "";
  if (!state.scanners.length) {
    select.append(new Option("No scanner found", ""));
    return;
  }
  for (const scanner of state.scanners) {
    const option = new Option(`${scanner.name} (${scanner.backend})`, scanner.id);
    if (scanner.id === state.config?.scanner?.default_scanner_id) option.selected = true;
    select.append(option);
  }
}

function renderPresets() {
  const list = $("preset-list");
  list.innerHTML = "";
  for (const preset of state.config.presets) {
    const button = document.createElement("button");
    button.className = `preset ${preset.id === state.selectedPreset ? "active" : ""}`;
    button.innerHTML = `<strong>${preset.name}</strong><small>${preset.dpi} DPI · ${preset.color_mode} · ${preset.output_format.toUpperCase()}</small>`;
    button.addEventListener("click", () => {
      state.selectedPreset = preset.id;
      $("output-format").value = preset.output_format;
      $("save-mode").value = preset.multi_page ? "single_file" : "separate_files";
      renderPresets();
    });
    list.append(button);
  }
  const preset = state.config.presets.find((item) => item.id === state.selectedPreset);
  if (preset) {
    $("output-format").value = preset.output_format;
    $("save-mode").value = preset.multi_page ? "single_file" : "separate_files";
  }
}

function renderDestinations() {
  const select = $("destination-select");
  select.innerHTML = "";
  for (const destination of state.config.destinations) {
    const option = new Option(destination.name, destination.id);
    if (destination.id === state.config.default_destination_id) option.selected = true;
    select.append(option);
  }
  updateDestinationPath();
}

function updateDestinationPath() {
  const destination = selectedDestination();
  $("destination-path").textContent = destination ? destination.path : "";
}

function selectedDestination() {
  return state.config.destinations.find((item) => item.id === $("destination-select").value);
}

async function ensureBatch() {
  if (!state.batch) {
    state.batch = await api("/api/batches", { method: "POST", body: "{}" });
    renderBatch();
  }
  return state.batch;
}

async function scanPage() {
  const scannerId = $("scanner-select").value;
  if (!scannerId) {
    setActivity("No scanner is selected.", "error");
    return;
  }
  const batch = await ensureBatch();
  setActivity("Scanning page. Keep the scanner lid closed until it finishes.");
  setBusy(true);
  try {
    const result = await api("/api/scan", {
      method: "POST",
      body: JSON.stringify({
        scanner_id: scannerId,
        preset_id: state.selectedPreset,
        batch_id: batch.id,
      }),
    });
    state.batch = result.batch;
    renderBatch();
    setActivity(`Scanned page ${state.batch.pages.length}.`);
  } catch (error) {
    setActivity(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function saveBatch() {
  if (!state.batch || !state.batch.pages.length) {
    setActivity("Scan at least one page before saving.", "error");
    return;
  }
  setActivity("Saving files to destination...");
  setBusy(true);
  try {
    const result = await api(`/api/batches/${state.batch.id}/save`, {
      method: "POST",
      body: JSON.stringify({
        destination_id: $("destination-select").value,
        output_format: $("output-format").value,
        save_mode: $("save-mode").value,
        scan_type: state.selectedPreset,
        filename_template: $("filename-template").value,
      }),
    });
    state.recent.unshift(...result.saved_files);
    state.recent = state.recent.slice(0, 8);
    renderRecent();
    setActivity(`Saved ${result.saved_files.length} file${result.saved_files.length === 1 ? "" : "s"}.`);
  } catch (error) {
    setActivity(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function renderBatch() {
  const pages = $("pages");
  const count = state.batch?.pages?.length || 0;
  $("batch-summary").textContent = count ? `${count} page${count === 1 ? "" : "s"} ready` : "No pages scanned yet.";
  pages.innerHTML = "";
  pages.className = count ? "pages" : "pages empty";
  if (!count) {
    pages.innerHTML = "<p>Scanned pages will appear here before saving.</p>";
    return;
  }
  state.batch.pages.forEach((page, index) => {
    const card = document.createElement("article");
    card.className = "page-card";
    card.innerHTML = `
      <img src="${page.preview_url}?v=${encodeURIComponent(page.created_at || "")}" alt="Preview page ${index + 1}">
      <div class="page-meta">
        <strong>Page ${index + 1}</strong>
        <small>Detected: ${page.detected_type.replace("_", " ")}</small>
        <div class="page-actions">
          <button class="secondary" data-action="up">Up</button>
          <button class="secondary" data-action="down">Down</button>
          <button class="secondary" data-action="delete">Delete</button>
        </div>
      </div>`;
    card.querySelector('[data-action="up"]').disabled = index === 0;
    card.querySelector('[data-action="down"]').disabled = index === count - 1;
    card.querySelector('[data-action="up"]').addEventListener("click", () => movePage(page.id, index - 1));
    card.querySelector('[data-action="down"]').addEventListener("click", () => movePage(page.id, index + 1));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deletePage(page.id));
    pages.append(card);
  });
}

async function movePage(pageId, index) {
  const result = await api(`/api/batches/${state.batch.id}/pages/${pageId}/move`, {
    method: "POST",
    body: JSON.stringify({ index }),
  });
  state.batch = result;
  renderBatch();
}

async function deletePage(pageId) {
  const result = await api(`/api/batches/${state.batch.id}/pages/${pageId}`, { method: "DELETE" });
  state.batch = result;
  renderBatch();
}

function renderRecent() {
  $("recent-list").innerHTML = state.recent.map((path) => `<li>${path}</li>`).join("");
}

function setBusy(busy) {
  for (const id of ["scan-page", "scan-more", "save-batch", "new-batch"]) {
    $(id).disabled = busy;
  }
}

async function addDestination(event) {
  event.preventDefault();
  const name = $("destination-name").value.trim();
  const path = $("destination-folder").value.trim();
  if (!name || !path) {
    setActivity("Destination name and folder path are required.", "error");
    return;
  }
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `destination_${Date.now()}`;
  const destinations = [...state.config.destinations, { id, name, path, paperless_consume: true, description: "" }];
  state.config = await api("/api/config", {
    method: "PUT",
    body: JSON.stringify({ destinations, default_destination_id: id }),
  });
  $("destination-name").value = "";
  $("destination-folder").value = "";
  renderDestinations();
  setActivity("Destination added.");
}

function resetBatch() {
  state.batch = null;
  renderBatch();
  setActivity("");
}

function bindEvents() {
  $("refresh-scanners").addEventListener("click", loadScanners);
  $("new-batch").addEventListener("click", resetBatch);
  $("clear-batch").addEventListener("click", resetBatch);
  $("scan-page").addEventListener("click", scanPage);
  $("scan-more").addEventListener("click", scanPage);
  $("save-batch").addEventListener("click", saveBatch);
  $("destination-select").addEventListener("change", updateDestinationPath);
  $("destination-form").addEventListener("submit", addDestination);
}

async function boot() {
  bindEvents();
  renderBatch();
  await loadConfig();
  await loadScanners();
}

boot().catch((error) => setActivity(error.message, "error"));
