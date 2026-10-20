import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const bucketName = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
const projectId = (
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  ""
).trim();
const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n");

if (!bucketName || !projectId || !clientEmail || !privateKey.includes("PRIVATE KEY")) {
  console.error(
    "Storage CORS 설정에 FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET 이 필요합니다."
  );
  process.exit(1);
}

const cors = JSON.parse(readFileSync(new URL("../storage.cors.json", import.meta.url), "utf8"));

if (getApps().length === 0) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: bucketName,
  });
}

const bucket = getStorage().bucket(bucketName);
await bucket.setCorsConfiguration(cors);
const [metadata] = await bucket.getMetadata();
console.log(
  `Storage 버킷 CORS를 적용했습니다: ${bucketName} (origins=${JSON.stringify(
    metadata.cors?.[0]?.origin ?? []
  )})`
);
