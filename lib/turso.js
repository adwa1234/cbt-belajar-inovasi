// lib/turso.js
const TURSO_URL = "https://cbt-adwa1234.aws-ap-northeast-1.turso.io";
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTE5NDA1OTQsImlkIjoiMDFhMTMzYzYtZTMwMS03YjUwLWJjMjctYTdlY2FkYTZmZWQxIiwia2lkIjoiV2dudnFYeDBKb1ZkaENlM25TWWdCQThoZUx5dGZwdDJiS3ExUi1GQ0Z6dyIsInJpZCI6ImNhZThiOTk0LWU3N2YtNGNiOC04MGE1LWE1ZDE2MzQwNjJhNiJ9.R5P0b5qx5xLgVnSBGvvB06RA1f4P13djTu9NkUe3pc-9YdGPgIMv_CrpCzjkA8hAWnQZszvO3oQ1AKCX2zFLDw";

export const turso = {
  execute: async (query) => {
    const sql = typeof query === 'string' ? query : query.sql;
    const rawArgs = typeof query === 'string' ? [] : (query.args || []);
    
    const args = rawArgs.map(arg => {
      if (typeof arg === 'number') return { type: "integer", value: String(arg) };
      if (arg === null || arg === undefined) return { type: "null" };
      return { type: "text", value: String(arg) };
    });

    const response = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TURSO_TOKEN}`,
        "Content-Type": "application/json"
      },
      cache: "no-store", 
      body: JSON.stringify({
        requests: [ { type: "execute", stmt: { sql, args } }, { type: "close" } ]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    const execResult = data.results[0];

    if (execResult.type === "error") throw new Error(execResult.error.message);

    const resultData = execResult.response.result;
    
    // PERBAIKAN: Perintah INSERT tidak mengembalikan baris data, cegah crash di sini
    if (!resultData.cols || !resultData.rows) {
        return { rows: [] };
    }

    const cols = resultData.cols.map(c => c.name);
    const rows = resultData.rows.map(rowArr => {
      const rowObj = {};
      cols.forEach((col, i) => { rowObj[col] = rowArr[i].value !== undefined ? rowArr[i].value : null; });
      return rowObj;
    });

    return { rows };
  }
};
