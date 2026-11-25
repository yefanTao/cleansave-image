/**
 * CleanSave Image — MV3 Service Worker
 *
 * ZERO BROAD SITE PERMISSIONS:
 * - No <all_urls>, no http://*/*, no https://*/*, no tabs, no webRequest, no cookies.
 * - Uses ONLY activeTab + scripting at the moment the user clicks a context menu or toolbar button.
 */

import {
  DEFAULT_SETTINGS,
  buildOutputFilename,
  formatBytes,
  verifyLicenseKey,
} from './lib/core.js';

const MENU_ROOT = 'cleansave-root';
const MENU_JPG = 'cleansave-jpg';
const MENU_PNG = 'cleansave-png';
const MENU_WEBP = 'cleansave-webp';

const OFFSCREEN_PATH = 'offscreen.html';
let creatingOffscreenPromise = null;

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  merged.proActivated = merged.proLicenseKey
    ? verifyLicenseKey(merged.proLicenseKey).valid
    : false;
  return merged;
}

async function setupContextMenus() {
  const settings = await getSettings();
  const jpgQ = settings.proActivated ? settings.jpgQuality : 92;
  const webpQ = settings.proActivated ? settings.webpQuality : 90;

  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));

  chrome.contextMenus.create({
    id: MENU_ROOT,
    title: 'CleanSave Image',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: MENU_JPG,
    parentId: MENU_ROOT,
    title: `Save as JPG (${jpgQ}%)`,
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: MENU_PNG,
    parentId: MENU_ROOT,
    title: 'Save as PNG (Lossless)',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: MENU_WEBP,
    parentId: MENU_ROOT,
    title: `Save as WebP (${webpQ}%)`,
    contexts: ['image'],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  setupContextMenus().catch(() => {});
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.jpgQuality || changes.webpQuality || changes.proLicenseKey || changes.proActivated) {
    setupContextMenus().catch(() => {});
  }
});

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  if (chrome.runtime.getContexts) {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });
    if (existing.length > 0) return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['BLOBS', 'DOM_SCRAPING'],
    justification: 'Decode and re-encode images locally using HTML5 Canvas without external servers.',
  });

  try {
    await creatingOffscreenPromise;
  } finally {
    creatingOffscreenPromise = null;
  }
}

async function captureImageInsidePage(targetSrcUrl) {
  async function blobToDataUrlLocal(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('FileReader failed'));
      r.readAsDataURL(blob);
    });
  }

  // Strategy 1: Page-context fetch (same-origin cookies, blob:, and ACAO:* CDNs)
  try {
    const res = await fetch(targetSrcUrl, {
      credentials: 'include',
      mode: 'cors',
      cache: 'no-store',
    });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && (blob.type.startsWith('image/') || blob.type === 'application/octet-stream' || !blob.type)) {
        const dataUrl = await blobToDataUrlLocal(blob);
        return { ok: true, dataUrl, strategy: 'page-fetch' };
      }
    }
  } catch {
    // Fallback to DOM canvas
  }

  // Strategy 2: Already-decoded DOM <img> onto temporary canvas
  try {
    const imgs = Array.from(document.querySelectorAll('img'));
    const match = imgs.find(
      (el) => el.complete && el.naturalWidth > 0 && (el.currentSrc === targetSrcUrl || el.src === targetSrcUrl)
    );
    if (match) {
      const canvas = document.createElement('canvas');
      canvas.width = match.naturalWidth;
      canvas.height = match.naturalHeight;
      canvas.getContext('2d').drawImage(match, 0, 0);
      return { ok: true, dataUrl: canvas.toDataURL('image/png'), strategy: 'dom-canvas' };
    }
  } catch {
    // Tainted canvas — continue
  }

  // Strategy 3: Fresh anonymous CORS Image decode
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => reject(new Error('Image load timeout')), 8000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (secErr) {
          reject(secErr);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Anonymous CORS image load failed'));
      };
      img.src = targetSrcUrl;
    });
    return { ok: true, dataUrl, strategy: 'anonymous-img' };
  } catch {
    return { ok: false, code: 'CORS_BLOCKED' };
  }
}

