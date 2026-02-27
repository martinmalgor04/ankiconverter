import { jsPDF } from "jspdf";
import { ImageInfo, ParseResult } from "./parseApkg";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TEXT_LINE_H = 5.4;
const SECTION_GAP = 4;
const CARD_GAP = 8;
const PX_TO_MM = 0.264583;
const MAX_IMG_RENDER_H = PAGE_H - MARGIN * 2;

type Block =
  | { type: "text"; text: string }
  | { type: "image"; info: ImageInfo };

export interface PdfDiagnostics {
  cardsTotal: number;
  cardsRendered: number;
  imagesHydrated: number;
  renderFailures: number;
}

const imageSizeCache = new Map<string, { w: number; h: number }>();

function extractImageSources(html: string): string[] {
  const sources: string[] = [];
  const imgTagRegex = /<img[^>]*>/gi;
  const matches = html.match(imgTagRegex);
  if (!matches) return sources;
  for (const imgTag of matches) {
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i) || imgTag.match(/src=([^\s>]+)/i);
    if (srcMatch?.[1]) sources.push(srcMatch[1]);
  }
  return sources;
}

function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function resolveImageInfo(src: string, images: Record<string, ImageInfo>): ImageInfo | undefined {
  // 1) Exact source from card HTML (most reliable).
  if (images[src]) return images[src];

  // 2) Minimal normalization fallback (no basename heuristic to avoid wrong matches).
  let normalized = src.trim();
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // keep original if decoding fails
  }
  normalized = normalized.replace(/^\.\//, "").replace(/\?.*$/, "").replace(/#.*$/, "").replace(/\\/g, "/");

  if (images[normalized]) return images[normalized];

  // 3) Compare against originalSrc with same minimal normalization.
  for (const info of Object.values(images)) {
    let candidate = info.originalSrc.trim();
    try {
      candidate = decodeURIComponent(candidate);
    } catch {
      // noop
    }
    candidate = candidate.replace(/^\.\//, "").replace(/\?.*$/, "").replace(/#.*$/, "").replace(/\\/g, "/");
    if (candidate === normalized) return info;
  }

  return undefined;
}

function parseBlocks(html: string, images: Record<string, ImageInfo>): { blocks: Block[]; resolvedImages: number } {
  const sources = extractImageSources(html);
  const placeholderMap = new Map<string, string>();
  sources.forEach((src, idx) => placeholderMap.set(src, `\x00IMG_${idx}\x00`));

  let processed = html.replace(/<img[^>]*>/gi, (imgTag) => {
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i) || imgTag.match(/src=([^\s>]+)/i);
    if (!srcMatch?.[1]) return imgTag;
    return placeholderMap.get(srcMatch[1]) ?? imgTag;
  });

  processed = processed
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n");

  const parts = decodeEntities(processed).split(/(\x00IMG_\d+\x00)/);
  const blocks: Block[] = [];
  let resolvedImages = 0;

  for (const part of parts) {
    if (part.startsWith("\x00IMG_")) {
      const srcEntry = Array.from(placeholderMap.entries()).find(([, token]) => token === part);
      if (!srcEntry) continue;
      const src = srcEntry[0];
      const info = resolveImageInfo(src, images);
      if (info) {
        blocks.push({ type: "image", info });
        resolvedImages++;
      }
      continue;
    }

    const cleaned = part.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").trim();
    if (cleaned) blocks.push({ type: "text", text: cleaned });
  }

  return { blocks, resolvedImages };
}

function getJsPdfFormat(mime: string): "PNG" | "JPEG" {
  if (mime === "image/png") return "PNG";
  return "JPEG";
}

async function convertToPng(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, img.naturalWidth);
      canvas.height = Math.max(1, img.naturalHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context for image conversion"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Image conversion failed"));
    img.src = dataUrl;
  });
}

async function getImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  const cached = imageSizeCache.get(dataUrl);
  if (cached) return cached;
  const size = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: Math.max(1, img.naturalWidth), h: Math.max(1, img.naturalHeight) });
    img.onerror = () => resolve({ w: 800, h: 500 });
    img.src = dataUrl;
  });
  imageSizeCache.set(dataUrl, size);
  return size;
}

