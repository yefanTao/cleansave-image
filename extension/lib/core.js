/**
 * CleanSave Image — Core Pure-Local Conversion, Licensing & Filename Engine
 * Zero external network calls. Zero telemetry. 100% auditable vanilla JS.
 */

export const DEFAULT_SETTINGS = Object.freeze({
  jpgQuality: 92,
  webpQuality: 90,
  transparentBg: '#FFFFFF',
  resizePreset: 'original', // 'original' | 'square-2000' | 'square-1200' | 'square-1080' | 'max-width'
  customMaxWidth: 1600,
  filenamePattern: '{name}',
  saveAsDialog: false,
  proLicenseKey: '',
  proActivated: false,
});

export const FREE_BATCH_ZIP_LIMIT = 3;

export const RESIZE_PRESETS = Object.freeze({
  original: { id: 'original', label: 'Original Size', pro: false, square: null },
  'square-2000': { id: 'square-2000', label: 'Square 2000×2000 White BG (Amazon / Etsy)', pro: true, square: 2000 },
  'square-1200': { id: 'square-1200', label: 'Square 1200×1200 White BG (Shopify)', pro: true, square: 1200 },
  'square-1080': { id: 'square-1080', label: 'Square 1080×1080 White BG (Social)', pro: true, square: 1080 },
  'max-width': { id: 'max-width', label: 'Custom Max Width', pro: true, square: null },
});

export const FORMAT_META = Object.freeze({
  jpg: { id: 'jpg', mime: 'image/jpeg', ext: 'jpg', label: 'JPG', supportsQuality: true, supportsAlpha: false },
  png: { id: 'png', mime: 'image/png', ext: 'png', label: 'PNG', supportsQuality: false, supportsAlpha: true },
  webp: { id: 'webp', mime: 'image/webp', ext: 'webp', label: 'WebP', supportsQuality: true, supportsAlpha: true },
});

// Crockford-like unambiguous 32-char alphabet (excludes 0, O, 1, I)
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEY_SALT = 'CLEANSAVE-IMAGE-PRO-V1::OFFLINE-VERIFY';

/**
 * Dual-round deterministic 32-bit hash for offline license checksum verification.
 * @param {string} input
 * @returns {number}
 */
function fnvMix(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (ch + ((i + 1) * 31));
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x85ebca6b) >>> 0;
  }
  return ((h1 ^ (h2 >>> 5) ^ (h2 << 7)) >>> 0);
}

/**
 * Compute 4-character check code for an 8-character payload.
 * @param {string} payload8
 * @returns {string}
 */
