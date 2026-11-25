# CleanSave Image — Zero-Permission Auditable Chrome MV3 Extension

> **Safe, open-source, zero-tracking replacement for `"Save Image as Type"`** (purged by Google in March 2026 for affiliate cookie hijacking across 578 retail sites).

Convert **WebP, AVIF, PNG, JPG, GIF, and SVG** images locally to **JPG (with crisp `#FFFFFF` white background for transparency)**, **lossless PNG**, or **WebP** — with **ZERO broad site permissions** (`<all_urls>` is NEVER requested).

---

## Live Landing Page & Chrome Web Store URLs

- **Homepage / Audit Page**: https://yefantao.github.io/cleansave-image
- **Privacy Policy URL (for CWS Dashboard)**: https://yefantao.github.io/cleansave-image/#privacy
- **Pro Upgrade Section**: https://yefantao.github.io/cleansave-image/#pro
- **Store Visual Assets**: store-assets/ (1280×800 × 4 screenshots, 440×280 small promo tile, 1400×560 marquee promo tile)
- **Batch Pro Key Generator**: powershell -ExecutionPolicy Bypass -File .\scripts\generate-keys.ps1 -Count 500 (outputs to gitignored private/)

---
## Permission Audit (`extension/manifest.json`)

CleanSave Image requests **ONLY** these 6 minimal Manifest V3 permissions:

```json
"permissions": [
  "contextMenus",
  "downloads",
  "offscreen",
  "storage",
  "activeTab",
  "scripting"
]
```

**Explicitly FORBIDDEN and ABSENT:**
- No `host_permissions` (`<all_urls>`, `http://*/*`, `https://*/*`)
- No `optional_host_permissions`
- No `tabs`, `cookies`, `webRequest`, or `declarativeNetRequest`
- No background content scripts
- No third-party CDN scripts, analytics, or telemetry calls

Because `host_permissions` is completely absent, Chrome does **NOT** show the scary *"Read and change all your data on all websites"* warning when users install CleanSave Image.

---

## Features

### Free Forever (No Account, Unlimited Single Saves)
- **Right-click any image → `CleanSave Image`**:
  - `Save as JPG (92%)` — automatically composites transparent PNG/WebP pixels onto pure white (`#FFFFFF`) instead of black.
  - `Save as PNG (Lossless)` — preserves full alpha transparency.
  - `Save as WebP (90%)`
- **Active-Tab Batch Scanner Preview**: Click the toolbar icon → **Scan Page Images** to inspect all `<img>`, `<picture>`, highest-res `srcset`, and CSS background images on the active tab, filter by minimum resolution (`≥ 500px`, etc.), single-save any image, or test batch ZIP with up to 3 images free.
- **Local Drag-and-Drop & Clipboard (`Ctrl+V`) Converter**: Convert local `.webp` / `.avif` / `.png` / `.svg` files completely offline.

### CleanSave Pro (`$9` One-Time Lifetime Key — Zero Subscription)
- **Unlimited Batch Page Image Ripper & Single-Click `.zip` Download** (uses our tiny, zero-dependency, auditable pure-JS PKZIP builder in `extension/lib/zip.js`).
- **E-Commerce Smart Resize Presets**:
  - `Square 2000×2000 White BG` (Amazon / Etsy)
  - `Square 1200×1200 White BG` (Shopify)
  - `Square 1080×1080 White BG` (Social)
  - `Custom Max Width`
- **Custom Quality Sliders** (JPG & WebP 50%–100%) and **Custom Transparent Background Color**.
- **Auto Filename Templates**: `{domain}-{date}-{index}`, `{name}-{width}x{height}`, `{time}`, `{format}`.
- **100% Offline License Verification**: Keys (`CSPRO-XXXX-XXXX-XXXX`) verify mathematically in `extension/lib/core.js` with zero phone-home server calls.

---

## Project Structure

```text
chrome_image_saver/
├── extension/
│   ├── manifest.json         # Strict minimal MV3 manifest (zero host_permissions)
│   ├── background.js         # Service worker: context menus, activeTab capture, offscreen trigger
│   ├── offscreen.html/.js    # Offscreen HTML5 Canvas decoder/encoder
│   ├── popup.html/.js        # Settings, Pro license activation, batch scan trigger
│   ├── batch.html/.js        # Batch page image ripper, resolution filter, ZIP export & local dropzone
│   ├── style.css             # White + Cobalt Blue UI stylesheet
│   ├── lib/
│   │   ├── core.js           # Canvas conversion, white-BG fill, resize presets, filenames, Pro key verification
│   │   └── zip.js            # Zero-dependency auditable PKZIP (STORE + CRC-32) archive builder
│   └── icons/                # Vector-rendered 16/32/48/128px PNG icons
├── landing/
│   └── index.html            # Zero-dependency static landing page + Privacy Policy + Permission Audit
├── tests/
│   ├── test-runner.html      # Real-Chrome HTML5 Canvas (WebP/AVIF/PNG/JPG), resize & ZIP test suite
│   └── verify.ps1            # Automated manifest audit, browser test runner, ZIP integrity check & packaging
└── dist/
    └── cleansave-image-v1.0.0.zip  # Ready to upload directly to Chrome Web Store Developer Dashboard
```

