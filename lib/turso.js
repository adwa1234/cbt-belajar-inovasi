import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url || !authToken) {
  console.error("KRITIKAL: TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN kosong!");
}

export const turso = createClient({
  url: url,
  authToken: authToken,
});
