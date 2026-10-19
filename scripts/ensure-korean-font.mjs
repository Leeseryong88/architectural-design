import fs from "node:fs";
import path from "node:path";

const FONTS_DIR = path.join(process.cwd(), "public", "fonts");
const FONT_PATH = path.join(FONTS_DIR, "NanumGothic-Regular.ttf");
const LICENSE_PATH = path.join(FONTS_DIR, "OFL-LICENSE.txt");

async function ensureKoreanFont() {
  fs.mkdirSync(FONTS_DIR, { recursive: true });

  if (!fs.existsSync(FONT_PATH) || fs.statSync(FONT_PATH).size < 100_000) {
    console.log("한글 폰트(NanumGothic-Regular.ttf) 다운로드 중...");
    const fontUrl =
      "https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf";
    const res = await fetch(fontUrl);
    if (!res.ok) {
      throw new Error(`폰트 다운로드 실패: ${res.status} ${res.statusText}`);
    }
    fs.writeFileSync(FONT_PATH, Buffer.from(await res.arrayBuffer()));
  }

  const oflText = `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
Font: NanumGothic (Copyright (c) 2010, NAVER Corporation (https://www.navercorp.com))
This Font Software is licensed under the SIL Open Font License, Version 1.1.
Permits bundling, embedding, and redistribution in web and PDF documents.`;
  fs.writeFileSync(LICENSE_PATH, oflText, "utf8");
  console.log("한글 PDF 출력용 폰트 준비 완료:", FONT_PATH);
}

ensureKoreanFont().catch((err) => {
  console.error(err);
  process.exit(1);
});
