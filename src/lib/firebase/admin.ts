import "server-only";
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App as AdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { getServerEnvConfig } from "@/lib/config/server-env";

let cachedAdminApp: AdminApp | null = null;

export function getFirebaseAdminServices() {
  const env = getServerEnvConfig();
  if (!env.isValid) {
    throw new Error(
      `서버 환경변수 설정 오류:\n${env.errors.join("\n")}`
    );
  }

  if (!cachedAdminApp) {
    if (getApps().length > 0) {
      cachedAdminApp = getApp();
    } else {
      cachedAdminApp = initializeApp({
        credential: cert({
          projectId: env.firebaseAdmin.projectId,
          clientEmail: env.firebaseAdmin.clientEmail,
          privateKey: env.firebaseAdmin.privateKey,
        }),
        storageBucket: env.firebaseAdmin.storageBucket,
      });
    }
  }

  return {
    adminApp: cachedAdminApp,
    adminAuth: getAdminAuth(cachedAdminApp),
    adminDb: getAdminFirestore(cachedAdminApp),
    adminStorage: getAdminStorage(cachedAdminApp),
  };
}

/**
 * 요청 헤더의 Authorization: Bearer <idToken>을 확인하고 검증된 사용자 uid/email을 반환한다.
 * 클라이언트가 전달한 ownerId를 절대 신뢰하지 않고 이 함수가 반환한 uid만 소유자로 사용한다.
 */
export async function verifyServerIdToken(
  request: Request
): Promise<DecodedIdToken> {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("인증 토큰(Authorization Bearer)이 누락되었습니다.");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new Error("유효하지 않은 인증 토큰입니다.");
  }
  const { adminAuth } = getFirebaseAdminServices();
  return await adminAuth.verifyIdToken(token, true);
}

/**
 * 서버 경로에서 프로젝트 소유권을 확인한다 (Admin SDK는 보안 규칙을 우회하므로 별도 검증 필수)
 */
export async function assertProjectOwnershipOnServer(
  projectId: string,
  verifiedUid: string
): Promise<FirebaseFirestore.DocumentData> {
  const { adminDb } = getFirebaseAdminServices();
  const projSnap = await adminDb.collection("projects").doc(projectId).get();
  if (!projSnap.exists) {
    throw new Error("프로젝트를 찾을 수 없습니다.");
  }
  const data = projSnap.data();
  if (!data || data.ownerId !== verifiedUid) {
    throw new Error("해당 프로젝트에 대한 접근 권한이 없습니다.");
  }
  return data;
}
