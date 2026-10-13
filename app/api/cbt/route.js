// app/api/cbt/route.js
import { NextResponse } from "next/server";
import { turso } from "@/lib/turso";

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, args } = body;

    let result = { status: "error", msg: "Action not found" };

    switch (action) {
      case "loginUser": {
        const [username, password] = args;
        const res = await turso.execute({
          sql: "SELECT * FROM Users WHERE Username = ? AND Password = ?",
          args: [username, password]
        });
        
        if (res.rows.length > 0) {
          result = { status: "success", data: res.rows[0], logo: "URL_LOGO_ANDA" };
        } else {
          result = { status: "error", msg: "Username atau Password salah!" };
        }
        break;
      }

      case "getDashboardData": {
        const [role, userId, userClass] = args;
        // Hitung statistik dan ambil ujian dari SQLite
        const examsRes = await turso.execute("SELECT * FROM Exams");
        const usersRes = await turso.execute("SELECT * FROM Users WHERE Role = 'siswa'");
        
        result = {
            status: "success",
            data: {
                stats: { totalSiswa: usersRes.rows.length, totalUjian: examsRes.rows.length },
                exams: examsRes.rows,
                availableExams: examsRes.rows.filter(e => e.Status === 'Aktif') // Logika filter tambahan untuk siswa bisa disesuaikan
            }
        };
        break;
      }
      
      // Tambahkan case fungsi lainnya yang ada di Apps Script (submitExam, getExamQuestions, dll)
      // menggunakan logika `await turso.execute(...)`
      
      default:
        result = { status: "success", msg: `Dummy response for ${action}` };
        break;
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ status: "error", msg: error.message }, { status: 500 });
  }
}