async function showPageToast(tabId, { kind, title, subtitle, srcUrl }) {
  if (!tabId || tabId < 0) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (payload) => {
        const EXISTING_ID = '__cleansave_toast_host__';
        const prev = document.getElementById(EXISTING_ID);
        if (prev) prev.remove();

        const host = document.createElement('div');
        host.id = EXISTING_ID;
        host.style.cssText =
          'position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

        const shadow = host.attachShadow({ mode: 'closed' });
        const accent = payload.kind === 'error' ? '#D97706' : '#10B981';

        const box = document.createElement('div');
        box.style.cssText = `background:#FFFFFF;color:#0F172A;border:1px solid #E2E8F0;border-left:4px solid ${accent};border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,0.16);padding:12px 14px;max-width:340px;font-size:13px;line-height:1.45;`;

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:700;margin-bottom:2px;display:flex;justify-content:space-between;align-items:center;gap:12px;';
        titleEl.textContent = payload.title;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'border:none;background:none;color:#64748B;font-size:16px;cursor:pointer;padding:0 2px;line-height:1;';
        closeBtn.onclick = () => host.remove();
        titleEl.appendChild(closeBtn);

        const subEl = document.createElement('div');
        subEl.style.cssText = 'color:#475569;font-size:12px;';
        subEl.textContent = payload.subtitle;

        box.appendChild(titleEl);
        box.appendChild(subEl);

        if (payload.kind === 'error' && payload.srcUrl) {
          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex;gap:8px;margin-top:10px;';

          const dlBtn = document.createElement('button');
          dlBtn.textContent = 'Download Original';
          dlBtn.style.cssText = 'background:#2563EB;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;';
          dlBtn.onclick = () => {
            chrome.runtime.sendMessage({ type: 'DOWNLOAD_ORIGINAL', srcUrl: payload.srcUrl });
            host.remove();
          };

          const localBtn = document.createElement('button');
          localBtn.textContent = 'Open Local Converter';
          localBtn.style.cssText = 'background:#F1F5F9;color:#0F172A;border:1px solid #CBD5E1;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;';
          localBtn.onclick = () => {
            chrome.runtime.sendMessage({ type: 'OPEN_BATCH_LOCAL' });
            host.remove();
          };

          actions.appendChild(dlBtn);
          actions.appendChild(localBtn);
          box.appendChild(actions);
        }

        shadow.appendChild(box);
        document.documentElement.appendChild(host);

        setTimeout(() => {
          if (host.isConnected) host.remove();
        }, payload.kind === 'error' ? 9000 : 3200);
      },
      args: [{ kind, title, subtitle, srcUrl }],
    });
  } catch {
    // Restricted page
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const formatMap = { [MENU_JPG]: 'jpg', [MENU_PNG]: 'png', [MENU_WEBP]: 'webp' };
  const targetFormat = formatMap[info.menuItemId];
  if (!targetFormat || !info.srcUrl) return;

  const settings = await getSettings();
  const isPro = settings.proActivated;

  const convertOptions = {
    format: targetFormat,
    quality: targetFormat === 'webp'
      ? (isPro ? settings.webpQuality : 90)
      : (isPro ? settings.jpgQuality : 92),
    transparentBg: isPro ? settings.transparentBg : '#FFFFFF',
    resizePreset: isPro ? settings.resizePreset : 'original',
    customMaxWidth: isPro ? settings.customMaxWidth : 1600,
  };

  let capturedDataUrl = info.srcUrl.startsWith('data:') ? info.srcUrl : null;

  if (!capturedDataUrl && tab && typeof tab.id === 'number' && tab.id >= 0) {
    try {
      const target = { tabId: tab.id };
      if (typeof info.frameId === 'number') target.frameIds = [info.frameId];
      const results = await chrome.scripting.executeScript({
        target,
        func: captureImageInsidePage,
        args: [info.srcUrl],
      });
      const first = results?.[0]?.result;
      if (first?.ok && first.dataUrl) capturedDataUrl = first.dataUrl;
    } catch {
      // Fallback to offscreen direct CORS fetch
    }
  }

  try {
    await ensureOffscreenDocument();
    const converted = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'CONVERT_IMAGE',
      payload: { dataUrl: capturedDataUrl, srcUrl: info.srcUrl, ...convertOptions },
    });

    if (!converted || !converted.ok) {
      await showPageToast(tab?.id, {
        kind: 'error',
        title: 'Strict CDN CORS Blocked Conversion',
        subtitle: 'This image host blocks cross-origin canvas access and CleanSave never requests <all_urls>. Download original or drop it into the local converter.',
        srcUrl: info.srcUrl,
      });
      return;
    }

    const pattern = isPro ? settings.filenamePattern : '{name}';
    const filename = buildOutputFilename(pattern, {
      srcUrl: info.srcUrl,
      pageUrl: info.pageUrl || tab?.url || '',
      format: targetFormat,
      width: converted.width,
      height: converted.height,
      index: 1,
    });

    await chrome.downloads.download({
      url: converted.dataUrl,
      filename,
      saveAs: Boolean(settings.saveAsDialog),
      conflictAction: 'uniquify',
    });

    await showPageToast(tab?.id, {
      kind: 'success',
      title: `Saved ${filename}`,
      subtitle: `${converted.width}×${converted.height} · ${formatBytes(converted.size)} · Converted 100% locally`,
    });
  } catch (err) {
    await showPageToast(tab?.id, {
      kind: 'error',
      title: 'CleanSave Could Not Convert Image',
      subtitle: err?.message || 'Try downloading the original file and dropping it into the local converter.',
      srcUrl: info.srcUrl,
    });
  }
});

