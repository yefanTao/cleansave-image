import {
  DEFAULT_SETTINGS,
  FREE_BATCH_ZIP_LIMIT,
  buildOutputFilename,
  convertImageBlob,
  dataUrlToBlob,
  extractDomainFromUrl,
  extractNameFromUrl,
  formatBytes,
  sanitizeHexColor,
  verifyLicenseKey,
} from './lib/core.js';
import { buildZipBlob } from './lib/zip.js';

const els = {
  sourceSubtitle: document.getElementById('sourceSubtitle'),
  topProPill: document.getElementById('topProPill'),
  tabPage: document.getElementById('tabPage'),
  tabLocal: document.getElementById('tabLocal'),
  localDropSection: document.getElementById('localDropSection'),
  dropzone: document.getElementById('dropzone'),
  localFileInput: document.getElementById('localFileInput'),
  minPxGroup: document.getElementById('minPxGroup'),
  formatFilter: document.getElementById('formatFilter'),
  searchInput: document.getElementById('searchInput'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  clearSelBtn: document.getElementById('clearSelBtn'),
  gridSummary: document.getElementById('gridSummary'),
  imageGrid: document.getElementById('imageGrid'),
  emptyState: document.getElementById('emptyState'),
  emptyReason: document.getElementById('emptyReason'),
  selectedCountPill: document.getElementById('selectedCountPill'),
  outFormat: document.getElementById('outFormat'),
  qualityField: document.getElementById('qualityField'),
  batchQuality: document.getElementById('batchQuality'),
  batchQualityVal: document.getElementById('batchQualityVal'),
  bgFillField: document.getElementById('bgFillField'),
  batchBgPicker: document.getElementById('batchBgPicker'),
  batchBgColor: document.getElementById('batchBgColor'),
  batchResize: document.getElementById('batchResize'),
  batchMaxWidthWrap: document.getElementById('batchMaxWidthWrap'),
  batchMaxWidth: document.getElementById('batchMaxWidth'),
  batchPattern: document.getElementById('batchPattern'),
  batchLimitBanner: document.getElementById('batchLimitBanner'),
  batchLimitText: document.getElementById('batchLimitText'),
  downloadZipBtn: document.getElementById('downloadZipBtn'),
  progressWrap: document.getElementById('progressWrap'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  exportStatus: document.getElementById('exportStatus'),
  proUpsellBox: document.getElementById('proUpsellBox'),
  batchKeyInput: document.getElementById('batchKeyInput'),
  batchUnlockBtn: document.getElementById('batchUnlockBtn'),
  batchKeyStatus: document.getElementById('batchKeyStatus'),
};

let settings = { ...DEFAULT_SETTINGS };
let activeMode = 'page'; // 'page' | 'local'
let minPx = 500;
let scanMeta = { pageUrl: '', pageTitle: '', tabId: null };
let pageImages = [];
let localImages = [];
const selectedIds = new Set();

function activeItems() {
  return activeMode === 'local' ? localImages : pageImages;
}

function getFilteredItems() {
  const fmtFilter = els.formatFilter.value;
  const query = els.searchInput.value.trim().toLowerCase();

  return activeItems().filter((item) => {
    const maxDim = Math.max(item.width || 0, item.height || 0);
    if (minPx > 0 && maxDim > 0 && maxDim < minPx) return false;
    if (minPx > 0 && maxDim === 0 && activeMode === 'page') return false;

    if (fmtFilter === 'modern' && item.format !== 'WEBP' && item.format !== 'AVIF') return false;
    if (fmtFilter === 'PNG' && item.format !== 'PNG') return false;
    if (fmtFilter === 'JPG' && item.format !== 'JPG') return false;

    if (query) {
      const hay = `${item.name} ${item.alt || ''} ${item.url || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

function setStatus(el, msg, kind = '') {
  el.textContent = msg || '';
  el.className = 'status-msg' + (kind ? ` ${kind}` : '');
}

function applyProUi() {
  const isPro = Boolean(settings.proActivated);
  els.topProPill.textContent = isPro ? 'Pro Unlocked · Unlimited' : `Free (${FREE_BATCH_ZIP_LIMIT} ZIP limit)`;
  els.topProPill.className = isPro ? 'pill pill-emerald' : 'pill pill-cobalt';
  els.proUpsellBox.classList.toggle('hidden', isPro);

  document.querySelectorAll('[data-pro-pill]').forEach((p) => {
    p.textContent = isPro ? 'Pro ✓' : 'Pro';
    p.classList.toggle('unlocked', isPro);
  });

  els.batchQuality.disabled = !isPro;
  els.batchBgColor.disabled = !isPro;
  els.batchBgPicker.disabled = !isPro;
  els.batchResize.disabled = !isPro;
  els.batchMaxWidth.disabled = !isPro;
  els.batchPattern.disabled = !isPro;
  document.querySelectorAll('.chip[data-pattern]').forEach((b) => {
    b.disabled = !isPro;
  });

  if (!isPro) {
    els.batchResize.value = 'original';
    els.batchBgColor.value = '#FFFFFF';
    els.batchBgPicker.value = '#FFFFFF';
    els.batchPattern.value = '{name}';
    els.batchQuality.value = els.outFormat.value === 'webp' ? '90' : '92';
    els.batchQualityVal.textContent = `${els.batchQuality.value}%`;
  } else {
    els.batchResize.value = settings.resizePreset || 'original';
    els.batchBgColor.value = sanitizeHexColor(settings.transparentBg);
    els.batchBgPicker.value = sanitizeHexColor(settings.transparentBg);
    els.batchPattern.value = settings.filenamePattern || '{domain}-{date}-{index}';
    els.batchQuality.value = String(els.outFormat.value === 'webp' ? settings.webpQuality : settings.jpgQuality);
    els.batchQualityVal.textContent = `${els.batchQuality.value}%`;
  }

  els.batchMaxWidthWrap.classList.toggle('hidden', !isPro || els.batchResize.value !== 'max-width');
  updateExportButton();
}

function updateExportButton() {
  const count = selectedIds.size;
  els.selectedCountPill.textContent = `${count} selected`;
  els.downloadZipBtn.disabled = count === 0;

  if (count === 0) {
    els.batchLimitBanner.classList.add('hidden');
    els.downloadZipBtn.textContent = 'Convert & Download ZIP';
    return;
  }

  const overFreeLimit = !settings.proActivated && count > FREE_BATCH_ZIP_LIMIT;
  els.batchLimitBanner.classList.toggle('hidden', !overFreeLimit);
  if (overFreeLimit) {
    els.batchLimitText.textContent = `Selected ${count} images — Free exports first ${FREE_BATCH_ZIP_LIMIT}`;
    els.downloadZipBtn.textContent = `Free ZIP First ${FREE_BATCH_ZIP_LIMIT} ($9 Unlocks All ${count})`;
  } else {
    els.downloadZipBtn.textContent = `Convert & Download ZIP (${count} ${count === 1 ? 'image' : 'images'})`;
  }
}

function renderGrid() {
  const filtered = getFilteredItems();
  const total = activeItems().length;

  els.gridSummary.textContent = `Showing ${filtered.length} of ${total} images` +
    (minPx > 0 ? ` (≥ ${minPx}px)` : '');

  els.imageGrid.innerHTML = '';
  if (filtered.length === 0) {
    els.emptyState.classList.remove('hidden');
    els.emptyReason.textContent = total === 0
      ? (activeMode === 'local'
        ? 'Drop or paste WebP, AVIF, PNG, JPG, or SVG images above to convert them locally.'
        : 'No images were found on the scanned page. Switch to Local Drop / Paste to convert files from your computer.')
      : 'No images match the current Min Size or format filter. Try selecting "All".';
    updateExportButton();
    return;
  }

  els.emptyState.classList.add('hidden');
  const frag = document.createDocumentFragment();

  for (const item of filtered) {
    const isSel = selectedIds.has(item.id);
    const card = document.createElement('div');
    card.className = 'img-card' + (isSel ? ' selected' : '');

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'img-thumb-wrap';

    const imgEl = document.createElement('img');
    imgEl.src = item.previewUrl || item.url;
    imgEl.alt = item.alt || item.name;
    imgEl.loading = 'lazy';
    imgEl.onload = () => {
      if (!item.width && imgEl.naturalWidth) {
        item.width = imgEl.naturalWidth;
        item.height = imgEl.naturalHeight;
        dimsSpan.textContent = `${item.width}×${item.height}`;
      }
    };

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'img-check';
    checkbox.checked = isSel;
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSelect(item.id);
    });

    const fmtBadge = document.createElement('span');
    fmtBadge.className = 'img-fmt-badge';
    fmtBadge.textContent = item.format || 'IMG';

    thumbWrap.appendChild(imgEl);
    thumbWrap.appendChild(checkbox);
    thumbWrap.appendChild(fmtBadge);

    const meta = document.createElement('div');
    meta.className = 'img-meta';

    const nameEl = document.createElement('div');
    nameEl.className = 'img-name';
    nameEl.title = item.name;
    nameEl.textContent = item.name;

    const dimsRow = document.createElement('div');
    dimsRow.className = 'img-dims';

    const dimsSpan = document.createElement('span');
    dimsSpan.textContent = item.width && item.height ? `${item.width}×${item.height}` : 'Loading...';

    const singleBtn = document.createElement('button');
    singleBtn.type = 'button';
    singleBtn.className = 'btn btn-secondary btn-sm';
    singleBtn.style.padding = '2px 7px';
    singleBtn.style.fontSize = '11px';
    singleBtn.textContent = 'Save';
    singleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      convertAndDownloadSingle(item);
    });

    dimsRow.appendChild(dimsSpan);
    dimsRow.appendChild(singleBtn);
    meta.appendChild(nameEl);
    meta.appendChild(dimsRow);

    card.appendChild(thumbWrap);
    card.appendChild(meta);
    card.addEventListener('click', () => toggleSelect(item.id));
    frag.appendChild(card);
  }

  els.imageGrid.appendChild(frag);
  updateExportButton();
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderGrid();
}

function getCurrentConvertOptions() {
  const isPro = Boolean(settings.proActivated);
  const format = els.outFormat.value;
  return {
    format,
    quality: isPro ? Number(els.batchQuality.value) : (format === 'webp' ? 90 : 92),
    transparentBg: isPro ? sanitizeHexColor(els.batchBgColor.value) : '#FFFFFF',
    resizePreset: isPro ? els.batchResize.value : 'original',
    customMaxWidth: isPro ? Number(els.batchMaxWidth.value) || 1600 : 1600,
    filenamePattern: isPro ? (els.batchPattern.value.trim() || '{name}') : '{name}',
  };
}

/**
 * Acquire a clean Blob for an item without <all_urls>:
 *  1. Local File / Blob
 *  2. Inline pre-captured Data URL from scan
 *  3. Direct CORS fetch (for ACAO:* CDNs)
 *  4. Active-tab page-context capture via background.js (if original tab is still open)
 */
async function resolveItemBlob(item) {
  if (item.file instanceof Blob) return item.file;
  if (item.inlineDataUrl && item.inlineDataUrl.startsWith('data:')) {
    return dataUrlToBlob(item.inlineDataUrl);
  }
  if (item.url && item.url.startsWith('data:')) {
    return dataUrlToBlob(item.url);
  }

  // Try direct CORS fetch
  try {
    const res = await fetch(item.url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
    if (res.ok) {
      const b = await res.blob();
      if (b.size > 0) return b;
    }
  } catch {
    // Fall through to tab capture
  }

  // Try page-context capture on the scanned tab
  if (typeof scanMeta.tabId === 'number') {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'CAPTURE_FROM_SCANNED_TAB',
        tabId: scanMeta.tabId,
        srcUrl: item.url,
      });
      if (res?.ok && res.dataUrl) {
        return dataUrlToBlob(res.dataUrl);
      }
    } catch {
      // Tab closed or CORS blocked
    }
  }

  const err = new Error('Strict third-party CDN blocked cross-origin access.');
  err.code = 'CORS_BLOCKED';
  throw err;
}

async function convertAndDownloadSingle(item) {
  setStatus(els.exportStatus, `Converting ${item.name}...`);
  try {
    const opts = getCurrentConvertOptions();
    const srcBlob = await resolveItemBlob(item);
    const converted = await convertImageBlob(srcBlob, opts);
    const filename = buildOutputFilename(opts.filenamePattern, {
      srcUrl: item.url,
      pageUrl: scanMeta.pageUrl,
      name: item.name,
      format: opts.format,
      width: converted.width,
      height: converted.height,
      index: 1,
    });
    const url = URL.createObjectURL(converted.blob);
    await chrome.downloads.download({ url, filename, conflictAction: 'uniquify' });
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus(els.exportStatus, `Saved ${filename} (${converted.width}×${converted.height} · ${formatBytes(converted.blob.size)})`, 'ok');
  } catch (err) {
    setStatus(
      els.exportStatus,
      err?.code === 'CORS_BLOCKED'
        ? `Skipped "${item.name}": CDN blocks cross-origin canvas access (CleanSave never requests <all_urls>).`
        : (err?.message || 'Conversion failed.'),
      'err'
    );
  }
}

async function runBatchZipExport() {
  const allById = new Map(activeItems().map((it) => [it.id, it]));
  let targets = Array.from(selectedIds).map((id) => allById.get(id)).filter(Boolean);
  if (targets.length === 0) return;

  let truncatedNotice = '';
  if (!settings.proActivated && targets.length > FREE_BATCH_ZIP_LIMIT) {
    truncatedNotice = ` (Free mode zipped first ${FREE_BATCH_ZIP_LIMIT} of ${targets.length} — unlock Pro for unlimited!)`;
    targets = targets.slice(0, FREE_BATCH_ZIP_LIMIT);
  }

  const opts = getCurrentConvertOptions();
  els.downloadZipBtn.disabled = true;
  els.progressWrap.classList.remove('hidden');
  els.progressFill.style.width = '0%';
  setStatus(els.exportStatus, '');

  const zipEntries = [];
  const skipped = [];

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    els.progressText.textContent = `Converting ${i + 1} / ${targets.length}: ${item.name}`;
    els.progressFill.style.width = `${Math.round(((i + 0.3) / targets.length) * 100)}%`;

    try {
      const srcBlob = await resolveItemBlob(item);
      const converted = await convertImageBlob(srcBlob, opts);
      const buf = await converted.blob.arrayBuffer();
      const outName = buildOutputFilename(opts.filenamePattern, {
        srcUrl: item.url,
        pageUrl: scanMeta.pageUrl,
        name: item.name,
        format: opts.format,
        width: converted.width,
        height: converted.height,
        index: i + 1,
      });
      zipEntries.push({ name: outName, data: new Uint8Array(buf) });
    } catch (err) {
      skipped.push(`${item.name} — ${err?.message || 'Conversion error'}`);
    }

    els.progressFill.style.width = `${Math.round(((i + 1) / targets.length) * 100)}%`;
  }

  if (zipEntries.length === 0) {
    els.downloadZipBtn.disabled = false;
    setStatus(
      els.exportStatus,
      'Selected images are hosted on a strict no-CORS CDN. CleanSave never requests <all_urls>; download originals or drop local files into the Local Drop tab.',
      'err'
    );
    return;
  }

  if (skipped.length > 0) {
    const report = [
      'CleanSave Image — Batch Conversion Report',
      'Some images were skipped because their third-party CDN blocks cross-origin canvas access',
      'and CleanSave strictly refuses <all_urls> spyware permissions:',
      '',
      ...skipped.map((s) => `- ${s}`),
    ].join('\r\n');
    zipEntries.push({ name: '_cleansave_skipped.txt', data: new TextEncoder().encode(report) });
  }

  const zipBlob = buildZipBlob(zipEntries);
  const domain = extractDomainFromUrl(scanMeta.pageUrl || 'local');
  const today = new Date().toISOString().slice(0, 10);
  const zipFilename = `cleansave-${domain}-${today}.zip`;
  const zipUrl = URL.createObjectURL(zipBlob);

  await chrome.downloads.download({
    url: zipUrl,
    filename: zipFilename,
    conflictAction: 'uniquify',
  });
  setTimeout(() => URL.revokeObjectURL(zipUrl), 30000);

  const imgCount = skipped.length > 0 ? zipEntries.length - 1 : zipEntries.length;
  els.progressText.textContent = `ZIP ready: ${zipFilename} (${formatBytes(zipBlob.size)})`;
  setStatus(
    els.exportStatus,
    `Downloaded ${zipFilename} with ${imgCount} converted ${opts.format.toUpperCase()} file(s)` +
      (skipped.length > 0 ? ` (${skipped.length} CORS-blocked skipped)` : '') +
      truncatedNotice,
    'ok'
  );
  els.downloadZipBtn.disabled = false;
}

function addLocalFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f && f.type.startsWith('image/'));
  if (files.length === 0) return;

  for (const file of files) {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    const ext = (file.type.split('/')[1] || 'IMG').toUpperCase().replace('JPEG', 'JPG').replace('SVG+XML', 'SVG');
    const stem = (file.name || 'pasted-image').replace(/\.[^.]+$/, '');
    localImages.push({
      id,
      file,
      url: previewUrl,
      previewUrl,
      name: stem,
      alt: file.name,
      format: ext,
      width: 0,
      height: 0,
    });
    selectedIds.add(id);
  }

  minPx = 0;
  updateMinPxPills();
  renderGrid();
}

function switchMode(mode) {
  activeMode = mode;
  selectedIds.clear();
  els.tabPage.classList.toggle('active', mode === 'page');
  els.tabLocal.classList.toggle('active', mode === 'local');
  els.localDropSection.classList.toggle('hidden', mode !== 'local');
  if (mode === 'local') {
    minPx = 0;
    updateMinPxPills();
  }
  renderGrid();
}

function updateMinPxPills() {
  els.minPxGroup.querySelectorAll('.filter-pill').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.getAttribute('data-minpx')) === minPx);
  });
}

// Event Wiring
els.tabPage.addEventListener('click', () => switchMode('page'));
els.tabLocal.addEventListener('click', () => switchMode('local'));

els.minPxGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-pill');
  if (!btn) return;
  minPx = Number(btn.getAttribute('data-minpx')) || 0;
  updateMinPxPills();
  renderGrid();
});

els.formatFilter.addEventListener('change', renderGrid);
els.searchInput.addEventListener('input', renderGrid);

els.selectAllBtn.addEventListener('click', () => {
  for (const item of getFilteredItems()) selectedIds.add(item.id);
  renderGrid();
});

els.clearSelBtn.addEventListener('click', () => {
  selectedIds.clear();
  renderGrid();
});

els.outFormat.addEventListener('change', () => {
  const fmt = els.outFormat.value;
  els.qualityField.classList.toggle('hidden', fmt === 'png');
  els.bgFillField.classList.toggle('hidden', fmt !== 'jpg' && !els.batchResize.value.startsWith('square-'));
  if (!settings.proActivated) {
    els.batchQuality.value = fmt === 'webp' ? '90' : '92';
    els.batchQualityVal.textContent = `${els.batchQuality.value}%`;
  }
});

els.batchQuality.addEventListener('input', () => {
  els.batchQualityVal.textContent = `${els.batchQuality.value}%`;
});

els.batchBgPicker.addEventListener('input', () => {
  els.batchBgColor.value = sanitizeHexColor(els.batchBgPicker.value);
});

els.batchBgColor.addEventListener('change', () => {
  const hex = sanitizeHexColor(els.batchBgColor.value);
  els.batchBgColor.value = hex;
  els.batchBgPicker.value = hex;
});

els.batchResize.addEventListener('change', () => {
  els.batchMaxWidthWrap.classList.toggle('hidden', els.batchResize.value !== 'max-width');
  els.bgFillField.classList.toggle('hidden', els.outFormat.value !== 'jpg' && !els.batchResize.value.startsWith('square-'));
});

document.querySelectorAll('.chip[data-pattern]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!settings.proActivated) return;
    els.batchPattern.value = btn.getAttribute('data-pattern');
  });
});

els.downloadZipBtn.addEventListener('click', runBatchZipExport);

els.dropzone.addEventListener('click', () => els.localFileInput.click());
els.localFileInput.addEventListener('change', (e) => addLocalFiles(e.target.files));
els.dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.dropzone.classList.add('dragover');
});
els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('dragover'));
els.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  els.dropzone.classList.remove('dragover');
  addLocalFiles(e.dataTransfer?.files);
});

window.addEventListener('paste', (e) => {
  const items = Array.from(e.clipboardData?.items || []);
  const imageFiles = items
    .filter((it) => it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (imageFiles.length > 0) {
    if (activeMode !== 'local') switchMode('local');
    addLocalFiles(imageFiles);
  }
});

els.batchUnlockBtn.addEventListener('click', async () => {
  const res = verifyLicenseKey(els.batchKeyInput.value);
  if (!res.valid) {
    setStatus(els.batchKeyStatus, res.reason || 'Invalid key.', 'err');
    return;
  }
  settings.proLicenseKey = res.normalized;
  settings.proActivated = true;
  await chrome.storage.local.set({ proLicenseKey: res.normalized, proActivated: true });
  setStatus(els.batchKeyStatus, 'Pro unlocked!', 'ok');
  applyProUi();
});

async function init() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...stored };
  settings.proActivated = settings.proLicenseKey
    ? verifyLicenseKey(settings.proLicenseKey).valid
    : false;

  const params = new URLSearchParams(location.search);
  const startLocal = params.get('mode') === 'local';

  const sessionData = await chrome.storage.session.get('lastScan');
  if (sessionData?.lastScan) {
    const scan = sessionData.lastScan;
    scanMeta = { pageUrl: scan.pageUrl || '', pageTitle: scan.pageTitle || '', tabId: scan.tabId };
    els.sourceSubtitle.textContent = `Scanned: ${scan.pageTitle || scan.pageUrl} (${scan.images?.length || 0} images found)`;
    pageImages = (scan.images || []).map((img, idx) => ({
      ...img,
      id: `page-${idx}`,
      name: extractNameFromUrl(img.url) || `image-${idx + 1}`,
      previewUrl: img.inlineDataUrl || img.url,
    }));

    // Auto-select >= 500px images if any exist; otherwise default filter to All
    const bigImages = pageImages.filter((i) => Math.max(i.width || 0, i.height || 0) >= 500);
    if (bigImages.length > 0) {
      minPx = 500;
      bigImages.forEach((i) => selectedIds.add(i.id));
    } else {
      minPx = 0;
      pageImages.forEach((i) => selectedIds.add(i.id));
    }
    updateMinPxPills();
  }

  applyProUi();
  if (startLocal || pageImages.length === 0) {
    switchMode('local');
  } else {
    renderGrid();
  }
}

init();