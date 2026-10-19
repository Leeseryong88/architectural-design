import fs from "node:fs";
import admin from "firebase-admin";

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || "";
const privateKey = rawPrivateKey
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n");
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY"
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
  storageBucket,
});

async function main() {
  const sr = admin.securityRules();

  const firestoreRulesSource = fs.readFileSync("firestore.rules", "utf8");
  const fsRuleset = await sr.releaseFirestoreRulesetFromSource(
    firestoreRulesSource
  );
  console.log("✅ Firestore rules deployed:", fsRuleset.name);

  if (storageBucket) {
    const storageRulesSource = fs.readFileSync("storage.rules", "utf8");
    const stRuleset = await sr.releaseStorageRulesetFromSource(
      storageRulesSource,
      storageBucket
    );
    console.log("✅ Storage rules deployed:", stRuleset.name);
  }
}

main().catch((err) => {
  console.error("❌ Failed to deploy rules:", err);
  process.exit(1);
});
