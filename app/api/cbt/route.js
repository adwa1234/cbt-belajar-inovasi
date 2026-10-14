import { NextResponse } from "next/server";
import { turso } from "@/lib/turso"; // Gunakan ../../../lib/turso jika alias belum aktif

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, args } = body;

    // === 1. LOGIN USER ===
    if (action === "loginUser") {
      const [username, password] = args;
      let res;
      
      try {
        res = await turso.execute({
          sql: "SELECT * FROM Users WHERE Username = ? AND Password = ?",
          args: [username, password]
        });
      } catch (dbError) {
        // Menangkap error 400/401 Turso dan menampilkannya di frontend
        return NextResponse.json({ 
          status: "error", 
          msg: "Koneksi Database Gagal. Cek URL dan Token Turso Anda. Detail: " + dbError.message 
        });
      }
      
      if (res.rows.length > 0) {
        return NextResponse.json({ 
          status: "success", 
          data: res.rows[0], 
          logo: "https://lh3.googleusercontent.com/d/1OWPGumIzn-RRd3FfrMmYzPt6ZGOnNZpY" 
        });
      } else {
        return NextResponse.json({ status: "error", msg: "Username atau Password salah!" });
      }
    }

    // === 2. GET DASHBOARD DATA ===
    else if (action === "getDashboardData") {
      const [role, userId, userClass] = args;
      const cleanRole = String(role).trim().toLowerCase();

      const examsRes = await turso.execute("SELECT * FROM Exams");
      const usersRes = await turso.execute("SELECT * FROM Users WHERE Role = 'siswa'");
      
      let exams = examsRes.rows;
      let users = usersRes.rows;

      const output = { logo: "https://lh3.googleusercontent.com/d/1OWPGumIzn-RRd3FfrMmYzPt6ZGOnNZpY", guruAllowed: true };

      if (cleanRole === "guru") {
        exams = exams.filter(e => !e.PembuatID || String(e.PembuatID) === String(userId));
        if (userClass) {
          const kelasArr = String(userClass).split(',').map(k => k.trim().toLowerCase());
          users = users.filter(u => kelasArr.includes(String(u.Kelas).trim().toLowerCase()));
        }
      }

      if (cleanRole === "admin" || cleanRole === "guru") {
        output.stats = {
          totalSiswa: users.length,
          totalUjian: exams.length,
          activeUjian: exams.filter(e => e.Status === 'Aktif').length
        };
        output.exams = exams;
      } else if (cleanRole === "siswa") {
        const historyRes = await turso.execute({ 
            sql: "SELECT * FROM Results WHERE SiswaID = ?", 
            args: [userId] 
        });
        output.availableExams = exams.filter(e => e.Status === 'Aktif'); 
        output.history = historyRes.rows;
      }

      return NextResponse.json({ status: "success", data: output });
    }
    
    // === 3. FALLBACK UNTUK FUNGSI MENU LAINNYA ===
    else {
      // Mengembalikan response kosong sementara agar navigasi menu frontend tidak crash
      return NextResponse.json({ status: "success", msg: "Fungsi belum dikonfigurasi", data: [] });
    }
    
  } catch (error) {
    console.error("Kesalahan Server:", error);
    return NextResponse.json({ status: "error", msg: error.message }, { status: 500 });
  }
}
