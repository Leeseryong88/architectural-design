import type { ImageTransformMeta } from "@/types/domain";

export const MAX_PDF_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_PDF_PAGE_COUNT = 30; // 30페이지 이하
export const MAX_ANALYSIS_SELECTED_PAGES = 10; // 한 분석 작업에서 최대 10페이지

export interface PdfExtractedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageMetadata {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  nativeRotation: number;
}

export interface ValidatedPdfSummary {
  bytes: Uint8Array;
  documentHash: string;
  pageCount: number;
  pagesMeta: PdfPageMetadata[];
}

let pdfjsModulePromise: Promise<typeof import("pdfjs-dist")> | null = null;

export async function getPdfJs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import("pdfjs-dist").then((mod) => {
      if (typeof window !== "undefined") {
        mod.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
      }
      return mod;
    });
  }
  return pdfjsModulePromise;
}

/**
 * SHA-256 해시 계산 (Web Crypto API)
 */
export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * PDF 바이트 헤더(%PDF-) 확인
 */
export function hasValidPdfMagicHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  // 앞부분 1024바이트 내 %PDF- 시그니처 확인
  const limit = Math.min(bytes.byteLength - 5, 1024);
  for (let i = 0; i <= limit; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 업로드된 PDF 파일의 크기·MIME·헤더·암호화·페이지 수(30p 이하)를 엄격히 검사한다.
 */
export async function validateAndInspectPdfFile(
  file: File
): Promise<ValidatedPdfSummary> {
  if (file.size === 0) {
    throw new Error("빈 파일은 업로드할 수 없습니다.");
  }
  if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
    throw new Error(
      `PDF 파일 크기가 제한(20MB)을 초과했습니다. (현재: ${(
        file.size /
        (1024 * 1024)
      ).toFixed(2)} MB)`
    );
  }

  // MIME이 비어있거나 application/pdf가 아닌 경우 경고하되 실제 헤더를 필수로 검증
  if (
    file.type &&
    file.type !== "application/pdf" &&
    file.type !== "application/x-pdf" &&
    file.type !== "application/octet-stream"
  ) {
    throw new Error(
      `허용되지 않는 파일 형식(${file.type})입니다. PDF 도면 파일만 업로드할 수 있습니다.`
    );
  }

  const arrayBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);

  if (!hasValidPdfMagicHeader(bytes)) {
    throw new Error(
      "유효한 PDF 헤더(%PDF-)가 확인되지 않습니다. 확장자만 변경된 파일이거나 손상된 파일입니다."
    );
  }

  const documentHash = await computeSha256Hex(bytes);
  const pdfjs = await getPdfJs();

  try {
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
    });
    const pdfDoc = await loadingTask.promise;

    if (pdfDoc.numPages < 1) {
      throw new Error("페이지가 없는 PDF 파일입니다.");
    }
    if (pdfDoc.numPages > MAX_PDF_PAGE_COUNT) {
      throw new Error(
        `PDF 페이지 수가 초기 지원 제한(${MAX_PDF_PAGE_COUNT}페이지)을 초과했습니다. (현재: ${pdfDoc.numPages}페이지)`
      );
    }

    const pagesMeta: PdfPageMetadata[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      pagesMeta.push({
        pageIndex: i,
        widthPt: viewport.width,
        heightPt: viewport.height,
        nativeRotation: page.rotate || 0,
      });
    }

    await pdfDoc.destroy();

    return {
      bytes,
      documentHash,
      pageCount: pagesMeta.length,
      pagesMeta,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.toLowerCase().includes("password") ||
      msg.includes("PasswordException")
    ) {
      throw new Error(
        "비밀번호가 설정된 암호화 PDF는 업로드할 수 없습니다. 암호 해제 후 다시 업로드하세요."
      );
    }
    if (msg.includes("초과") || msg.includes("PDF")) {
      throw new Error(msg);
    }
    throw new Error(
      `손상되었거나 읽을 수 없는 PDF 파일입니다: ${msg}`
    );
  }
}

/**
 * 특정 페이지에서 텍스트와 원본 PDF pt 기준 위치(좌상단 원점)를 추출한다.
 */
export async function extractPageTextAndPositions(
  pdfBytes: Uint8Array,
  pageIndex: number
): Promise<PdfExtractedTextItem[]> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;

  try {
    const page = await pdfDoc.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    const textContent = await page.getTextContent();

    const items: PdfExtractedTextItem[] = [];
    for (const rawItem of textContent.items) {
      if (!("str" in rawItem)) continue;
      const str = rawItem.str.trim();
      if (!str) continue;

      // transform: [scaleX, skewY, skewX, scaleY, tx, ty] (PDF bottom-left origin)
      const tx = Number(rawItem.transform[4] || 0);
      const ty = Number(rawItem.transform[5] || 0);
      const w = Number(rawItem.width || Math.max(10, str.length * 6));
      const h = Number(
        rawItem.height || Math.abs(Number(rawItem.transform[3] || 10))
      );

      // 좌상단 원점 PDF pt 좌표로 변환
      const topDownY = Math.max(0, viewport.height - ty - h);
      items.push({
        str,
        x: Math.round(tx * 100) / 100,
        y: Math.round(topDownY * 100) / 100,
        width: Math.round(w * 100) / 100,
        height: Math.round(h * 100) / 100,
      });
    }
    return items;
  } finally {
    await pdfDoc.destroy();
  }
}

/**
 * AI 분석 전달용 제한된 해상도의 페이지 이미지(JPEG Data URL / Base64) 및 좌표 변환 메타 생성
 */
export async function renderPageForAiAnalysis(
  pdfBytes: Uint8Array,
  pageIndex: number,
  maxDimensionPx = 1600
): Promise<{
  imageBase64: string;
  imageMimeType: "image/jpeg";
  transformMeta: ImageTransformMeta;
}> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() });
  const pdfDoc = await loadingTask.promise;

  try {
    const page = await pdfDoc.getPage(pageIndex);
    const baseViewport = page.getViewport({ scale: 1, rotation: 0 });
    const maxPt = Math.max(baseViewport.width, baseViewport.height, 1);
    const scale = Math.min(2.0, maxDimensionPx / maxPt);
    const renderViewport = page.getViewport({ scale, rotation: 0 });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D 컨텍스트를 생성할 수 없습니다.");
    }

    await page.render({
      canvasContext: ctx,
      viewport: renderViewport,
    }).promise;

    const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

    const transformMeta: ImageTransformMeta = {
      originalPageWidthPt: baseViewport.width,
      originalPageHeightPt: baseViewport.height,
      pdfNativeRotation: page.rotate || 0,
      renderRotation: 0,
      imageWidthPx: canvas.width,
      imageHeightPx: canvas.height,
      cropBoxPt: {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      },
    };

    return {
      imageBase64: base64,
      imageMimeType: "image/jpeg",
      transformMeta,
    };
  } finally {
    await pdfDoc.destroy();
  }
}
