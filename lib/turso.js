import { createClient } from "@libsql/client/web";

// Menggunakan HTTPS dan kredensial Anda secara eksplisit
export const turso = createClient({
  url: "https://cbt-adwa1234.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE5NDA1OTQsImlkIjoiMDFhMTMzYzYtZTMwMS03YjUwLWJjMjctYTdlY2FkYTZmZWQxIiwia2lkIjoiV2dudnFYeDBKb1ZkaENlM25TWWdCQThoZUx5dGZwdDJiS3ExUi1GQ0Z6dyIsInJpZCI6ImNhZThiOTk0LWU3N2YtNGNiOC04MGE1LWE1ZDE2MzQwNjJhNiJ9.R5P0b5qx5xLgVnSBGvvB06RA1f4P13djTu9NkUe3pc-9YdGPgIMv_CrpCzjkA8hAWnQZszvO3oQ1AKCX2zFLDw"
});
