/**
 * CleanSave Image — Offscreen Document Canvas Converter
 * Performs 100% local Blob -> ImageBitmap -> Canvas -> JPG/PNG/WebP encoding.
 * Never transmits image data or URLs to any external server.
 */

import { convertImageBlob, blobToDataUrl, dataUrlToBlob } from './lib/core.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') return false;

  if (message.type === 'CONVERT_IMAGE') {
    handleConvert(message.payload)
      .then((result) => sendResponse(result))
      .catch((err) => {
        sendResponse({
          ok: false,
          code: err?.code || 'CONVERT_ERROR',
          error: err?.message || 'Conversion failed.',
        });
      });
    return true; // Keep message channel open for async response
  }

  return false;
});

/**
 * Resolve input bytes from either a pre-captured Data URL or a CORS fetch, then convert.
 * @param {{
 *   dataUrl?: string,
 *   srcUrl?: string,
 *   format: 'jpg' | 'png' | 'webp',
 *   quality?: number,
 *   transparentBg?: string,
 *   resizePreset?: string,
 *   customMaxWidth?: number
 * }} payload
 */
async function handleConvert(payload) {
  let inputBlob = null;

  if (payload.dataUrl && payload.dataUrl.startsWith('data:')) {
    inputBlob = dataUrlToBlob(payload.dataUrl);
  } else if (payload.srcUrl) {
    if (payload.srcUrl.startsWith('data:')) {
      inputBlob = dataUrlToBlob(payload.srcUrl);
    } else {
      try {
        const res = await fetch(payload.srcUrl, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
        });
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status} while fetching image.`);
          err.code = 'CORS_BLOCKED';
          throw err;
        }
        inputBlob = await res.blob();
      } catch (fetchErr) {
        const err = new Error(
          fetchErr?.message || 'Cross-origin CDN blocked direct fetch (CleanSave intentionally avoids <all_urls>).'
        );
        err.code = 'CORS_BLOCKED';
        throw err;
      }
    }
  } else {
    throw new Error('No image source provided.');
  }

  const converted = await convertImageBlob(inputBlob, {
    format: payload.format,
    quality: payload.quality,
    transparentBg: payload.transparentBg,
    resizePreset: payload.resizePreset,
    customMaxWidth: payload.customMaxWidth,
  });

  const outDataUrl = await blobToDataUrl(converted.blob);
  return {
    ok: true,
    dataUrl: outDataUrl,
    width: converted.width,
    height: converted.height,
    srcWidth: converted.srcWidth,
    srcHeight: converted.srcHeight,
    size: converted.blob.size,
    mime: converted.mime,
    ext: converted.ext,
  };
}