import { DEFAULT_SETTINGS, sanitizeHexColor, verifyLicenseKey } from './lib/core.js';

const els = {
  headerBadge: document.getElementById('headerBadge'),
  batchProTag: document.getElementById('batchProTag'),
  scanPageBtn: document.getElementById('scanPageBtn'),
  openLocalBtn: document.getElementById('openLocalBtn'),
  scanStatus: document.getElementById('scanStatus'),
  settingsTierLabel: document.getElementById('settingsTierLabel'),
  jpgQuality: document.getElementById('jpgQuality'),
  jpgQualityVal: document.getElementById('jpgQualityVal'),
  webpQuality: document.getElementById('webpQuality'),
  webpQualityVal: document.getElementById('webpQualityVal'),
  transparentBg: document.getElementById('transparentBg'),
  transparentBgPicker: document.getElementById('transparentBgPicker'),
  resizePreset: document.getElementById('resizePreset'),
  customMaxWidthWrap: document.getElementById('customMaxWidthWrap'),
  customMaxWidth: document.getElementById('customMaxWidth'),
  filenamePattern: document.getElementById('filenamePattern'),
  saveAsDialog: document.getElementById('saveAsDialog'),
  proCard: document.getElementById('proCard'),
  proLockedView: document.getElementById('proLockedView'),
  proUnlockedView: document.getElementById('proUnlockedView'),
  licenseKeyInput: document.getElementById('licenseKeyInput'),
  activateKeyBtn: document.getElementById('activateKeyBtn'),
  deactivateKeyBtn: document.getElementById('deactivateKeyBtn'),
  licenseStatus: document.getElementById('licenseStatus'),
  activeKeyMask: document.getElementById('activeKeyMask'),
};

let currentSettings = { ...DEFAULT_SETTINGS };

function maskKey(key) {
  const parts = String(key || '').split('-');
  if (parts.length !== 4) return key;
  return `${parts[0]}-${parts[1]}-••••-${parts[3]}`;
}

function setStatus(el, msg, kind = '') {
  el.textContent = msg || '';
  el.className = 'status-msg' + (kind ? ` ${kind}` : '');
}

function renderState() {
  const isPro = Boolean(currentSettings.proActivated);

  els.jpgQuality.value = String(isPro ? currentSettings.jpgQuality : 92);
  els.jpgQualityVal.textContent = `${els.jpgQuality.value}%`;
  els.webpQuality.value = String(isPro ? currentSettings.webpQuality : 90);
  els.webpQualityVal.textContent = `${els.webpQuality.value}%`;

  const bg = sanitizeHexColor(isPro ? currentSettings.transparentBg : '#FFFFFF');
  els.transparentBg.value = bg;
  els.transparentBgPicker.value = bg;

  els.resizePreset.value = isPro ? currentSettings.resizePreset : 'original';
  els.customMaxWidth.value = String(currentSettings.customMaxWidth || 1600);
  els.customMaxWidthWrap.classList.toggle('hidden', !isPro || els.resizePreset.value !== 'max-width');

  els.filenamePattern.value = isPro ? currentSettings.filenamePattern : '{name}';
  els.saveAsDialog.checked = Boolean(currentSettings.saveAsDialog);

  // Lock/unlock Pro inputs cleanly
  els.jpgQuality.disabled = !isPro;
  els.webpQuality.disabled = !isPro;
  els.transparentBg.disabled = !isPro;
  els.transparentBgPicker.disabled = !isPro;
  els.resizePreset.disabled = !isPro;
  els.customMaxWidth.disabled = !isPro;
  els.filenamePattern.disabled = !isPro;
  document.querySelectorAll('.chip[data-pattern]').forEach((btn) => {
    btn.disabled = !isPro;
  });

  document.querySelectorAll('[data-pro-pill]').forEach((pill) => {
    pill.textContent = isPro ? 'Pro ✓' : 'Pro';
    pill.classList.toggle('unlocked', isPro);
  });

  els.batchProTag.textContent = isPro ? 'Pro Unlocked' : 'Pro · 3 Free';
  els.batchProTag.classList.toggle('unlocked', isPro);
  els.settingsTierLabel.textContent = isPro ? 'Pro Active' : 'Free Defaults';

  els.proCard.classList.toggle('unlocked', isPro);
  els.proLockedView.classList.toggle('hidden', isPro);
  els.proUnlockedView.classList.toggle('hidden', !isPro);
  els.activeKeyMask.textContent = isPro ? `Key: ${maskKey(currentSettings.proLicenseKey)} · Offline verified` : '';
}

