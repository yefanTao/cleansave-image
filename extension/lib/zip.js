/**
 * CleanSave Image — Minimal, Zero-Dependency, Auditable PKZIP (STORE) Builder
 *
 * Why STORE (method 0)?
 * JPEG, PNG, and WebP images are already heavily compressed binary formats.
 * Re-compressing them with DEFLATE wastes CPU and saves ~0% space.
 * Pure PKZIP STORE with IEEE 802.3 CRC-32 produces standards-compliant .zip
 * archives compatible with Windows Explorer, macOS Archive Utility, unzip, and 7-Zip.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * Compute standard IEEE 802.3 CRC-32 checksum.
 * @param {Uint8Array} bytes
 * @returns {number} Unsigned 32-bit CRC
 */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Convert JS Date to MS-DOS packed time and date fields for ZIP headers.
 * @param {Date} [date]
 * @returns {{ dosTime: number, dosDate: number }}
 */
function toDosDateTime(date = new Date()) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Deduplicate filenames safely within a ZIP archive.
 * @param {string} rawName
 * @param {Set<string>} usedNames
 * @returns {string}
 */
function ensureUniqueEntryName(rawName, usedNames) {
  const clean = String(rawName || 'image.jpg')
    .replace(/^[\\/]+/, '')
    .replace(/\.\.+/g, '_')
    .replace(/[\\]+/g, '/');

  if (!usedNames.has(clean.toLowerCase())) {
    usedNames.add(clean.toLowerCase());
    return clean;
  }

  const dotIdx = clean.lastIndexOf('.');
  const base = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
  const ext = dotIdx > 0 ? clean.slice(dotIdx) : '';

  let counter = 2;
  let candidate = `${base}-${counter}${ext}`;
  while (usedNames.has(candidate.toLowerCase())) {
    counter++;
    candidate = `${base}-${counter}${ext}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Build a PKZIP archive as a Uint8Array from an array of entries.
 * @param {Array<{ name: string, data: Uint8Array | ArrayBuffer, date?: Date }>} entries
 * @returns {Uint8Array}
 */
export function buildZipUint8Array(entries) {
  const encoder = new TextEncoder();
  const usedNames = new Set();
  const prepared = [];

  let localTotalSize = 0;
  let centralTotalSize = 0;

  for (const entry of entries) {
    const safeName = ensureUniqueEntryName(entry.name, usedNames);
    const nameBytes = encoder.encode(safeName);
    const dataBytes = entry.data instanceof Uint8Array
      ? entry.data
      : new Uint8Array(entry.data);
    const checksum = crc32(dataBytes);
    const { dosTime, dosDate } = toDosDateTime(entry.date || new Date());

    prepared.push({
      nameBytes,
      dataBytes,
      checksum,
      dosTime,
      dosDate,
      localHeaderOffset: localTotalSize,
    });

    localTotalSize += 30 + nameBytes.length + dataBytes.length;
    centralTotalSize += 46 + nameBytes.length;
  }

  const totalSize = localTotalSize + centralTotalSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  let offset = 0;

  // 1. Local file headers + raw file payloads
  for (const item of prepared) {
    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true);     // Version needed to extract (2.0)
    view.setUint16(offset + 6, 0x0800, true); // General purpose flag: UTF-8 names
    view.setUint16(offset + 8, 0, true);      // Compression method: 0 (STORE)
    view.setUint16(offset + 10, item.dosTime, true);
    view.setUint16(offset + 12, item.dosDate, true);
    view.setUint32(offset + 14, item.checksum, true);
    view.setUint32(offset + 18, item.dataBytes.length, true); // Compressed size
    view.setUint32(offset + 22, item.dataBytes.length, true); // Uncompressed size
    view.setUint16(offset + 26, item.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true);     // Extra field length
    offset += 30;

    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;

    out.set(item.dataBytes, offset);
    offset += item.dataBytes.length;
  }

  // 2. Central directory file headers
  const centralDirOffset = offset;
  for (const item of prepared) {
    view.setUint32(offset, 0x02014b50, true); // Central directory signature
    view.setUint16(offset + 4, 20, true);     // Version made by
    view.setUint16(offset + 6, 20, true);     // Version needed to extract
    view.setUint16(offset + 8, 0x0800, true); // UTF-8 filename flag
    view.setUint16(offset + 10, 0, true);     // Compression method: STORE
    view.setUint16(offset + 12, item.dosTime, true);
    view.setUint16(offset + 14, item.dosDate, true);
    view.setUint32(offset + 16, item.checksum, true);
    view.setUint32(offset + 20, item.dataBytes.length, true);
    view.setUint32(offset + 24, item.dataBytes.length, true);
    view.setUint16(offset + 28, item.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true);     // Extra field length
    view.setUint16(offset + 32, 0, true);     // Comment length
    view.setUint16(offset + 34, 0, true);     // Disk number start
    view.setUint16(offset + 36, 0, true);     // Internal file attributes
    view.setUint32(offset + 38, 0, true);     // External file attributes
    view.setUint32(offset + 42, item.localHeaderOffset, true);
    offset += 46;

    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;
  }

  // 3. End of Central Directory record (EOCD)
  view.setUint32(offset, 0x06054b50, true);        // EOCD signature
  view.setUint16(offset + 4, 0, true);             // Disk number
  view.setUint16(offset + 6, 0, true);             // Central dir start disk
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralTotalSize, true);
  view.setUint32(offset + 16, centralDirOffset, true);
  view.setUint16(offset + 20, 0, true);            // ZIP comment length

  return out;
}

/**
 * Build a downloadable ZIP Blob from an array of entries.
 * @param {Array<{ name: string, data: Uint8Array | ArrayBuffer, date?: Date }>} entries
 * @returns {Blob}
 */
export function buildZipBlob(entries) {
  return new Blob([buildZipUint8Array(entries)], { type: 'application/zip' });
}