export function computeLicenseCheckCode(payload8) {
  const norm = String(payload8 || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hashA = fnvMix(`${KEY_SALT}:${norm}`);
  const hashB = fnvMix(`${norm}::${KEY_SALT}`);
  const c0 = KEY_ALPHABET[hashA & 31];
  const c1 = KEY_ALPHABET[(hashA >>> 5) & 31];
  const c2 = KEY_ALPHABET[(hashB >>> 2) & 31];
  const c3 = KEY_ALPHABET[(hashB >>> 7) & 31];
  return `${c0}${c1}${c2}${c3}`;
}

/**
 * Generate a valid offline-verifiable Pro license key from an 8-char payload.
 * Format: CSPRO-XXXX-XXXX-CCCC
 * @param {string} payload8
 * @returns {string}
 */
export function generateLicenseKey(payload8) {
  const clean = String(payload8 || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 8) {
    throw new Error('Payload must be exactly 8 alphanumeric characters.');
  }
  for (const ch of clean) {
    if (!KEY_ALPHABET.includes(ch)) {
      throw new Error(`Invalid character "${ch}" for license alphabet.`);
    }
  }
  const check = computeLicenseCheckCode(clean);
  return `CSPRO-${clean.slice(0, 4)}-${clean.slice(4, 8)}-${check}`;
}

/**
 * Verify a CleanSave Pro license key completely offline (zero server call).
 * @param {string} rawKey
 * @returns {{ valid: boolean, normalized: string, reason?: string }}
 */
export function verifyLicenseKey(rawKey) {
  const normalized = String(rawKey || '').trim().toUpperCase();
  if (!normalized) {
    return { valid: false, normalized: '', reason: 'Enter a license key.' };
  }
  const match = /^CSPRO-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/.exec(normalized);
  if (!match) {
    return { valid: false, normalized, reason: 'Expected format: CSPRO-XXXX-XXXX-XXXX' };
  }
  const payload = match[1] + match[2];
  const providedCheck = match[3];
  for (const ch of payload + providedCheck) {
    if (!KEY_ALPHABET.includes(ch)) {
      return { valid: false, normalized, reason: 'Key contains invalid characters (avoid 0, O, 1, I).' };
    }
  }
  const expected = computeLicenseCheckCode(payload);
  if (providedCheck !== expected) {
    return { valid: false, normalized, reason: 'Invalid license key checksum.' };
  }
  return { valid: true, normalized };
}

/**
 * Sanitize a hex color string, defaulting to pure white (#FFFFFF).
 * @param {string} hex
 * @returns {string}
 */
export function sanitizeHexColor(hex) {
  const s = String(hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toUpperCase();
  }
  return '#FFFFFF';
}

/**
 * Compute output canvas dimensions and draw placement for a resize preset.
 * @param {number} srcW
 * @param {number} srcH
 * @param {string} preset
 * @param {number} [customMaxWidth]
 * @returns {{ canvasW: number, canvasH: number, drawX: number, drawY: number, drawW: number, drawH: number, forceOpaqueBg: boolean }}
 */
export function computeOutputGeometry(srcW, srcH, preset = 'original', customMaxWidth = 1600) {
  const safeW = Math.max(1, Math.round(Number(srcW) || 1));
  const safeH = Math.max(1, Math.round(Number(srcH) || 1));

  const presetInfo = RESIZE_PRESETS[preset];
  if (presetInfo && presetInfo.square) {
    const side = presetInfo.square;
    const scale = Math.min(side / safeW, side / safeH);
    const drawW = Math.max(1, Math.round(safeW * scale));
    const drawH = Math.max(1, Math.round(safeH * scale));
    const drawX = Math.floor((side - drawW) / 2);
    const drawY = Math.floor((side - drawH) / 2);
    return {
      canvasW: side,
      canvasH: side,
      drawX,
      drawY,
      drawW,
      drawH,
      forceOpaqueBg: true,
    };
  }

  if (preset === 'max-width') {
    const maxW = Math.max(64, Math.min(8000, Math.round(Number(customMaxWidth) || 1600)));
    if (safeW > maxW) {
      const ratio = maxW / safeW;
      const outW = maxW;
      const outH = Math.max(1, Math.round(safeH * ratio));
      return {
        canvasW: outW,
        canvasH: outH,
        drawX: 0,
        drawY: 0,
        drawW: outW,
        drawH: outH,
        forceOpaqueBg: false,
      };
    }
  }

  return {
    canvasW: safeW,
    canvasH: safeH,
    drawX: 0,
    drawY: 0,
    drawW: safeW,
    drawH: safeH,
    forceOpaqueBg: false,
  };
}

/**
 * Extract a clean filename stem from an image URL or path.
 * @param {string} url
 * @returns {string}
 */
export function extractNameFromUrl(url) {
  try {
    if (!url || url.startsWith('data:')) return 'image';
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    let last = segments.length > 0 ? decodeURIComponent(segments[segments.length - 1]) : 'image';
    last = last.replace(/\.(jpe?g|png|webp|avif|gif|bmp|svg|ico|tiff?)$/i, '');
    last = sanitizeFilenameSegment(last);
    return last || 'image';
  } catch {
    return 'image';
  }
}

/**
 * Extract a clean domain token from a URL.
 * @param {string} url
 * @returns {string}
 */
export function extractDomainFromUrl(url) {
  try {
    if (!url || url.startsWith('data:') || url.startsWith('file:')) return 'local';
    const host = new URL(url).hostname.replace(/^www\./i, '');
    return sanitizeFilenameSegment(host) || 'web';
  } catch {
    return 'local';
  }
}

/**
 * Sanitize an individual filename segment so it is safe on Windows, macOS, and Linux.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeFilenameSegment(raw) {
  return String(raw || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
    .slice(0, 80);
}

/**
 * Build a safe output filename from a template and context.
 * Supported tokens: {name}, {domain}, {date}, {time}, {index}, {width}, {height}, {format}
 * @param {string} template
 * @param {{ srcUrl?: string, pageUrl?: string, name?: string, format: string, index?: number, width?: number, height?: number, date?: Date }} ctx
 * @returns {string}
 */
export function buildOutputFilename(template, ctx) {
  const fmt = FORMAT_META[ctx.format] ? ctx.format : 'jpg';
  const ext = FORMAT_META[fmt].ext;
  const now = ctx.date instanceof Date ? ctx.date : new Date();

  const pad2 = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const timeStr = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const indexStr = String(ctx.index ?? 1).padStart(3, '0');

  const baseName = ctx.name ? sanitizeFilenameSegment(ctx.name) : extractNameFromUrl(ctx.srcUrl || '');
  const domain = extractDomainFromUrl(ctx.pageUrl || ctx.srcUrl || '');

  const rawPattern = (template && String(template).trim()) ? String(template).trim() : '{name}';
  let rendered = rawPattern
    .replace(/\{name\}/gi, baseName || 'image')
    .replace(/\{domain\}/gi, domain)
    .replace(/\{date\}/gi, dateStr)
    .replace(/\{time\}/gi, timeStr)
    .replace(/\{index\}/gi, indexStr)
    .replace(/\{width\}/gi, String(ctx.width || ''))
    .replace(/\{height\}/gi, String(ctx.height || ''))
    .replace(/\{format\}/gi, ext);

  // Strip any existing matching extension before sanitizing
  rendered = rendered.replace(/\.(jpe?g|png|webp)$/i, '');
  rendered = sanitizeFilenameSegment(rendered) || 'image';

  return `${rendered}.${ext}`;
}

/**
 * Decode a Blob into an image source suitable for Canvas drawImage().
 * Uses createImageBitmap first (fast, supports WebP/AVIF/PNG/JPG), falls back to HTMLImageElement (handles SVG).
 * @param {Blob} blob
 * @returns {Promise<{ source: ImageBitmap | HTMLImageElement, width: number, height: number, close: () => void }>}
 */
export async function decodeImageBlob(blob) {
  const isSvg = blob.type === 'image/svg+xml';
  if (!isSvg && typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement decoding
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width || 1024;
      const h = img.naturalHeight || img.height || 1024;
      resolve({
        source: img,
        width: w,
        height: h,
        close: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image bytes locally.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Convert an image Blob locally via HTML5 Canvas to JPG, PNG, or WebP.
 * Guarantees crisp white (#FFFFFF) background fill when converting transparent images to JPG
 * or using Square White BG e-commerce resize presets.
 *
 * @param {Blob} inputBlob
 * @param {{
 *   format: 'jpg' | 'png' | 'webp',
 *   quality?: number,
 *   transparentBg?: string,
 *   resizePreset?: string,
 *   customMaxWidth?: number
 * }} options
 * @returns {Promise<{ blob: Blob, width: number, height: number, srcWidth: number, srcHeight: number, mime: string, ext: string }>}
 */
export async function convertImageBlob(inputBlob, options) {
  const fmtKey = FORMAT_META[options?.format] ? options.format : 'jpg';
  const fmt = FORMAT_META[fmtKey];
  const qualityPct = Math.max(10, Math.min(100, Math.round(Number(options?.quality ?? (fmtKey === 'webp' ? 90 : 92)))));
  const bgColor = sanitizeHexColor(options?.transparentBg || '#FFFFFF');
  const resizePreset = options?.resizePreset || 'original';
  const customMaxWidth = options?.customMaxWidth || 1600;

  const decoded = await decodeImageBlob(inputBlob);
  try {
    const geom = computeOutputGeometry(decoded.width, decoded.height, resizePreset, customMaxWidth);

    let canvas;
    let ctx;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      canvas = document.createElement('canvas');
      canvas.width = geom.canvasW;
      canvas.height = geom.canvasH;
      ctx = canvas.getContext('2d', { alpha: fmt.supportsAlpha && !geom.forceOpaqueBg });
    } else if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(geom.canvasW, geom.canvasH);
      ctx = canvas.getContext('2d');
    } else {
      throw new Error('No Canvas API available in this context.');
    }

    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context.');
    }

    // Critical: Fill solid background (default #FFFFFF) when outputting JPG or Square White BG presets
    // so transparent PNG/WebP never turns ugly black!
    if (!fmt.supportsAlpha || geom.forceOpaqueBg) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, geom.canvasW, geom.canvasH);
    } else {
      ctx.clearRect(0, 0, geom.canvasW, geom.canvasH);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, geom.drawX, geom.drawY, geom.drawW, geom.drawH);

    let outBlob;
    if (typeof canvas.convertToBlob === 'function') {
      outBlob = await canvas.convertToBlob({
        type: fmt.mime,
        quality: fmt.supportsQuality ? qualityPct / 100 : undefined,
      });
    } else {
      outBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(`Canvas failed to encode ${fmt.mime}`))),
          fmt.mime,
          fmt.supportsQuality ? qualityPct / 100 : undefined
        );
      });
    }

    return {
      blob: outBlob,
      width: geom.canvasW,
      height: geom.canvasH,
      srcWidth: decoded.width,
      srcHeight: decoded.height,
      mime: fmt.mime,
      ext: fmt.ext,
    };
  } finally {
    decoded.close();
  }
}

/**
 * Convert a Blob to a Base64 Data URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read blob as Data URL.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a Data URL to a Blob without network requests.
 * @param {string} dataUrl
 * @returns {Blob}
 */
export function dataUrlToBlob(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) throw new Error('Invalid Data URL.');
  const header = dataUrl.slice(0, commaIdx);
  const body = dataUrl.slice(commaIdx + 1);
  const mimeMatch = /^data:([^;,]+)/i.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

  if (/;base64/i.test(header)) {
    const binStr = atob(body);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

/**
 * Format byte size for human display.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}