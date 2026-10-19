import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getPublicEnvConfig } from "@/lib/config/env";

let cachedApp: FirebaseApp | null = null;

/**
 * 필요한 시점에만 Firebase 웹 클라이언트를 초기화한다.
 * 모듈 임포트 단계에서 즉시 초기화하지 않아 환경변수 미설정 시에도 앱 로드가 깨지지 않는다.
 */
export function getFirebaseClientServices(): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
} {
  const env = getPublicEnvConfig();
  if (env.mode !== "live") {
    throw new Error(
      "데모 모드에서는 Firebase 클라이언트를 호출하지 않습니다."
    );
  }
  if (!env.isValid) {
    throw new Error(
      `Firebase 클라이언트 설정 오류:\n${env.errors.join("\n")}`
    );
  }

  if (!cachedApp) {
    cachedApp =
      getApps().length > 0 ? getApp() : initializeApp(env.firebaseConfig);
  }

  return {
    app: cachedApp,
    auth: getAuth(cachedApp),
    db: getFirestore(cachedApp),
    storage: getStorage(cachedApp),
  };
}
