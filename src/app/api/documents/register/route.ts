import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assertProjectOwnershipOnServer,
  getFirebaseAdminServices,
  verifyServerIdToken,
} from "@/lib/firebase/admin";
import {
  hasValidPdfMagicHeader,
  MAX_PDF_FILE_SIZE_BYTES,
  MAX_PDF_PAGE_COUNT,
} from "@/lib/pdf/pdf-engine";

export const runtime = "nodejs";

const RegisterDocumentSchema = z.object({
  projectId: z.string().min(1),
  documentId: z.string().min(1),
  originalFileName: z.string().min(1).max(255),
  storagePath: z.string().min(1),
  fileSize: z.number().int().positive().max(MAX_PDF_FILE_SIZE_BYTES),
  documentHash: z.string().min(16),
  version: z.number().int().positive(),
  pageCount: z.number().int().min(1).max(MAX_PDF_PAGE_COUNT),
});

/**
 * 실제 모드(live)에서 클라이언트가 Firebase Storage에 직접 업로드한 뒤
 * 서버에서 소유권·경로·크기·PDF 매직 헤더를 재검증하고 등록한다.
 */
export async function POST(request: Request) {
  try {
    const decoded = await verifyServerIdToken(request);
    const verifiedUid = decoded.uid;

    const rawBody: unknown = await request.json();
    const parsed = RegisterDocumentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "문서 등록 요청 데이터가 유효하지 않습니다.",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    await assertProjectOwnershipOnServer(body.projectId, verifiedUid);

    const expectedPrefix = `users/${verifiedUid}/projects/${body.projectId}/documents/${body.documentId}/`;
    if (!body.storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "허용되지 않는 Storage 저장 경로입니다." },
        { status: 403 }
      );
    }

    const { adminStorage, adminDb } = getFirebaseAdminServices();
    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(body.storagePath);
    const [exists] = await fileRef.exists();

    if (!exists) {
      return NextResponse.json(
        { error: "Storage에서 업로드된 PDF 파일을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const [metadata] = await fileRef.getMetadata();
    const actualSize = Number(metadata.size || 0);
    if (actualSize <= 0 || actualSize > MAX_PDF_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Storage 파일 크기가 20MB 제한을 초과하거나 비어 있습니다." },
        { status: 400 }
      );
    }

    // 앞 512바이트만 읽어 실제 PDF 헤더(%PDF-) 검증 (20MB 전체를 API 본문으로 받지 않음)
    const [headerChunk] = await fileRef.download({ start: 0, end: 511 });
    if (!hasValidPdfMagicHeader(new Uint8Array(headerChunk))) {
      await fileRef.delete().catch(() => undefined);
      return NextResponse.json(
        { error: "업로드된 파일이 유효한 PDF 형식이 아닙니다." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const docRecord = {
      id: body.documentId,
      ownerId: verifiedUid,
      projectId: body.projectId,
      originalFileName: body.originalFileName,
      storagePath: body.storagePath,
      fileSize: actualSize,
      documentHash: body.documentHash,
      version: body.version,
      pageCount: body.pageCount,
      uploadedAt: now,
    };

    await adminDb
      .collection("projects")
      .doc(body.projectId)
      .collection("documents")
      .doc(body.documentId)
      .set(docRecord);

    return NextResponse.json({ document: docRecord });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "문서 등록 검증 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
