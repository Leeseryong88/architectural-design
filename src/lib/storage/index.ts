import { getPublicEnvConfig } from "@/lib/config/env";
import { DemoLocalRepository } from "./demo-adapter";
import { LiveFirebaseRepository } from "./live-adapter";
import type { StorageRepository } from "./types";

let demoInstance: DemoLocalRepository | null = null;
let liveInstance: LiveFirebaseRepository | null = null;

/**
 * NEXT_PUBLIC_APP_MODE에 따라 저장 어댑터를 반환한다.
 * 실제 모드(live)에서 설정이 누락되어도 데모 어댑터로 자동 전환하지 않는다.
 */
export function getStorageRepository(): StorageRepository {
  const env = getPublicEnvConfig();
  if (env.mode === "live") {
    if (!liveInstance) {
      liveInstance = new LiveFirebaseRepository();
    }
    return liveInstance;
  }

  if (!demoInstance) {
    demoInstance = new DemoLocalRepository();
  }
  return demoInstance;
}