---

## Local Installation, Testing & Packaging

### 1. Load Unpacked in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder.

### 2. Run Automated Local Verification & Build ZIP
```powershell
powershell -ExecutionPolicy Bypass -File .\tests\verify.ps1
```
This script verifies:
- `manifest.json` validity and strict zero-broad-permission compliance
- Zero external tracking/analytics URLs in `extension/`
- Real Chrome headless execution of `tests/test-runner.html` (testing transparent PNG → white-BG JPG pixel RGB `(255,255,255)`, WebP → PNG lossless alpha preservation, AVIF → JPG decoding, Square `2000×2000` White BG e-commerce resize geometry, filename sanitization, offline Pro key checksum verification, and ZIP archive creation)
- `.NET ZipArchive` extraction verification of `dist/cleansave-image-v1.0.0.zip`.

### 3. Pro Key Generation (For Self-Hosted Stripe / LemonSqueezy Fulfillment)
Keys use `CSPRO-XXXX-XXXX-CCCC` verified offline via `verifyLicenseKey()` in `extension/lib/core.js`.
To generate a key for a buyer (or test Pro locally), call `generateLicenseKey('ABCD2345')` from `extension/lib/core.js`.

---

## Chrome Web Store Listing Copy (Ready to Paste)

- **Title**: `CleanSave — Save Image as Type (JPG, PNG, WebP) · Open Source`
- **Short Summary (≤ 132 chars)**: `Zero site permissions · Zero tracking · Open-source auditable replacement for Save Image as Type. Convert WebP/AVIF to JPG/PNG.`
- **Category**: Productivity
- **Detailed Description**:
  > Looking for a safe replacement after "Save Image as Type" was removed for malware?
  >
  > **CleanSave Image** is a 100% open-source, auditable Chrome Manifest V3 extension engineered with **ZERO broad site permissions**. We NEVER request `<all_urls>`, `cookies`, `tabs`, or `webRequest`, so Chrome never warns you about reading your data on all websites.
  >
  > **FREE FOREVER (Unlimited Single Saves):**
  > • Right-click any WebP, AVIF, PNG, or JPG image → Save as JPG (92%), PNG (Lossless), or WebP (90%).
  > • Transparent PNG/WebP to JPG automatically fills a crisp white (#FFFFFF) background — never ugly black!
  > • 100% local HTML5 Canvas conversion inside your browser. Zero cloud uploads, zero analytics, zero accounts.
  > • Includes offline Local Drag-and-Drop / Ctrl+V Clipboard converter.
  >
  > **OPTIONAL PRO UPGRADE ($9 One-Time Lifetime — No Subscription):**
  > • Batch Page Image Ripper: scan images on the active tab on click, filter by minimum resolution (≥ 500px), convert WebP/AVIF to JPG/PNG, and download a single `.zip`.
  > • E-Commerce Resize Presets: Square 2000×2000 White BG (Amazon/Etsy), 1200×1200 (Shopify), 1080×1080, or Custom Max Width.
  > • Custom JPG/WebP quality sliders (50–100%), custom background fill color, and auto filename patterns (`{domain}-{date}-{index}`).
  >
  > **TRANSPARENT TECHNICAL NOTES:**
  > • White background fill composites transparent PNG/WebP pixels onto pure #FFFFFF white (not AI photo background removal).
  > • Because CleanSave strictly refuses <all_urls>, some third-party CDNs without CORS headers cannot be canvas-read directly from the page; CleanSave offers 1-click Download Original + an offline Local Drop / Ctrl+V converter tab.
  >
  > **PERMISSION JUSTIFICATIONS (For CWS Review):**
  > - `contextMenus`: Adds the "CleanSave Image" right-click submenu on images.
  > - `downloads`: Saves the locally converted image or ZIP file to the user's Downloads folder.
  > - `offscreen`: Runs HTML5 Canvas decoding/encoding locally in an offscreen document (MV3 requirement).
  > - `storage`: Persists user quality/preset preferences locally (`chrome.storage.local`) and temporary page scan results in memory (`chrome.storage.session`).
  > - `activeTab` & `scripting`: Invoked strictly on explicit user click (right-click menu or toolbar scan button) to read same-origin/CORS images on the current tab without ever requesting `<all_urls>`.