async function savePartial(patch) {
  currentSettings = { ...currentSettings, ...patch };
  await chrome.storage.local.set(patch);
}

async function init() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  currentSettings = { ...DEFAULT_SETTINGS, ...stored };
  currentSettings.proActivated = currentSettings.proLicenseKey
    ? verifyLicenseKey(currentSettings.proLicenseKey).valid
    : false;
  renderState();
}

els.scanPageBtn.addEventListener('click', async () => {
  els.scanPageBtn.disabled = true;
  setStatus(els.scanStatus, 'Scanning active tab images locally...');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'SCAN_ACTIVE_TAB' });
    if (res?.ok) {
      setStatus(els.scanStatus, `Found ${res.count} images — opening batch workspace...`, 'ok');
      window.close();
    } else {
      setStatus(els.scanStatus, res?.error || 'Could not scan this tab.', 'err');
    }
  } catch (err) {
    setStatus(els.scanStatus, err?.message || 'Scan failed.', 'err');
  } finally {
    els.scanPageBtn.disabled = false;
  }
});

els.openLocalBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('batch.html?mode=local') });
  window.close();
});

els.jpgQuality.addEventListener('input', () => {
  els.jpgQualityVal.textContent = `${els.jpgQuality.value}%`;
});
els.jpgQuality.addEventListener('change', () => {
  savePartial({ jpgQuality: Number(els.jpgQuality.value) });
});

els.webpQuality.addEventListener('input', () => {
  els.webpQualityVal.textContent = `${els.webpQuality.value}%`;
});
els.webpQuality.addEventListener('change', () => {
  savePartial({ webpQuality: Number(els.webpQuality.value) });
});

els.transparentBgPicker.addEventListener('input', () => {
  const hex = sanitizeHexColor(els.transparentBgPicker.value);
  els.transparentBg.value = hex;
  savePartial({ transparentBg: hex });
});

els.transparentBg.addEventListener('change', () => {
  const hex = sanitizeHexColor(els.transparentBg.value);
  els.transparentBg.value = hex;
  els.transparentBgPicker.value = hex;
  savePartial({ transparentBg: hex });
});

els.resizePreset.addEventListener('change', () => {
  const preset = els.resizePreset.value;
  els.customMaxWidthWrap.classList.toggle('hidden', preset !== 'max-width');
  savePartial({ resizePreset: preset });
});

els.customMaxWidth.addEventListener('change', () => {
  const val = Math.max(100, Math.min(8000, Math.round(Number(els.customMaxWidth.value) || 1600)));
  els.customMaxWidth.value = String(val);
  savePartial({ customMaxWidth: val });
});

els.filenamePattern.addEventListener('change', () => {
  const val = els.filenamePattern.value.trim() || '{name}';
  els.filenamePattern.value = val;
  savePartial({ filenamePattern: val });
});

document.querySelectorAll('.chip[data-pattern]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!currentSettings.proActivated) return;
    const pat = btn.getAttribute('data-pattern');
    els.filenamePattern.value = pat;
    savePartial({ filenamePattern: pat });
  });
});

els.saveAsDialog.addEventListener('change', () => {
  savePartial({ saveAsDialog: els.saveAsDialog.checked });
});

els.activateKeyBtn.addEventListener('click', async () => {
  const result = verifyLicenseKey(els.licenseKeyInput.value);
  if (!result.valid) {
    setStatus(els.licenseStatus, result.reason || 'Invalid license key.', 'err');
    return;
  }
  await savePartial({ proLicenseKey: result.normalized, proActivated: true });
  setStatus(els.licenseStatus, 'Pro unlocked offline!', 'ok');
  renderState();
});

els.licenseKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.activateKeyBtn.click();
});

els.deactivateKeyBtn.addEventListener('click', async () => {
  await savePartial({ proLicenseKey: '', proActivated: false });
  els.licenseKeyInput.value = '';
  setStatus(els.licenseStatus, 'Pro key removed.');
  renderState();
});

init();