import { NextResponse } from "next/server";
import { turso } from "@/lib/turso"; // Ubah menjadi "../../../lib/turso" jika Anda belum mengatur jsconfig.json alias

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, args } = body;

    let result = { status: "error", msg: "Aksi tidak dikenali sistem." };

    switch (action) {
      // ==========================================
      // 1. PROSES LOGIN
      // ==========================================
      case "loginUser": {
        const [username, password] = args;
        
        // Eksekusi query dengan parameter anti-SQL Injection
        const res = await turso.execute({
          sql: "SELECT * FROM Users WHERE Username = ? AND Password = ?",
          args: [username, password]
        });
        
        if (res.rows.length > 0) {
          const user = res.rows[0];
          result = { 
            status: "success", 
            data: user, 
            logo: "https://lh3.googleusercontent.com/d/1OWPGumIzn-RRd3FfrMmYzPt6ZGOnNZpY" // Logo dari Google Drive
          };
        } else {
          result = { status: "error", msg: "Username atau Password salah!" };
        }
        break;
      }

      // ==========================================
      // 2. MUAT DATA DASHBOARD
      // ==========================================
      case "getDashboardData": {
        const [role, userId, userClass] = args;
        const cleanRole = String(role).trim().toLowerCase();

        // Ambil data dasar
        const examsRes = await turso.execute("SELECT * FROM Exams");
        const usersRes = await turso.execute("SELECT * FROM Users WHERE Role = 'siswa'");
        
        let exams = examsRes.rows;
        let users = usersRes.rows;

        const output = { logo: "https://lh3.googleusercontent.com/d/1OWPGumIzn-RRd3FfrMmYzPt6ZGOnNZpY", guruAllowed: true };

        // Filter untuk Guru
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
          const now = new Date();
          
          // Ambil riwayat ujian siswa dari tabel Results
          const historyRes = await turso.execute({
            sql: "SELECT * FROM Results WHERE SiswaID = ?",
            args: [userId]
          });
          
          // Susun daftar ujian tersedia sesuai target kelas siswa
          output.availableExams = exams.filter(e => {
            const target = String(e.TargetKelas).trim();
            const targetArr = target.split(',').map(t => t.trim().toLowerCase());
            const uClass = String(userClass).trim().toLowerCase();
            
            if ((target.toLowerCase() !== 'all' && !targetArr.includes(uClass)) || e.Status !== 'Aktif') return false;
            
            if (e.StartDate && e.EndDate) {
              const startStr = String(e.StartDate).replace(' ', 'T');
              const endStr = String(e.EndDate).replace(' ', 'T');
              if (now < new Date(startStr) || now > new Date(endStr)) return false;
            }
            
            const timesTaken = historyRes.rows.filter(h => String(h.ExamID).trim() === String(e.ExamID).trim()).length;
            const limit = Number(e.LimitTries) || 1; // Sesuaikan dengan kolom LimitTries di Turso
            e.IsFinished = timesTaken >= limit;
            
            return true;
          });
          
          output.history = historyRes.rows.map(r => {
             const ex = exams.find(x => x.ExamID === r.ExamID);
             return {
                 ExamID: r.ExamID,
                 Judul: ex ? ex.Judul : '[Dihapus]',
                 WaktuSubmit: r.WaktuSubmit,
                 Nilai: (ex && ex.ShowStats === 'Yes') ? r.TotalNilai : "Disimpan"
             };
          });
        }

        result = { status: "success", data: output };
        break;
      }

      // ==========================================
      // 3. LOGIC LAIN (Tambahkan sesuai kebutuhan)
      // ==========================================
      case "getUserList": {
         const usersRes = await turso.execute("SELECT * FROM Users");
         result = { status: "success", data: usersRes.rows };
         break;
      }

    }

    return NextResponse.json(result);
    
  } catch (error) {
    console.error("Terjadi Kesalahan Server:", error);
    return NextResponse.json({ status: "error", msg: error.message }, { status: 500 });
  }
}
