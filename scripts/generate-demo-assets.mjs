import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const ROOT = process.cwd();
const FONTS_DIR = path.join(ROOT, "public", "fonts");
const DEMO_DIR = path.join(ROOT, "public", "demo");

fs.mkdirSync(FONTS_DIR, { recursive: true });
fs.mkdirSync(DEMO_DIR, { recursive: true });

const FONT_PATH = path.join(FONTS_DIR, "NanumGothic-Regular.ttf");
const LICENSE_PATH = path.join(FONTS_DIR, "OFL-LICENSE.txt");

async function ensureKoreanFont() {
  if (!fs.existsSync(FONT_PATH) || fs.statSync(FONT_PATH).size < 100_000) {
    console.log("한글 폰트(NanumGothic-Regular.ttf) 다운로드 중...");
    const fontUrl =
      "https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf";
    const res = await fetch(fontUrl);
    if (!res.ok) {
      throw new Error(`폰트 다운로드 실패: ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(FONT_PATH, buf);
  }

  const oflText = `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
Font: NanumGothic (Copyright (c) 2010, NAVER Corporation (https://www.navercorp.com))
This Font Software is licensed under the SIL Open Font License, Version 1.1.
Permits bundling, embedding, and redistribution in web and PDF documents.`;
  fs.writeFileSync(LICENSE_PATH, oflText, "utf8");
}

function drawGridAndBorder(page, font, title, sheetNo, scaleText) {
  const { width, height } = page.getSize();
  // 외곽 도각
  page.drawRectangle({
    x: 30,
    y: 30,
    width: width - 60,
    height: height - 60,
    borderColor: rgb(0.15, 0.2, 0.3),
    borderWidth: 1.5,
  });

  // 상단 타이틀 바
  page.drawRectangle({
    x: 30,
    y: height - 75,
    width: width - 60,
    height: 45,
    color: rgb(0.94, 0.96, 0.98),
    borderColor: rgb(0.15, 0.2, 0.3),
    borderWidth: 1,
  });

  page.drawText(`[가상 예제 도면] 성수동 제1·2종 근린생활시설 신축공사 - ${title}`, {
    x: 45,
    y: height - 57,
    size: 13,
    font,
    color: rgb(0.08, 0.12, 0.2),
  });

  page.drawText(`도번: ${sheetNo}  |  기재 축척: ${scaleText}`, {
    x: width - 250,
    y: height - 56,
    size: 10,
    font,
    color: rgb(0.25, 0.3, 0.4),
  });

  // 하단 주의 문구
  page.drawText(
    "※ 본 PDF는 면적노트 데모 모드를 위해 생성된 가상 건축도면이며, 실제 건축사사무소 자료가 아닙니다.",
    {
      x: 45,
      y: 42,
      size: 8.5,
      font,
      color: rgb(0.45, 0.45, 0.45),
    }
  );
}

async function generateVirtualDrawingPdf() {
  await ensureKoreanFont();
  const fontBytes = fs.readFileSync(FONT_PATH);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const customFont = await pdfDoc.embedFont(fontBytes);

  const PAGE_W = 842; // A4 Landscape width pt
  const PAGE_H = 595; // A4 Landscape height pt

  // =========================================================================
  // Page 1: 건축개요 (Overview)
  // =========================================================================
  const p1 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawGridAndBorder(p1, customFont, "건축개요 (ARCHITECTURAL OVERVIEW)", "A-001", "NONE");

  const overviewRows = [
    ["사 업 명", "성수동 근린생활시설 신축공사"],
    ["대 지 위 치", "서울특별시 성동구 성수동2가 000-00번지 (가상 지번)"],
    ["지역 / 지구", "제2종일반주거지역"],
    ["대 지 면 적", "450.00 ㎡"],
    ["건 축 면 적", "240.00 ㎡"],
    ["연 면 적", "785.00 ㎡ (※ 면적산출표 합계 770.00㎡와 15.00㎡ 불일치 예제)"],
    ["용적률산정 연면적", "550.00 ㎡ (지하층 220.00㎡ 제외)"],
    ["건 폐 율", "53.33 % (법정 한도: 사용자 확인 필요)"],
    ["용 적 률", "122.22 % (법정 한도: 사용자 확인 필요)"],
    ["동 명 칭 / 주용도", "주건축물 제1동 / 제1종·제2종 근린생활시설"],
    ["주 구 조 / 규 모", "철근콘크리트조 / 지하 1층, 지상 2층"],
  ];

  let yCursor = PAGE_H - 115;
  p1.drawText("1. 일반 건축개요표", {
    x: 60,
    y: yCursor + 12,
    size: 11,
    font: customFont,
    color: rgb(0.1, 0.15, 0.25),
  });

  for (const [label, val] of overviewRows) {
    p1.drawRectangle({
      x: 60,
      y: yCursor - 22,
      width: 160,
      height: 26,
      color: rgb(0.95, 0.96, 0.98),
      borderColor: rgb(0.6, 0.65, 0.72),
      borderWidth: 0.7,
    });
    p1.drawRectangle({
      x: 220,
      y: yCursor - 22,
      width: 540,
      height: 26,
      borderColor: rgb(0.6, 0.65, 0.72),
      borderWidth: 0.7,
    });
    p1.drawText(label, {
      x: 72,
      y: yCursor - 13,
      size: 9.5,
      font: customFont,
      color: rgb(0.15, 0.2, 0.25),
    });
    p1.drawText(val, {
      x: 234,
      y: yCursor - 13,
      size: 9.5,
      font: customFont,
      color: rgb(0.1, 0.1, 0.15),
    });
    yCursor -= 26;
  }

  p1.drawText(
    "주석: 1) 본 건축개요의 연면적(785.00㎡)은 초기 계획 수치로 오기재되어 있으며, 면적산출표(A-006) 상 합계는 770.00㎡임.",
    {
      x: 60,
      y: 120,
      size: 9,
      font: customFont,
      color: rgb(0.7, 0.15, 0.15),
    }
  );
  p1.drawText(
    "주석: 2) 지하1층 설비/기계실 구역의 바닥면적 제외 여부는 설계자 근거 확인이 필요함.",
    {
      x: 60,
      y: 100,
      size: 9,
      font: customFont,
      color: rgb(0.7, 0.15, 0.15),
    }
  );

  // =========================================================================
  // Page 2: 지하1층 평면도 (B1 Floor Plan)
  // =========================================================================
  // 설계 좌표: 1m = 20pt (축척 1:100 근사).
  // 가로 20m = 400pt (x: 150 ~ 550), 세로 11m = 220pt (top-down yPt: 180 ~ 400 => pdf-lib bottom-up y: 595-400=195 ~ 595-180=415)
  const p2 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawGridAndBorder(p2, customFont, "지하 1층 평면도 (B1 FLOOR PLAN)", "A-002", "1 : 100");

  // 외벽 사각형 (20.0m x 11.0m = 220.00 ㎡)
  p2.drawRectangle({
    x: 150,
    y: PAGE_H - 400,
    width: 400,
    height: 220,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 2,
  });

  // 내부 구획선 (좌측 다목적홀 14m=280pt, 우측 기계/전기실 6m=120pt)
  p2.drawLine({
    start: { x: 430, y: PAGE_H - 400 },
    end: { x: 430, y: PAGE_H - 180 },
    thickness: 1.2,
    color: rgb(0.2, 0.2, 0.2),
  });

  // 치수선 (상단: 20,000 mm, 좌측: 11,000 mm)
  p2.drawLine({
    start: { x: 150, y: PAGE_H - 150 },
    end: { x: 550, y: PAGE_H - 150 },
    thickness: 0.8,
    color: rgb(0.1, 0.35, 0.7),
  });
  p2.drawText("20,000 mm (축척 보정 기준 치수)", {
    x: 280,
    y: PAGE_H - 142,
    size: 9.5,
    font: customFont,
    color: rgb(0.1, 0.35, 0.7),
  });

  p2.drawLine({
    start: { x: 120, y: PAGE_H - 400 },
    end: { x: 120, y: PAGE_H - 180 },
    thickness: 0.8,
    color: rgb(0.1, 0.35, 0.7),
  });
  p2.drawText("11,000 mm", {
    x: 68,
    y: PAGE_H - 295,
    size: 9.5,
    font: customFont,
    color: rgb(0.1, 0.35, 0.7),
  });

  p2.drawText("실명: B1 제2종근린생활시설(휴게음식점)", {
    x: 185,
    y: PAGE_H - 275,
    size: 10.5,
    font: customFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  p2.drawText("도면 기재 면적: 154.00 ㎡ (14.0m × 11.0m)", {
    x: 185,
    y: PAGE_H - 295,
    size: 9.5,
    font: customFont,
    color: rgb(0.25, 0.25, 0.3),
  });

  p2.drawText("실명: B1 기계/전기실", {
    x: 442,
    y: PAGE_H - 275,
    size: 10,
    font: customFont,
    color: rgb(0.6, 0.15, 0.15),
  });
  p2.drawText("기재 면적: 66.00 ㎡", {
    x: 442,
    y: PAGE_H - 295,
    size: 9,
    font: customFont,
    color: rgb(0.6, 0.15, 0.15),
  });
  p2.drawText("(제외 근거 미입력 상태)", {
    x: 440,
    y: PAGE_H - 312,
    size: 8.5,
    font: customFont,
    color: rgb(0.75, 0.15, 0.15),
  });

  p2.drawText("지하1층 바닥면적 합계: 220.00 ㎡  |  기재 축척 1:100", {
    x: 600,
    y: PAGE_H - 220,
    size: 9.5,
    font: customFont,
    color: rgb(0.15, 0.2, 0.3),
  });

  // =========================================================================
  // Page 3: 지상 1층 평면도 (1F Floor Plan)
  // =========================================================================
  // 외곽: 가로 20m = 400pt (x: 150 ~ 550), 세로 15m = 300pt (top-down yPt: 160 ~ 460) -> 총 외곽 300.00 ㎡
  // 중앙 설비 샤프트/보이드 공제: 가로 5m = 100pt (x: 350 ~ 450), 세로 4m = 80pt (top-down yPt: 260 ~ 340) -> 공제 20.00 ㎡
  // 순면적: 300.00 - 20.00 = 280.00 ㎡
  const p3 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawGridAndBorder(p3, customFont, "지상 1층 평면도 (1F FLOOR PLAN)", "A-003", "1 : 100");

  p3.drawRectangle({
    x: 150,
    y: PAGE_H - 460,
    width: 400,
    height: 300,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 2,
  });

  // 공제 영역 (설비 샤프트 / 중정 보이드)
  p3.drawRectangle({
    x: 350,
    y: PAGE_H - 340,
    width: 100,
    height: 80,
    color: rgb(0.98, 0.92, 0.92),
    borderColor: rgb(0.8, 0.2, 0.2),
    borderWidth: 1.5,
  });

  p3.drawText("공제: 설비샤프트/오픈", {
    x: 356,
    y: PAGE_H - 295,
    size: 8.5,
    font: customFont,
    color: rgb(0.75, 0.15, 0.15),
  });
  p3.drawText("5,000 × 4,000 (20.00㎡)", {
    x: 355,
    y: PAGE_H - 310,
    size: 8,
    font: customFont,
    color: rgb(0.75, 0.15, 0.15),
  });

  // 치수선
  p3.drawLine({
    start: { x: 150, y: PAGE_H - 135 },
    end: { x: 550, y: PAGE_H - 135 },
    thickness: 0.8,
    color: rgb(0.1, 0.35, 0.7),
  });
  p3.drawText("20,000 mm (축척 보정 기준 치수)", {
    x: 280,
    y: PAGE_H - 127,
    size: 9.5,
    font: customFont,
    color: rgb(0.1, 0.35, 0.7),
  });

  p3.drawLine({
    start: { x: 120, y: PAGE_H - 460 },
    end: { x: 120, y: PAGE_H - 160 },
    thickness: 0.8,
    color: rgb(0.1, 0.35, 0.7),
  });
  p3.drawText("15,000 mm", {
    x: 68,
    y: PAGE_H - 310,
    size: 9.5,
    font: customFont,
    color: rgb(0.1, 0.35, 0.7),
  });

  p3.drawText("실명: 1층 제1종근린생활시설(소매점)", {
    x: 175,
    y: PAGE_H - 210,
    size: 11,
    font: customFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  p3.drawText("외곽 300.00 ㎡ - 공제 20.00 ㎡ = 순바닥면적 280.00 ㎡", {
    x: 175,
    y: PAGE_H - 230,
    size: 9.5,
    font: customFont,
    color: rgb(0.2, 0.25, 0.35),
  });

  // =========================================================================
  // Page 4: 지상 2층 평면도 (2F Floor Plan)
  // =========================================================================
  // 가로 18m = 360pt (x: 150 ~ 510), 세로 15m = 300pt (top-down yPt: 160 ~ 460) -> 270.00 ㎡
  const p4 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawGridAndBorder(p4, customFont, "지상 2층 평면도 (2F FLOOR PLAN)", "A-004", "1 : 100");

  p4.drawRectangle({
    x: 150,
    y: PAGE_H - 460,
    width: 360,
    height: 300,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 2,
  });

  p4.drawLine({
    start: { x: 150, y: PAGE_H - 135 },
    end: { x: 510, y: PAGE_H - 135 },
    thickness: 0.8,
    color: rgb(0.1, 0.35, 0.7),
  });
  p4.drawText("18,000 mm (축척 보정 기준 치수)", {
    x: 265,
    y: PAGE_H - 127,
    size: 9.5,
    font: customFont,
    color: rgb(0.1, 0.35, 0.7),
  });

  p4.drawLine({
    start: { x: 120, y: PAGE_H - 460 },
    end: { x: 120, y: PAGE_H - 160 },
    thickness: 0.8,
    color: rgb(0.1, 0.35, 0.7),
  });
  p4.drawText("15,000 mm", {
    x: 68,
    y: PAGE_H - 310,
    size: 9.5,
    font: customFont,
    color: rgb(0.1, 0.35, 0.7),
  });

  p4.drawText("실명: 2층 제2종근린생활시설(사무소)", {
    x: 185,
    y: PAGE_H - 290,
    size: 11,
    font: customFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  p4.drawText("도면 기재 면적: 270.00 ㎡ (18.0m × 15.0m)", {
    x: 185,
    y: PAGE_H - 312,
    size: 9.5,
    font: customFont,
    color: rgb(0.2, 0.25, 0.35),
  });

  // =========================================================================
  // Page 5: 주단면도 (Section)
  // =========================================================================
  const p5 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawGridAndBorder(p5, customFont, "주단면도 (MAIN SECTION)", "A-005", "1 : 100");

  // 지반선 (GL)
  p5.drawLine({
    start: { x: 100, y: 230 },
    end: { x: 720, y: 230 },
    thickness: 2,
    color: rgb(0.3, 0.2, 0.1),
  });
  p5.drawText("G.L ±0", { x: 105, y: 236, size: 9.5, font: customFont });

  // B1, 1F, 2F 단면 박스
  p5.drawRectangle({
    x: 200,
    y: 140,
    width: 400,
    height: 90,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 1.5,
  });
  p5.drawText("B1F (층고 3,600 mm) - 제2종근린생활시설 / 기계실", {
    x: 230,
    y: 180,
    size: 10,
    font: customFont,
  });

  p5.drawRectangle({
    x: 200,
    y: 230,
    width: 400,
    height: 110,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 1.5,
  });
  p5.drawText("1F (층고 4,200 mm) - 제1종근린생활시설(소매점)", {
    x: 230,
    y: 280,
    size: 10,
    font: customFont,
  });

  p5.drawRectangle({
    x: 200,
    y: 340,
    width: 360,
    height: 100,
    borderColor: rgb(0.1, 0.1, 0.1),
    borderWidth: 1.5,
  });
  p5.drawText("2F (층고 3,900 mm) - 제2종근린생활시설(사무소)", {
    x: 230,
    y: 385,
    size: 10,
    font: customFont,
  });

  p5.drawText("최고높이: 8,100 mm", {
    x: 620,
    y: 390,
    size: 10,
    font: customFont,
    color: rgb(0.1, 0.35, 0.7),
  });

  // =========================================================================
  // Page 6: 면적산출표 (Area Calculation Table)
  // =========================================================================
  const p6 = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawGridAndBorder(p6, customFont, "층별·용도별 면적산출표 (AREA CALCULATION TABLE)", "A-006", "NONE");

  const tableHeaders = ["구분(층)", "구역/실명", "주용도", "산출식 / 내역", "바닥면적(㎡)", "비고(구분)"];
  const tableRows = [
    ["지하1층(B1)", "B1 휴게음식점", "제2종근린생활시설", "14.0 × 11.0", "154.00", "상세 행"],
    ["지하1층(B1)", "B1 기계/전기실", "기계/전기실(부속)", "6.0 × 11.0", "66.00", "상세 행 (용적률 제외 검토)"],
    ["지하1층 소계", "지하1층 합계", "-", "154.00 + 66.00", "220.00", "소계 (비교값)"],
    ["지상1층(1F)", "1F 소매점", "제1종근린생활시설", "(20.0 × 15.0) - (5.0 × 4.0)", "280.00", "상세 행 (샤프트 20㎡ 공제)"],
    ["지상2층(2F)", "2F 사무소", "제2종근린생활시설", "18.0 × 15.0", "270.00", "상세 행"],
    ["지상층 소계", "지상1~2층 합계", "-", "280.00 + 270.00", "550.00", "소계 (용적률 산정용)"],
    ["연면적 총계", "주건축물 제1동 계", "-", "220.00 + 280.00 + 270.00", "770.00", "총계 (건축개요 785㎡와 차이)"],
  ];

  const colWidths = [95, 130, 145, 165, 95, 110];
  let tableY = PAGE_H - 125;

  // Header
  let xPos = 50;
  for (let i = 0; i < tableHeaders.length; i++) {
    p6.drawRectangle({
      x: xPos,
      y: tableY - 26,
      width: colWidths[i],
      height: 26,
      color: rgb(0.9, 0.93, 0.97),
      borderColor: rgb(0.4, 0.45, 0.55),
      borderWidth: 0.8,
    });
    p6.drawText(tableHeaders[i], {
      x: xPos + 8,
      y: tableY - 17,
      size: 9.5,
      font: customFont,
      color: rgb(0.1, 0.15, 0.25),
    });
    xPos += colWidths[i];
  }
  tableY -= 26;

  for (const row of tableRows) {
    xPos = 50;
    const isTotalOrSubtotal = row[5].includes("소계") || row[5].includes("총계");
    for (let i = 0; i < row.length; i++) {
      p6.drawRectangle({
        x: xPos,
        y: tableY - 28,
        width: colWidths[i],
        height: 28,
        color: isTotalOrSubtotal ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1),
        borderColor: rgb(0.6, 0.65, 0.72),
        borderWidth: 0.6,
      });
      p6.drawText(row[i], {
        x: xPos + 8,
        y: tableY - 18,
        size: 9,
        font: customFont,
        color: rgb(0.12, 0.12, 0.15),
      });
      xPos += colWidths[i];
    }
    tableY -= 28;
  }

  p6.drawText(
    "※ 문서 간 불일치 확인용: 건축개요(A-001) 기재 연면적은 785.00 ㎡이나, 본 면적산출표(A-006) 합계는 770.00 ㎡임 (15.00 ㎡ 차이).",
    {
      x: 50,
      y: 135,
      size: 9.5,
      font: customFont,
      color: rgb(0.75, 0.15, 0.15),
    }
  );

  const pdfBytes = await pdfDoc.save();
  const pdfPath = path.join(DEMO_DIR, "sample-architectural-drawings.pdf");
  fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));

  const hash = crypto
    .createHash("sha256")
    .update(Buffer.from(pdfBytes))
    .digest("hex");

  const meta = {
    fileName: "sample-architectural-drawings.pdf",
    fileSize: pdfBytes.byteLength,
    documentHash: hash,
    pageCount: 6,
    generatedAt: "2026-10-19T00:00:00.000Z",
  };
  fs.writeFileSync(
    path.join(DEMO_DIR, "demo-pdf-meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8"
  );

  console.log("가상 도면 PDF 생성 완료:", meta);
}

generateVirtualDrawingPdf().catch((err) => {
  console.error(err);
  process.exit(1);
});
