const DOCUMENT_TYPES = [
  { id: "document", name: "Document" },
  { id: "receipt", name: "Receipt" },
  { id: "invoice", name: "Invoice" },
  { id: "letter", name: "Letter" },
  { id: "personal", name: "Personal" },
  { id: "warranty", name: "Warranty" },
  { id: "photo", name: "Photo" },
  { id: "id_card", name: "ID or card" },
  { id: "unknown", name: "Other" },
];

const state = {
  config: null,
  scanners: [],
  selectedPreset: "document",
  scanMode: "single",
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

function slug(value, fallback = "item") {
  const clean = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return clean || `${fallback}_${Date.now()}`;
}

function setActivity(message, kind = "info") {
  $("activity").textContent = message || "";
  $("activity").dataset.kind = kind;
}

function setSettingsMessage(message) {
  $("settings-status").textContent = message || "";
}

async function loadConfig() {
  state.config = await api("/api/config");
  if (!state.config.naming.custom_prefix) state.config.naming.custom_prefix = "";
  state.selectedPreset = state.config.presets[0]?.id || "document";
  $("filename-template").value = state.config.naming.template;
  $("custom-prefix").value = state.config.naming.custom_prefix || "";
  $("settings-filename-template").value = state.config.naming.template;
  $("settings-custom-prefix").value = state.config.naming.custom_prefix || "";
  renderDocumentTypes();
  renderPresets();
  renderDestinations();
  renderSettings();
}

async function saveConfigPatch(patch) {
  state.config = await api("/api/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  renderPresets();
  renderDestinations();
  renderSettings();
  return state.config;
}

async function loadScanners() {
  const dot = $("scanner-state");
  dot.className = "status-dot";
  $("scanner-message").textContent = "Looking for scanners...";
  try {
    const result = await api("/api/scanners");
    state.scanners = result.devices;
    renderScanners();
    dot.className = `status-dot ${state.scanners.length ? "ok" : "error"}`;
    $("scanner-message").textContent = state.scanners.length
      ? `${state.scanners.length} scanner${state.scanners.length === 1 ? "" : "s"} available`
      : result.message;
  } catch (error) {
    state.scanners = [];
    renderScanners();
    dot.className = "status-dot error";
    $("scanner-message").textContent = error.message;
  }
}

function renderScanners() {
  for (const id of ["scanner-select", "settings-scanner-select"]) {
    const select = $(id);
    select.innerHTML = "";
    if (!state.scanners.length) {
      select.append(new Option("No scanner found", ""));
      continue;
    }
    for (const scanner of state.scanners) {
      const option = new Option(`${scanner.name} (${scanner.backend})`, scanner.id);
      if (scanner.id === state.config?.scanner?.default_scanner_id) option.selected = true;
      select.append(option);
    }
  }
}

function renderDocumentTypes() {
  const select = $("document-type");
  select.innerHTML = "";
  for (const type of DOCUMENT_TYPES) {
    select.append(new Option(type.name, type.id));
  }
}

function renderPresets() {
  const list = $("preset-list");
  list.innerHTML = "";
  for (const preset of state.config.presets) {
    const button = document.createElement("button");
    button.className = `preset-card ${preset.id === state.selectedPreset ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `<strong>${preset.name}</strong><span>${preset.dpi} DPI · ${preset.color_mode}</span>`;
    button.addEventListener("click", () => selectPreset(preset.id));
    list.append(button);
  }
  applyPresetDefaults();
}

function selectPreset(presetId) {
  state.selectedPreset = presetId;
  const matchingType = DOCUMENT_TYPES.find((type) => type.id === presetId);
  if (matchingType) $("document-type").value = matchingType.id;
  applyPresetDefaults();
  renderPresets();
}

function applyPresetDefaults() {
  const preset = state.config.presets.find((item) => item.id === state.selectedPreset);
  if (!preset) return;
  $("output-format").value = preset.output_format;
  if (state.scanMode === "multi_pdf") {
    $("output-format").value = "pdf";
    $("save-mode").value = "single_file";
  } else if (state.scanMode === "separate") {
    $("save-mode").value = "separate_files";
  } else {
    $("save-mode").value = "separate_files";
  }
}

function renderDestinations() {
  for (const id of ["destination-select", "settings-default-destination"]) {
    const select = $(id);
    select.innerHTML = "";
    for (const destination of state.config.destinations) {
      const option = new Option(destination.name, destination.id);
      if (destination.id === state.config.default_destination_id) option.selected = true;
      select.append(option);
    }
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

function setScanMode(mode) {
  state.scanMode = mode;
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.classList.toggle("active", button.dataset.mode === mode);
  }
  applyPresetDefaults();
  if (mode === "multi_pdf") {
    $("output-format").value = "pdf";
    $("save-mode").value = "single_file";
  }
  if (mode === "separate") {
    $("save-mode").value = "separate_files";
  }
  renderBatch();
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
        scan_type: $("document-type").value || state.selectedPreset,
        filename_template: $("filename-template").value,
        custom_prefix: $("custom-prefix").value,
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
  const modeLabel = state.scanMode === "multi_pdf" ? "multi-page PDF" : state.scanMode === "separate" ? "separate files" : "single scan";
  $("batch-summary").textContent = count ? `${count} page${count === 1 ? "" : "s"} ready · ${modeLabel}` : `No pages scanned yet · ${modeLabel}`;
  $("scan-page").textContent = count && state.scanMode !== "single" ? "Scan another page" : count ? "Scan again" : "Scan page";
  $("save-batch").disabled = count === 0;
  pages.innerHTML = "";
  pages.className = count ? "pages" : "pages empty";
  if (!count) {
    pages.innerHTML = "<p>Scanned pages appear here before saving.</p>";
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
          <button class="secondary" data-action="up" type="button">Up</button>
          <button class="secondary" data-action="down" type="button">Down</button>
          <button class="secondary danger" data-action="delete" type="button">Delete</button>
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
  for (const id of ["scan-page", "save-batch", "new-batch"]) {
    $(id).disabled = busy || (id === "save-batch" && !(state.batch?.pages?.length));
  }
}

function resetBatch() {
  state.batch = null;
  renderBatch();
  setActivity("Ready when the scanner is ready.");
}

function switchView(view) {
  $("scan-view").classList.toggle("active", view === "scan");
  $("settings-view").classList.toggle("active", view === "settings");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSettings() {
  renderDestinationSettings();
  renderPresetSettings();
  renderScanners();
  $("settings-filename-template").value = state.config.naming.template;
  $("settings-custom-prefix").value = state.config.naming.custom_prefix || "";
}

function renderDestinationSettings() {
  const list = $("destination-settings-list");
  list.innerHTML = "";
  state.config.destinations.forEach((destination, index) => {
    const card = document.createElement("article");
    card.className = "settings-card";
    card.innerHTML = `
      <details>
        <summary><strong>${destination.name || "New destination"}</strong><span>${escapeHtml(destination.path)}</span></summary>
        <label class="field"><span>Name</span><input data-field="name" value="${escapeHtml(destination.name)}"></label>
        <label class="field"><span>Folder path</span><input data-field="path" value="${escapeHtml(destination.path)}"></label>
        <label class="field"><span>Description</span><input data-field="description" value="${escapeHtml(destination.description || "")}"></label>
        <label class="check-row"><input data-field="paperless_consume" type="checkbox" ${destination.paperless_consume ? "checked" : ""}> Paperless consume folder</label>
        <button class="quiet-button danger-text" data-remove type="button">Remove destination</button>
      </details>
    `;
    bindDestinationCard(card, index);
    list.append(card);
  });
}

function bindDestinationCard(card, index) {
  card.querySelector("[data-remove]").addEventListener("click", () => {
    state.config.destinations.splice(index, 1);
    if (!state.config.destinations.length) addDestinationDraft();
    renderDestinations();
    renderDestinationSettings();
  });
  for (const input of card.querySelectorAll("[data-field]")) {
    input.addEventListener("input", () => updateDestinationDraft(index, input));
    input.addEventListener("change", () => updateDestinationDraft(index, input));
  }
}

function updateDestinationDraft(index, input) {
  const field = input.dataset.field;
  const destination = state.config.destinations[index];
  destination[field] = input.type === "checkbox" ? input.checked : input.value;
  if (field === "name") destination.id = slug(input.value, "destination");
  renderDestinations();
}

function addDestinationDraft() {
  state.config.destinations.push({
    id: `destination_${Date.now()}`,
    name: "New destination",
    path: "/paperless/consume/new",
    description: "",
    paperless_consume: true,
  });
  renderDestinations();
  renderDestinationSettings();
}

async function saveDestinations() {
  const destinations = state.config.destinations.map((destination) => ({
    ...destination,
    id: slug(destination.name, "destination"),
  }));
  const defaultDestinationId = $("settings-default-destination").value || destinations[0]?.id || "";
  await saveConfigPatch({ destinations, default_destination_id: defaultDestinationId });
  setSettingsMessage("Destinations saved.");
}

function renderPresetSettings() {
  const list = $("preset-settings-list");
  list.innerHTML = "";
  state.config.presets.forEach((preset, index) => {
    const card = document.createElement("article");
    card.className = "settings-card";
    card.innerHTML = `
      <details>
        <summary><strong>${preset.name || "New preset"}</strong><span>${preset.dpi} DPI · ${preset.color_mode} · ${preset.output_format.toUpperCase()}</span></summary>
        <div class="settings-grid">
          <label class="field"><span>Name</span><input data-field="name" value="${escapeHtml(preset.name)}"></label>
          <label class="field"><span>DPI</span><input data-field="dpi" type="number" min="75" max="2400" value="${preset.dpi}"></label>
          <label class="field"><span>Color</span><select data-field="color_mode">${options(["Color", "Gray", "Lineart"], preset.color_mode)}</select></label>
          <label class="field"><span>Page size</span><input data-field="page_size" value="${escapeHtml(preset.page_size)}"></label>
          <label class="field"><span>Output</span><select data-field="output_format">${options(["pdf", "jpeg"], preset.output_format)}</select></label>
          <label class="field"><span>Compression</span><select data-field="compression">${options(["low", "medium", "high"], preset.compression)}</select></label>
          <label class="field"><span>Enhancement</span><select data-field="enhancement_profile">${enhancementOptions(preset.enhancement_profile)}</select></label>
          <label class="check-row"><input data-field="multi_page" type="checkbox" ${preset.multi_page ? "checked" : ""}> Usually multi-page</label>
          <label class="field wide"><span>Description</span><input data-field="description" value="${escapeHtml(preset.description || "")}"></label>
        </div>
        <button class="quiet-button danger-text" data-remove type="button">Remove preset</button>
      </details>
    `;
    bindPresetCard(card, index);
    list.append(card);
  });
}

function bindPresetCard(card, index) {
  card.querySelector("[data-remove]").addEventListener("click", () => {
    state.config.presets.splice(index, 1);
    if (!state.config.presets.length) addPresetDraft();
    state.selectedPreset = state.config.presets[0]?.id || "document";
    renderPresets();
    renderPresetSettings();
  });
  for (const input of card.querySelectorAll("[data-field]")) {
    input.addEventListener("input", () => updatePresetDraft(index, input));
    input.addEventListener("change", () => updatePresetDraft(index, input));
  }
}

function updatePresetDraft(index, input) {
  const preset = state.config.presets[index];
  const field = input.dataset.field;
  if (input.type === "checkbox") {
    preset[field] = input.checked;
  } else if (input.type === "number") {
    preset[field] = Number(input.value);
  } else {
    preset[field] = input.value;
  }
  if (field === "name") preset.id = slug(input.value, "preset");
  renderPresets();
}

function addPresetDraft() {
  state.config.presets.push({
    id: `preset_${Date.now()}`,
    name: "New preset",
    description: "",
    dpi: 300,
    color_mode: "Gray",
    page_size: "Auto",
    output_format: "pdf",
    compression: "medium",
    enhancement_profile: state.config.enhancements[0]?.id || "clean_document",
    multi_page: false,
  });
  renderPresets();
  renderPresetSettings();
}

async function savePresets() {
  const presets = state.config.presets.map((preset) => ({ ...preset, id: slug(preset.name, "preset") }));
  await saveConfigPatch({ presets });
  state.selectedPreset = state.config.presets[0]?.id || state.selectedPreset;
  setSettingsMessage("Presets saved.");
}

async function saveNaming() {
  await saveConfigPatch({
    naming: {
      template: $("settings-filename-template").value || "{date}_{scan_type}_{counter}",
      custom_prefix: $("settings-custom-prefix").value,
    },
  });
  $("filename-template").value = state.config.naming.template;
  $("custom-prefix").value = state.config.naming.custom_prefix || "";
  setSettingsMessage("Naming saved.");
}

async function saveScannerSettings() {
  await saveConfigPatch({ default_scanner_id: $("settings-scanner-select").value });
  setSettingsMessage("Scanner preference saved.");
}

function options(values, selected) {
  return values.map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function enhancementOptions(selected) {
  return state.config.enhancements
    .map((profile) => `<option value="${profile.id}" ${profile.id === selected ? "selected" : ""}>${profile.name}</option>`)
    .join("");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bindEvents() {
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => switchView(button.dataset.view));
  }
  for (const button of document.querySelectorAll("[data-mode]")) {
    button.addEventListener("click", () => setScanMode(button.dataset.mode));
  }
  $("refresh-scanners").addEventListener("click", loadScanners);
  $("new-batch").addEventListener("click", resetBatch);
  $("clear-batch").addEventListener("click", resetBatch);
  $("scan-page").addEventListener("click", scanPage);
  $("save-batch").addEventListener("click", saveBatch);
  $("destination-select").addEventListener("change", updateDestinationPath);
  $("add-destination").addEventListener("click", addDestinationDraft);
  $("save-destinations").addEventListener("click", saveDestinations);
  $("add-preset").addEventListener("click", addPresetDraft);
  $("save-presets").addEventListener("click", savePresets);
  $("save-naming").addEventListener("click", saveNaming);
  $("save-scanner-settings").addEventListener("click", saveScannerSettings);
}

async function boot() {
  bindEvents();
  renderBatch();
  await loadConfig();
  await loadScanners();
}

boot().catch((error) => setActivity(error.message, "error"));
