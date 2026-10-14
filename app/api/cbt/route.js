import { NextResponse } from "next/server";
import { turso } from "@/lib/turso"; 

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, args } = body;

    // ==========================================
    // 1. PROSES LOGIN & AUTO-SETUP DATABASE
    // ==========================================
    if (action === "loginUser") {
      const [username, password] = args;
      
      try {
        // [AUTO-SETUP] 1. Buat tabel Users jika belum ada
        await turso.execute(`
          CREATE TABLE IF NOT EXISTS Users (
            ID TEXT PRIMARY KEY,
            Nama TEXT,
            Username TEXT UNIQUE,
            Password TEXT,
            Role TEXT,
            Sekolah TEXT,
            Kelas TEXT
          )
        `);

        // [AUTO-SETUP] 2. Buat akun Admin default jika database masih kosong
        const checkAdmin = await turso.execute({
          sql: "SELECT * FROM Users WHERE Username = ?",
          args: ["admin"]
        });
        
        if (checkAdmin.rows.length === 0) {
           await turso.execute({
              sql: "INSERT INTO Users (ID, Nama, Username, Password, Role, Sekolah, Kelas) VALUES (?, ?, ?, ?, ?, ?, ?)",
              args: ['U1', 'Administrator', 'admin', 'admin123', 'admin', 'MIN 1', '-']
           });
        }

        // Proses Login
        const res = await turso.execute({
          sql: "SELECT * FROM Users WHERE Username = ? AND Password = ?",
          args: [username, password]
        });
        
        if (res.rows.length > 0) {
          return NextResponse.json({ 
            status: "success", 
            data: res.rows[0], 
            logo: "https://lh3.googleusercontent.com/d/1OWPGumIzn-RRd3FfrMmYzPt6ZGOnNZpY" 
          });
        } else {
          return NextResponse.json({ status: "error", msg: "Username atau Password salah!" });
        }
        
      } catch (dbError) {
        return NextResponse.json({ 
          status: "error", 
          msg: "Gagal membaca Database: " + dbError.message 
        });
      }
    }

    // ==========================================
    // 2. MUAT DATA DASHBOARD
    // ==========================================
    else if (action === "getDashboardData") {
      const [role, userId, userClass] = args;
      const cleanRole = String(role).trim().toLowerCase();

      try {
        await turso.execute(`CREATE TABLE IF NOT EXISTS Exams (ExamID TEXT PRIMARY KEY, Judul TEXT, Mapel TEXT, TargetKelas TEXT, Durasi INTEGER, Status TEXT, Token TEXT, StartDate TEXT, EndDate TEXT, LimitTries INTEGER, ShowStats TEXT, RandomQ TEXT, PembuatID TEXT, MaxViolations INTEGER)`);
        await turso.execute(`CREATE TABLE IF NOT EXISTS Results (ResultID TEXT PRIMARY KEY, SiswaID TEXT, ExamID TEXT, TotalNilai REAL, Detail TEXT, Pelanggaran TEXT, WaktuSubmit DATETIME DEFAULT CURRENT_TIMESTAMP)`);

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
          output.stats = { totalSiswa: users.length, totalUjian: exams.length, activeUjian: exams.filter(e => e.Status === 'Aktif').length };
          output.exams = exams;
        } else if (cleanRole === "siswa") {
          const historyRes = await turso.execute({ sql: "SELECT * FROM Results WHERE SiswaID = ?", args: [userId] });
          output.availableExams = exams.filter(e => e.Status === 'Aktif'); 
          output.history = historyRes.rows;
        }

        return NextResponse.json({ status: "success", data: output });
      } catch (err) {
        return NextResponse.json({ status: "error", msg: "Dashboard Error: " + err.message });
      }
    }
    
    // ==========================================
    // 3. FUNGSI LAINNYA
    // ==========================================
    else if (action === "getUserList") {
        const usersRes = await turso.execute("SELECT * FROM Users");
        return NextResponse.json({ status: "success", data: usersRes.rows });
    }
    else {
      return NextResponse.json({ status: "success", msg: "Berhasil", data: [] });
    }
    
  } catch (error) {
    return NextResponse.json({ status: "error", msg: error.message }, { status: 500 });
  }
}
