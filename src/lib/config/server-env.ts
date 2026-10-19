import "server-only";
import { getPublicEnvConfig } from "./env";

export interface ServerEnvCheckResult {
  isValid: boolean;
  errors: string[];
  firebaseAdmin: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    storageBucket: string;
  };
  gemini: {
    apiKey: string;
    modelId: string;
  };
}

/**
 * 서버 전용 환경변수 확인 (Firebase Admin & Gemini API)
 * FIREBASE_PRIVATE_KEY의 이스케이프된 줄바꿈(\\n)을 실제 줄바꿈(\n)으로 변환한다.
 */
export function getServerEnvConfig(): ServerEnvCheckResult {
  const pub = getPublicEnvConfig();
  const errors = [...pub.errors];

  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ""
  ).trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();
  const privateKey = rawPrivateKey
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");
  const storageBucket = (
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ""
  ).trim();

  const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();
  const geminiModelId = (process.env.GEMINI_MODEL_ID || "").trim();

  if (pub.mode === "live") {
    if (!projectId || projectId.startsWith("YOUR_")) {
      errors.push("서버 필수 환경변수 누락: FIREBASE_PROJECT_ID");
    }
    if (!clientEmail || !clientEmail.includes("@")) {
      errors.push("서버 필수 환경변수 누락 또는 형식 오류: FIREBASE_CLIENT_EMAIL");
    }
    if (!privateKey || !privateKey.includes("PRIVATE KEY")) {
      errors.push(
        "서버 필수 환경변수 누락 또는 형식 오류: FIREBASE_PRIVATE_KEY (PEM 형식 확인 필요)"
      );
    }
    if (!geminiApiKey || geminiApiKey.startsWith("YOUR_")) {
      errors.push("서버 필수 환경변수 누락: GEMINI_API_KEY");
    }
    if (!geminiModelId || geminiModelId.startsWith("YOUR_")) {
      errors.push("서버 필수 환경변수 누락: GEMINI_MODEL_ID");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    firebaseAdmin: {
      projectId,
      clientEmail,
      privateKey,
      storageBucket,
    },
    gemini: {
      apiKey: geminiApiKey,
      modelId: geminiModelId,
    },
  };
}
