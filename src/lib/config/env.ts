import type { AppMode } from "@/types/domain";

export interface PublicEnvCheckResult {
  mode: AppMode;
  isValid: boolean;
  errors: string[];
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  };
}

/**
 * NEXT_PUBLIC_APP_MODE 및 클라이언트 환경변수를 확인한다.
 * - demo: Firebase·Gemini 없이 실행
 * - live: Firebase 인증·저장과 Gemini 분석 사용
 * - 실제 모드에서 환경변수가 없다고 데모 모드로 자동 전환하지 않는다.
 * - 소스 모듈을 불러오는 단계에서 애플리케이션 전체가 throw 하지 않도록 결과 객체로 반환한다.
 */
export function getPublicEnvConfig(): PublicEnvCheckResult {
  const rawMode = (process.env.NEXT_PUBLIC_APP_MODE || "demo").trim();
  const errors: string[] = [];

  let mode: AppMode = "demo";
  if (rawMode === "live") {
    mode = "live";
  } else if (rawMode !== "demo") {
    errors.push(
      `NEXT_PUBLIC_APP_MODE 값("${rawMode}")이 유효하지 않습니다. "demo" 또는 "live"로 설정해야 합니다.`
    );
  }

  const firebaseConfig = {
    apiKey: (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "").trim(),
    authDomain: (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "").trim(),
    projectId: (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim(),
    storageBucket: (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim(),
    messagingSenderId: (
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || ""
    ).trim(),
    appId: (process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "").trim(),
    measurementId:
      (process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "").trim() ||
      undefined,
  };

  if (mode === "live") {
    const requiredKeys: Array<[string, string]> = [
      ["NEXT_PUBLIC_FIREBASE_API_KEY", firebaseConfig.apiKey],
      ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain],
      ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
      ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", firebaseConfig.storageBucket],
      [
        "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
        firebaseConfig.messagingSenderId,
      ],
      ["NEXT_PUBLIC_FIREBASE_APP_ID", firebaseConfig.appId],
    ];

    for (const [keyName, val] of requiredKeys) {
      if (!val || val.startsWith("YOUR_") || val.includes("placeholder")) {
        errors.push(`실제 모드(live) 필수 환경변수 누락: ${keyName}`);
      }
    }
  }

  return {
    mode,
    isValid: errors.length === 0,
    errors,
    firebaseConfig,
  };
}