function ensureSpace(doc: jsPDF, currentY: number, neededHeight: number): number {
  if (currentY + neededHeight > PAGE_H - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return currentY;
}

async function renderBlocks(doc: jsPDF, blocks: Block[], yStart: number): Promise<{ y: number; failures: number }> {
  let y = yStart;
  let failures = 0;

  for (const block of blocks) {
    if (block.type === "text") {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(30, 30, 30);
      const lines = doc.splitTextToSize(block.text, CONTENT_W);
      const blockH = Math.max(TEXT_LINE_H, lines.length * TEXT_LINE_H);
      y = ensureSpace(doc, y, blockH);
      doc.text(lines, MARGIN, y);
      y += blockH;
      continue;
    }

    try {
      const size = await getImageSize(block.info.dataUrl);
      // Use natural image size by default; only shrink if it does not fit.
      let mmW = Math.max(1, size.w * PX_TO_MM);
      let mmH = Math.max(1, size.h * PX_TO_MM);

      if (mmW > CONTENT_W) {
        const scale = CONTENT_W / mmW;
        mmW *= scale;
        mmH *= scale;
      }

      if (mmH > MAX_IMG_RENDER_H) {
        const scale = MAX_IMG_RENDER_H / mmH;
        mmW *= scale;
        mmH *= scale;
      }

      y = ensureSpace(doc, y, mmH + SECTION_GAP);
      const x = MARGIN + (CONTENT_W - mmW) / 2;
      let dataUrl = block.info.dataUrl;
      let fmt = getJsPdfFormat(block.info.mime);
      if (!["image/png", "image/jpeg", "image/jpg"].includes(block.info.mime)) {
        dataUrl = await convertToPng(block.info.dataUrl);
        fmt = "PNG";
      }

      doc.addImage(dataUrl, fmt, x, y, mmW, mmH);
      y += mmH + SECTION_GAP;
    } catch {
      failures++;
      y += SECTION_GAP;
    }
  }

  return { y, failures };
}

export async function generatePdf(result: ParseResult, deckName: string): Promise<PdfDiagnostics> {
  const { cards, images } = result;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const diagnostics: PdfDiagnostics = {
    cardsTotal: cards.length,
    cardsRendered: 0,
    imagesHydrated: 0,
    renderFailures: 0,
  };

  let y = MARGIN;
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(deckName, PAGE_W / 2, y + 2, { align: "center" });
  y += 11;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(130, 130, 130);
  doc.text(`${cards.length} cards`, PAGE_W / 2, y, { align: "center" });
  y += 10;

  for (let index = 0; index < cards.length; index++) {
    const card = cards[index];
    try {
      y = ensureSpace(doc, y, 28);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(59, 130, 246);
      doc.text("FRONT", MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(170, 170, 170);
      doc.text(`#${index + 1}`, PAGE_W - MARGIN, y, { align: "right" });
      y += 5;

      const front = parseBlocks(card.frontHtml, images);
      diagnostics.imagesHydrated += front.resolvedImages;
      const frontResult = await renderBlocks(doc, front.blocks, y);
      y = frontResult.y;
      diagnostics.renderFailures += frontResult.failures;

      y = ensureSpace(doc, y, 4);
      doc.setDrawColor(225, 225, 225);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(16, 185, 129);
      doc.text("BACK", MARGIN, y);
      y += 5;

      const back = parseBlocks(card.backHtml, images);
      diagnostics.imagesHydrated += back.resolvedImages;
      const backResult = await renderBlocks(doc, back.blocks, y);
      y = backResult.y;
      diagnostics.renderFailures += backResult.failures;

      y += CARD_GAP;
      diagnostics.cardsRendered++;

      if ((index + 1) % 3 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      diagnostics.renderFailures++;
      y = ensureSpace(doc, y, 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(200, 50, 50);
      doc.text(`Card #${index + 1} failed to render`, MARGIN, y);
      y += 10;
      console.error(`Failed to render card #${index + 1}:`, error);
    }
  }

  doc.save(`${deckName}.pdf`);
  return diagnostics;
}
