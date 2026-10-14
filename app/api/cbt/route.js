import { NextResponse } from "next/server";
import { turso } from "@/lib/turso"; 

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, args } = body;
    const LOGO_URL = "https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk";

    // ==========================================
    // 1. PROSES LOGIN & AUTO-SETUP DATABASE
    // ==========================================
    if (action === "loginUser") {
      const [username, password] = args;
      try {
        await turso.execute(`CREATE TABLE IF NOT EXISTS Users (ID TEXT PRIMARY KEY, Nama TEXT, Username TEXT UNIQUE, Password TEXT, Role TEXT, Sekolah TEXT, Kelas TEXT)`);
        const checkAdmin = await turso.execute({ sql: "SELECT * FROM Users WHERE Username = ?", args: ["admin"] });
        
        if (checkAdmin.rows.length === 0) {
           await turso.execute({
              sql: "INSERT INTO Users (ID, Nama, Username, Password, Role, Sekolah, Kelas) VALUES (?, ?, ?, ?, ?, ?, ?)",
              args: ['U1', 'Administrator', 'admin', 'admin123', 'admin', 'Belajar Inovasi', '-']
           });
        }
        const res = await turso.execute({ sql: "SELECT * FROM Users WHERE Username = ? AND Password = ?", args: [username, password] });
        if (res.rows.length > 0) {
          return NextResponse.json({ status: "success", data: res.rows[0], logo: LOGO_URL });
        } else {
          return NextResponse.json({ status: "error", msg: "Username atau Password salah!" });
        }
      } catch (dbError) {
        return NextResponse.json({ status: "error", msg: "Database Error: " + dbError.message });
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
        
        let exams = examsRes.rows; let users = usersRes.rows;
        const output = { logo: LOGO_URL, guruAllowed: true };

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
    // 3. KELOLA SISWA (TAMBAH/EDIT/HAPUS)
    // ==========================================
    else if (action === "getUserList") {
        const usersRes = await turso.execute("SELECT * FROM Users");
        return NextResponse.json({ status: "success", data: usersRes.rows });
    }
    else if (action === "adminManageUser") {
        const [type, data] = args;
        if (type === "save") {
            const id = data.id || ('S' + Date.now());
            const check = await turso.execute({ sql: "SELECT ID FROM Users WHERE ID = ?", args: [id] });
            if (check.rows.length > 0) {
                await turso.execute({
                    sql: "UPDATE Users SET Nama=?, Username=?, Password=?, Role=?, Sekolah=?, Kelas=? WHERE ID=?",
                    args: [data.nama, data.username, data.password, data.role, data.sekolah||'-', data.kelas||'-', id]
                });
            } else {
                await turso.execute({
                    sql: "INSERT INTO Users (ID, Nama, Username, Password, Role, Sekolah, Kelas) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    args: [id, data.nama, data.username, data.password, data.role, data.sekolah||'-', data.kelas||'-']
                });
            }
            return NextResponse.json({ status: "success", msg: "User berhasil disimpan!" });
        } else if (type === "delete") {
            await turso.execute({ sql: "DELETE FROM Users WHERE ID = ?", args: [data.id] });
            return NextResponse.json({ status: "success", msg: "User berhasil dihapus!" });
        }
    }

    // ==========================================
    // 4. KELOLA JADWAL UJIAN
    // ==========================================
    else if (action === "adminSaveExam") {
        const [d] = args;
        const examId = d.examId || ('EX' + Date.now());
        const check = await turso.execute({ sql: "SELECT ExamID FROM Exams WHERE ExamID = ?", args: [examId] });
        if (check.rows.length > 0) {
            await turso.execute({
                sql: "UPDATE Exams SET Judul=?, Mapel=?, TargetKelas=?, Durasi=?, Status=?, Token=?, StartDate=?, EndDate=?, LimitTries=?, ShowStats=?, RandomQ=?, MaxViolations=? WHERE ExamID=?",
                args: [d.judul, d.mapel, d.targetKelas, d.durasi, 'Aktif', d.token||'', d.start, d.end, d.limit||1, d.showStats||'No', d.randomQ||'Yes', d.maxViolations||3, examId]
            });
        } else {
            await turso.execute({
                sql: "INSERT INTO Exams (ExamID, Judul, Mapel, TargetKelas, Durasi, Status, Token, StartDate, EndDate, LimitTries, ShowStats, RandomQ, PembuatID, MaxViolations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                args: [examId, d.judul, d.mapel, d.targetKelas, d.durasi, 'Aktif', d.token||'', d.start, d.end, d.limit||1, d.showStats||'No', d.randomQ||'Yes', d.userId, d.maxViolations||3]
            });
        }
        return NextResponse.json({ status: "success", msg: "Jadwal Ujian disimpan!" });
    }
    else if (action === "adminDeleteExam") {
        const [id] = args;
        await turso.execute({ sql: "DELETE FROM Exams WHERE ExamID = ?", args: [id] });
        return NextResponse.json({ status: "success", msg: "Jadwal dihapus!" });
    }

    // ==========================================
    // 5. KELOLA SOAL UJIAN
    // ==========================================
    else if (action === "getExamQuestions") {
        await turso.execute(`CREATE TABLE IF NOT EXISTS Questions (QID TEXT PRIMARY KEY, ExamID TEXT, Tipe TEXT, Pertanyaan TEXT, Options TEXT, KeyAnswer TEXT, Skor REAL, Nomor INTEGER, PembuatID TEXT)`);
        const [eid] = args;
        const qRes = await turso.execute({ sql: "SELECT * FROM Questions WHERE ExamID = ?", args: [eid] });
        return NextResponse.json(qRes.rows);
    }
    else if (action === "adminSaveSingleQuestion") {
        const [eid, d] = args;
        const qid = d.id || ('Q' + Date.now());
        const check = await turso.execute({ sql: "SELECT QID FROM Questions WHERE QID = ?", args: [qid] });
        if (check.rows.length > 0) {
            await turso.execute({
                sql: "UPDATE Questions SET Tipe=?, Pertanyaan=?, Options=?, KeyAnswer=?, Skor=?, Nomor=? WHERE QID=?",
                args: [d.type, d.text, JSON.stringify(d.options), JSON.stringify(d.key), d.score, d.num, qid]
            });
        } else {
            await turso.execute({
                sql: "INSERT INTO Questions (QID, ExamID, Tipe, Pertanyaan, Options, KeyAnswer, Skor, Nomor, PembuatID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                args: [qid, eid, d.type, d.text, JSON.stringify(d.options), JSON.stringify(d.key), d.score, d.num, d.userId]
            });
        }
        return NextResponse.json({ status: "success", id: qid, msg: "Soal disimpan!" });
    }
    else if (action === "adminDeleteQuestion") {
        const [id] = args;
        await turso.execute({ sql: "DELETE FROM Questions WHERE QID = ?", args: [id] });
        return NextResponse.json({ status: "success", msg: "Soal dihapus!" });
    }
    
    // ==========================================
    // 6. CETAK ADMINISTRASI & DEFAULT FALLBACK
    // ==========================================
    else if (action === "getAdminData") {
        const examsRes = await turso.execute("SELECT * FROM Exams");
        const usersRes = await turso.execute("SELECT * FROM Users WHERE Role = 'siswa'");
        return NextResponse.json({ status: "success", exams: examsRes.rows, users: usersRes.rows, logo: LOGO_URL });
    }
    else {
      return NextResponse.json({ status: "success", msg: "Berhasil diabaikan sementara", data: [] });
    }
    
  } catch (error) {
    return NextResponse.json({ status: "error", msg: error.message }, { status: 500 });
  }
}
