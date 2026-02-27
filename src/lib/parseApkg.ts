import JSZip from "jszip";
import initSqlJs, { Database } from "sql.js";
import * as fzstd from "fzstd";

export interface ImageInfo {
  dataUrl: string;
  w: number; // natural width px
  h: number; // natural height px
  mime: string; // detected MIME type
  originalSrc: string; // original src attribute from HTML
}

export interface AnkiCard {
  front: string;     // stripped text (for preview)
  back: string;      // stripped text (for preview)
  frontHtml: string; // raw HTML (for PDF rendering)
  backHtml: string;  // raw HTML (for PDF rendering)
}

export interface ParseResult {
  cards: AnkiCard[];
  images: Record<string, ImageInfo>; // filename → image info
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<div[^>]*>/gi, "\n")
    .replace(/<\/div>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractImageSources(html: string): string[] {
  const sources: string[] = [];
  const imgTagRegex = /<img[^>]*>/gi;
  const matches = html.match(imgTagRegex);
  
  if (!matches) return sources;
  
  for (const imgTag of matches) {
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i) || imgTag.match(/src=([^\s>]+)/i);
    if (srcMatch && srcMatch[1]) {
      sources.push(srcMatch[1]);
    }
  }
  
  return sources;
}

function normalizeFilename(filename: string): string[] {
  const variants: string[] = [];
  
  let normalized = filename.trim();
  
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep original if decoding fails
  }
  
  normalized = normalized.replace(/^\.\//, "");
  normalized = normalized.replace(/\?.*$/, "");
  normalized = normalized.replace(/#.*$/, "");
  normalized = normalized.replace(/\\/g, "/");
  
  variants.push(normalized);
  
  if (normalized !== filename) {
    variants.push(filename);
  }
  
  const basename = normalized.split("/").pop();
  if (basename && basename !== normalized) {
    variants.push(basename);
  }
  
  return [...new Set(variants)];
}

function detectMimeType(filename: string, buffer?: Uint8Array): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  
  if (buffer && buffer.length >= 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return "image/png";
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return "image/gif";
    }
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return "image/webp";
    }
  }
  
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
  };
  
  return mimeMap[ext] || "image/jpeg";
}

