import { createClient } from "@libsql/client";

const dbUrl = (process.env.TURSO_DATABASE_URL || "").trim();
const dbToken = (process.env.TURSO_AUTH_TOKEN || "").trim();

if (!dbUrl || !dbToken) {
  console.error("KRITIKAL: TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN kosong!");
}

export const turso = createClient({
  url: dbUrl,
  authToken: dbToken,
});