function scanImagesInPage() {
  const seen = new Map();

  function parseBestSrcset(srcset) {
    if (!srcset) return null;
    const candidates = srcset
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((entry) => {
        const tokens = entry.split(/\s+/);
        const url = tokens[0];
        const desc = tokens[1] || '1x';
        let score = 1;
        if (desc.endsWith('w')) score = parseFloat(desc) || 1;
        else if (desc.endsWith('x')) score = (parseFloat(desc) || 1) * 1000;
        return { url, score };
      })
      .filter((c) => c.url);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url || null;
  }

  function detectFormat(url) {
    if (!url) return 'IMG';
    if (url.startsWith('data:image/')) {
      const m = /^data:image\/([a-z0-9+.-]+)/i.exec(url);
      return m ? m[1].toUpperCase().replace('JPEG', 'JPG') : 'DATA';
    }
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    if (clean.endsWith('.webp')) return 'WEBP';
    if (clean.endsWith('.avif')) return 'AVIF';
    if (clean.endsWith('.png')) return 'PNG';
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'JPG';
    if (clean.endsWith('.gif')) return 'GIF';
    if (clean.endsWith('.svg')) return 'SVG';
    const qm = /[?&](?:format|fm|f)=(webp|avif|png|jpg|jpeg)/i.exec(url);
    if (qm) return qm[1].toUpperCase().replace('JPEG', 'JPG');
    return 'IMG';
  }

  function addCandidate(rawUrl, meta) {
    if (!rawUrl || rawUrl.startsWith('javascript:')) return;
    let absUrl = rawUrl;
    try {
      absUrl = new URL(rawUrl, document.baseURI).href;
    } catch {
      return;
    }
    const existing = seen.get(absUrl);
    if (!existing) {
      seen.set(absUrl, {
        url: absUrl,
        width: meta.width || 0,
        height: meta.height || 0,
        alt: (meta.alt || '').trim().slice(0, 120),
        sourceType: meta.sourceType || 'img',
        format: detectFormat(absUrl),
        sameOrigin: absUrl.startsWith(location.origin) || absUrl.startsWith('data:') || absUrl.startsWith('blob:'),
        inlineDataUrl: meta.inlineDataUrl || null,
      });
    } else {
      existing.width = Math.max(existing.width, meta.width || 0);
      existing.height = Math.max(existing.height, meta.height || 0);
      if (!existing.alt && meta.alt) existing.alt = meta.alt.trim().slice(0, 120);
      if (!existing.inlineDataUrl && meta.inlineDataUrl) existing.inlineDataUrl = meta.inlineDataUrl;
    }
  }

  for (const img of document.querySelectorAll('img')) {
    const bestSrcset = parseBestSrcset(img.getAttribute('srcset'));
    const primaryUrl = bestSrcset || img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
    const w = img.naturalWidth || Math.round(img.getBoundingClientRect().width) || 0;
    const h = img.naturalHeight || Math.round(img.getBoundingClientRect().height) || 0;

    let inlineDataUrl = null;
    if (img.complete && img.naturalWidth > 0 && (primaryUrl?.startsWith('blob:') || primaryUrl?.startsWith(location.origin))) {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        inlineDataUrl = c.toDataURL('image/png');
      } catch {
        inlineDataUrl = null;
      }
    }

    addCandidate(primaryUrl, {
      width: w,
      height: h,
      alt: img.alt || img.title || '',
      sourceType: bestSrcset ? 'srcset' : 'img',
      inlineDataUrl,
    });
  }

  for (const source of document.querySelectorAll('picture source[srcset]')) {
    const best = parseBestSrcset(source.getAttribute('srcset'));
    if (best) {
      const parentImg = source.parentElement?.querySelector('img');
      addCandidate(best, {
        width: parentImg?.naturalWidth || 0,
        height: parentImg?.naturalHeight || 0,
        alt: parentImg?.alt || '',
        sourceType: 'picture',
      });
    }
  }

  const allEls = document.querySelectorAll('div, section, figure, a, span, header, article');
  const limit = Math.min(allEls.length, 600);
  for (let i = 0; i < limit; i++) {
    const el = allEls[i];
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none' || !bg.includes('url(')) continue;
    const m = /url\(["']?([^"')]+)["']?\)/.exec(bg);
    if (m && m[1] && !m[1].startsWith('data:image/svg')) {
      const rect = el.getBoundingClientRect();
      addCandidate(m[1], {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        alt: el.getAttribute('aria-label') || '',
        sourceType: 'css-bg',
      });
    }
  }

  return {
    pageUrl: location.href,
    pageTitle: document.title || location.hostname,
    scannedAt: Date.now(),
    images: Array.from(seen.values()),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target === 'offscreen') return false;

  if (message.type === 'DOWNLOAD_ORIGINAL' && message.srcUrl) {
    chrome.downloads.download({ url: message.srcUrl, conflictAction: 'uniquify' }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'OPEN_BATCH_LOCAL') {
    chrome.tabs.create({ url: chrome.runtime.getURL('batch.html?mode=local') });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'SCAN_ACTIVE_TAB') {
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab || typeof activeTab.id !== 'number') {
          sendResponse({ ok: false, error: 'No active tab found.' });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: scanImagesInPage,
        });
        const scanPayload = results?.[0]?.result;
        if (!scanPayload) {
          sendResponse({ ok: false, error: 'Cannot scan restricted browser pages (chrome:// or Chrome Web Store).' });
          return;
        }
        await chrome.storage.session.set({ lastScan: { ...scanPayload, tabId: activeTab.id } });
        await chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') });
        sendResponse({ ok: true, count: scanPayload.images.length });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err?.message || 'Unable to scan this page. Try a normal webpage or open the Local Converter.',
        });
      }
    })();
    return true;
  }

  if (message.type === 'CAPTURE_FROM_SCANNED_TAB') {
    (async () => {
      try {
        const { tabId, srcUrl } = message;
        if (typeof tabId !== 'number' || !srcUrl) {
          sendResponse({ ok: false, code: 'NO_TAB' });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: captureImageInsidePage,
          args: [srcUrl],
        });
        sendResponse(results?.[0]?.result || { ok: false, code: 'CORS_BLOCKED' });
      } catch {
        sendResponse({ ok: false, code: 'TAB_UNAVAILABLE' });
      }
    })();
    return true;
  }

  return false;
});