// Minimal protobuf varint reader
function readVarint(buf: Uint8Array, idx: { pos: number }): number {
  let result = 0;
  let shift = 0;
  while (idx.pos < buf.length) {
    const b = buf[idx.pos++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return result;
}

// Parse the newer protobuf media file → zipEntryNum → filename
function parseMediaProto(buffer: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {};
  const idx = { pos: 0 };
  let entryNum = 0;

  while (idx.pos < buffer.length) {
    const tag = buffer[idx.pos++];
    const fieldNum = tag >> 3;
    const wireType = tag & 0x7;

    if (fieldNum === 1 && wireType === 2) {
      const entryLen = readVarint(buffer, idx);
      const entryEnd = idx.pos + entryLen;
      let filename = "";

      while (idx.pos < entryEnd) {
        const innerTag = buffer[idx.pos++];
        const innerField = innerTag >> 3;
        const innerWire = innerTag & 0x7;

        if (innerField === 1 && innerWire === 2) {
          const nameLen = readVarint(buffer, idx);
          filename = new TextDecoder().decode(buffer.slice(idx.pos, idx.pos + nameLen));
          idx.pos += nameLen;
        } else if (innerWire === 0) {
          readVarint(buffer, idx);
        } else if (innerWire === 2) {
          const skipLen = readVarint(buffer, idx);
          idx.pos += skipLen;
        } else {
          break;
        }
      }

      idx.pos = entryEnd;
      if (filename) result[String(entryNum)] = filename;
      entryNum++;
    } else {
      break;
    }
  }

  return result;
}

function getMediaMapping(buffer: Uint8Array): Record<string, string> {
  // Old format: plain JSON {"0": "filename.jpg", ...}
  if (buffer[0] === 0x7b) {
    return JSON.parse(new TextDecoder().decode(buffer));
  }
  // New format: zstd-compressed protobuf
  if (buffer[0] === 0x28 && buffer[1] === 0xb5 && buffer[2] === 0x2f && buffer[3] === 0xfd) {
    const decompressed = fzstd.decompress(buffer);
    if (decompressed[0] === 0x7b) {
      return JSON.parse(new TextDecoder().decode(decompressed));
    }
    return parseMediaProto(decompressed);
  }
  return {};
}

async function uint8ToDataUrl(buffer: Uint8Array, mime: string): Promise<string> {
  const chunkSize = 0x8000;
  const binaryChunks: string[] = [];

  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    binaryChunks.push(String.fromCharCode(...chunk));

    if (i > 0 && i % (chunkSize * 32) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const b64 = btoa(binaryChunks.join(""));
  return `data:${mime};base64,${b64}`;
}

async function getDbBuffer(zip: JSZip): Promise<Uint8Array> {
  const anki21b = zip.file("collection.anki21b");
  if (anki21b) {
    const compressed = await anki21b.async("uint8array");
    return fzstd.decompress(compressed);
  }
  const legacy = zip.file("collection.anki21") || zip.file("collection.anki2");
  if (legacy) {
    return legacy.async("uint8array");
  }
  throw new Error("Invalid .apkg file: could not find the Anki database inside the archive.");
}

export async function parseApkg(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const dbBuffer = await getDbBuffer(zip);
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const db: Database = new SQL.Database(dbBuffer);

  const cards: AnkiCard[] = [];
  try {
    const results = db.exec("SELECT flds FROM notes");
    if (results.length > 0) {
      for (const row of results[0].values) {
        const fields = (row[0] as string).split("\x1f");
        if ((fields[0] || "").includes(".colpkg")) continue;
        const frontHtml = fields[0] || "";
        const backHtml = fields[1] || "";
        const front = stripHtml(frontHtml);
        const back = stripHtml(backHtml);
        if (front || back) {
          cards.push({ front, back, frontHtml, backHtml });
        }
      }
    }
  } finally {
    db.close();
  }

  if (cards.length === 0) {
    throw new Error("No cards found in this .apkg file.");
  }

  // Parse media mapping
  let mediaMapping: Record<string, string> = {};
  const mediaFile = zip.file("media");
  if (mediaFile) {
    const mediaBuffer = await mediaFile.async("uint8array");
    mediaMapping = getMediaMapping(mediaBuffer);
  }

  // Build lookup maps with normalized variants
  const filenameToZip: Record<string, string> = {};
  const normalizedToOriginal: Record<string, string> = {};
  
  for (const [zipNum, fname] of Object.entries(mediaMapping)) {
    filenameToZip[fname] = zipNum;
    
    const variants = normalizeFilename(fname);
    for (const variant of variants) {
      if (!normalizedToOriginal[variant]) {
        normalizedToOriginal[variant] = fname;
      }
    }
  }

  // Collect image sources referenced in cards
  const referenced = new Set<string>();
  for (const card of cards) {
    for (const html of [card.frontHtml, card.backHtml]) {
      const sources = extractImageSources(html);
      sources.forEach((src) => referenced.add(src));
    }
  }

  // Load images with robust matching
  const images: Record<string, ImageInfo> = {};
  let resolvedCount = 0;
  let failedCount = 0;
  
  for (const originalSrc of referenced) {
    const variants = normalizeFilename(originalSrc);
    let zipNum: string | undefined;
    let matchedFilename: string | undefined;
    
    for (const variant of variants) {
      if (filenameToZip[variant]) {
        zipNum = filenameToZip[variant];
        matchedFilename = variant;
        break;
      }
      if (normalizedToOriginal[variant]) {
        const original = normalizedToOriginal[variant];
        zipNum = filenameToZip[original];
        matchedFilename = original;
        break;
      }
    }
    
    if (!zipNum || !matchedFilename) {
      failedCount++;
      continue;
    }
    
    resolvedCount++;
    
    const entry = zip.file(zipNum);
    if (!entry) continue;
    
    let buffer = await entry.async("uint8array");
    
    // Check if the file is zstd-compressed (Anki compresses media files individually)
    if (buffer.length >= 4 && 
        buffer[0] === 0x28 && buffer[1] === 0xb5 && 
        buffer[2] === 0x2f && buffer[3] === 0xfd) {
      buffer = fzstd.decompress(buffer);
    }
    
    const mime = detectMimeType(matchedFilename, buffer);
    const dataUrl = await uint8ToDataUrl(buffer, mime);
    
    images[originalSrc] = { 
      dataUrl, 
      mime, 
      originalSrc, 
      // Dimensions are no longer required during parse stage for current pipeline.
      w: 0,
      h: 0,
    };

    // Yield periodically to keep the UI responsive on large decks.
    if ((resolvedCount + failedCount) % 8 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return { cards, images };
}
