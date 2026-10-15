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
    }

    // ==========================================
    // 2. MUAT DATA DASHBOARD
    // ==========================================
    else if (action === "getDashboardData") {
      const [role, userId, userClass] = args;
      const cleanRole = String(role).trim().toLowerCase();
      
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
    }

    // ==========================================
    // 3. KELOLA SISWA & USER
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
                await turso.execute({ sql: "UPDATE Users SET Nama=?, Username=?, Password=?, Role=?, Sekolah=?, Kelas=? WHERE ID=?", args: [data.nama, data.username, data.password, data.role, data.sekolah||'-', data.kelas||'-', id] });
            } else {
                await turso.execute({ sql: "INSERT INTO Users (ID, Nama, Username, Password, Role, Sekolah, Kelas) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [id, data.nama, data.username, data.password, data.role, data.sekolah||'-', data.kelas||'-'] });
            }
            return NextResponse.json({ status: "success", msg: "User berhasil disimpan!" });
        } else if (type === "delete") {
            await turso.execute({ sql: "DELETE FROM Users WHERE ID = ?", args: [data.id] });
            return NextResponse.json({ status: "success", msg: "User berhasil dihapus!" });
        }
    }
    else if (action === "adminBulkDeleteUsers") {
        const [ids] = args;
        const placeholders = ids.map(() => '?').join(',');
        await turso.execute({ sql: `DELETE FROM Users WHERE ID IN (${placeholders})`, args: ids });
        return NextResponse.json({ status: "success", msg: "User berhasil dihapus massal!" });
    }

    // ==========================================
    // 4. KELOLA JADWAL UJIAN
    // ==========================================
    else if (action === "adminSaveExam") {
        const [d] = args;
        const examId = d.examId || ('EX' + Date.now());
        const check = await turso.execute({ sql: "SELECT ExamID FROM Exams WHERE ExamID = ?", args: [examId] });
        if (check.rows.length > 0) {
            await turso.execute({ sql: "UPDATE Exams SET Judul=?, Mapel=?, TargetKelas=?, Durasi=?, Status=?, Token=?, StartDate=?, EndDate=?, LimitTries=?, ShowStats=?, RandomQ=?, MaxViolations=? WHERE ExamID=?", args: [d.judul, d.mapel, d.targetKelas, d.durasi, 'Aktif', d.token||'', d.start, d.end, d.limit||1, d.showStats||'No', d.randomQ||'Yes', d.maxViolations||3, examId] });
        } else {
            await turso.execute({ sql: "INSERT INTO Exams (ExamID, Judul, Mapel, TargetKelas, Durasi, Status, Token, StartDate, EndDate, LimitTries, ShowStats, RandomQ, PembuatID, MaxViolations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [examId, d.judul, d.mapel, d.targetKelas, d.durasi, 'Aktif', d.token||'', d.start, d.end, d.limit||1, d.showStats||'No', d.randomQ||'Yes', d.userId, d.maxViolations||3] });
        }
        return NextResponse.json({ status: "success", msg: "Jadwal Ujian disimpan!" });
    }
    else if (action === "adminDeleteExam") {
        const [id] = args;
        await turso.execute({ sql: "DELETE FROM Exams WHERE ExamID = ?", args: [id] });
        await turso.execute({ sql: "DELETE FROM Questions WHERE ExamID = ?", args: [id] });
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
            await turso.execute({ sql: "UPDATE Questions SET Tipe=?, Pertanyaan=?, Options=?, KeyAnswer=?, Skor=?, Nomor=? WHERE QID=?", args: [d.type, d.text, JSON.stringify(d.options), JSON.stringify(d.key), d.score, d.num, qid] });
        } else {
            await turso.execute({ sql: "INSERT INTO Questions (QID, ExamID, Tipe, Pertanyaan, Options, KeyAnswer, Skor, Nomor, PembuatID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [qid, eid, d.type, d.text, JSON.stringify(d.options), JSON.stringify(d.key), d.score, d.num, d.userId] });
        }
        return NextResponse.json({ status: "success", id: qid, msg: "Soal disimpan!" });
    }
    else if (action === "adminDeleteQuestion") {
        const [id] = args;
        await turso.execute({ sql: "DELETE FROM Questions WHERE QID = ?", args: [id] });
        return NextResponse.json({ status: "success", msg: "Soal dihapus!" });
    }
    else if (action === "adminBatchSaveQuestions") {
        const [eid, qArr, userId] = args;
        for (let q of qArr) {
            let newId = 'Q' + Date.now() + Math.floor(Math.random()*1000);
            await turso.execute({ sql: "INSERT INTO Questions (QID, ExamID, Tipe, Pertanyaan, Options, KeyAnswer, Skor, Nomor, PembuatID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [newId, eid, q.type, q.text, JSON.stringify(q.options), JSON.stringify(q.key), q.score, q.num, userId] });
        }
        return NextResponse.json({ status: "success", msg: `${qArr.length} Soal berhasil diupload!` });
    }

    // ==========================================
    // 6. HASIL, REKAP & MONITORING
    // ==========================================
    else if (action === "getRecapList") {
        const results = await turso.execute("SELECT Results.*, Users.Nama as NamaSiswa, Users.Kelas as KelasSiswa, Exams.Judul as JudulUjian, Exams.Mapel, Exams.PembuatID FROM Results LEFT JOIN Users ON Results.SiswaID = Users.ID LEFT JOIN Exams ON Results.ExamID = Exams.ExamID");
        return NextResponse.json({ status: "success", data: results.rows });
    }
    else if (action === "adminUpdateResult") {
        const [rid, score, detail] = args;
        await turso.execute({ sql: "UPDATE Results SET TotalNilai=?, Detail=? WHERE ResultID=?", args: [score, detail, rid] });
        return NextResponse.json({ status: "success", msg: "Nilai diperbarui!" });
    }
    else if (action === "adminKatrolMassal") {
        const [rids, addVal] = args;
        const placeholders = rids.map(() => '?').join(',');
        await turso.execute({ sql: `UPDATE Results SET TotalNilai = MIN(TotalNilai + ?, 100) WHERE ResultID IN (${placeholders})`, args: [addVal, ...rids] });
        return NextResponse.json({ status: "success", msg: "Katrol nilai massal berhasil!" });
    }
    else if (action === "adminDeleteResult") {
        const [rid] = args;
        await turso.execute({ sql: "DELETE FROM Results WHERE ResultID = ?", args: [rid] });
        return NextResponse.json({ status: "success", msg: "Hasil Dihapus!" });
    }
    else if (action === "adminBulkDeleteResult") {
        const [rids] = args;
        const placeholders = rids.map(() => '?').join(',');
        await turso.execute({ sql: `DELETE FROM Results WHERE ResultID IN (${placeholders})`, args: rids });
        return NextResponse.json({ status: "success", msg: "Hasil berhasil dihapus massal!" });
    }
    else if (action === "getAdminData") {
        const examsRes = await turso.execute("SELECT * FROM Exams");
        const usersRes = await turso.execute("SELECT * FROM Users WHERE Role = 'siswa'");
        return NextResponse.json({ status: "success", exams: examsRes.rows, users: usersRes.rows, logo: LOGO_URL });
    }
    
    // ==========================================
    // 7. FITUR UJIAN SISWA & PENILAIAN AKURAT
    // ==========================================
    else if (action === "getExamPack") {
        const [eid, uid] = args;
        const qRes = await turso.execute({ sql: "SELECT * FROM Questions WHERE ExamID = ?", args: [eid] });
        const examInfo = await turso.execute({ sql: "SELECT * FROM Exams WHERE ExamID = ?", args: [eid] });
        const eData = examInfo.rows[0];
        
        let questions = qRes.rows.map(q => ({ QID: q.QID, Tipe: q.Tipe, Pertanyaan: q.Pertanyaan, Options: q.Options, Nomor: q.Nomor, Extra: (q.Tipe === 'Menjodohkan') ? JSON.parse(q.KeyAnswer || "[]").sort(() => Math.random() - 0.5) : [] }));
        if(eData.RandomQ === 'Yes') questions.sort(() => Math.random() - 0.5);

        return NextResponse.json({ status: "success", data: questions, duration: eData.Durasi, judul: eData.Judul, token: eData.Token, maxViolations: eData.MaxViolations });
    }
    else if (action === "submitExam") {
        const [uid, eid, ansArr, violations] = args;
        const qRes = await turso.execute({ sql: "SELECT * FROM Questions WHERE ExamID = ?", args: [eid] });
        let totalScore = 0; let maxScore = 0; let detailLog = [];

        // PERBAIKAN FATAL PENILAIAN: 
        // Jangan hapus tag HTML (<img...>, dll) karena opsi bisa berupa gambar/rumus saja.
        // Cukup normalkan enter/tab/spasi agar string cocok persis 100%.
        const normalizeStr = (s) => {
            if (s === null || s === undefined) return '';
            return String(s).replace(/[\r\n\t]+/g, ' ').trim();
        };

        qRes.rows.forEach(q => {
            const userAns = ansArr.find(a => String(a.qid) === String(q.QID));
            const ansVal = userAns ? userAns.answer : '';
            
            // Parsing KeyAnswer dengan aman
            let rawKeys = q.KeyAnswer || q.Key || "[]";
            let keyArr = [];
            try { 
                let parsed = JSON.parse(rawKeys);
                keyArr = Array.isArray(parsed) ? parsed : [parsed];
            } catch(e) { keyArr = []; }

            const skorItem = Number(q.Skor || 10);
            let earned = 0;

            // Logika Penilaian Tepat Sasaran
            if (q.Tipe === 'PGS') {
                if (normalizeStr(ansVal) === normalizeStr(keyArr[0])) earned = skorItem;
            } 
            else if (q.Tipe === 'PGK') {
                if (Array.isArray(ansVal)) {
                    const cleanAns = ansVal.map(normalizeStr).sort();
                    const cleanKey = keyArr.map(normalizeStr).sort();
                    if (JSON.stringify(cleanAns) === JSON.stringify(cleanKey)) earned = skorItem;
                }
            } 
            else if (q.Tipe === 'PGKK' || q.Tipe === 'Menjodohkan') {
                let correctCount = 0;
                keyArr.forEach((k, idx) => { 
                    if (ansVal && Array.isArray(ansVal) && normalizeStr(ansVal[idx]) === normalizeStr(k)) {
                        correctCount++;
                    }
                });
                earned = keyArr.length > 0 ? (correctCount / keyArr.length) * skorItem : 0;
            } 
            else if (q.Tipe === 'Uraian') {
                earned = 0; // Uraian dikoreksi manual
            }

            maxScore += skorItem;
            totalScore += earned;
            detailLog.push({ i: q.Nomor, s: Number(earned.toFixed(2)), m: skorItem, t: q.Tipe, a: ansVal });
        });

        // Kalkulasi ke skala 100
        const finalScore = maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(2)) : 0;
        const rid = 'RES' + Date.now() + Math.floor(Math.random() * 1000);
        
        await turso.execute({ 
            sql: "INSERT INTO Results (ResultID, SiswaID, ExamID, TotalNilai, Detail, Pelanggaran) VALUES (?, ?, ?, ?, ?, ?)", 
            args: [rid, uid, eid, finalScore, JSON.stringify(detailLog), violations > 0 ? `Pelanggaran: ${violations}x` : '-'] 
        });
        
        return NextResponse.json({ status: "success", msg: "Jawaban tersimpan", data: { score: finalScore } });
    }
    else if (action === "autosaveAnswer" || action === "updateClientProgress") {
        return NextResponse.json({ status: "success" });
    }
    else if (action === "getLiveMonitoring") {
        return NextResponse.json({ status: "success", data: [] });
    }

    return NextResponse.json({ status: "error", msg: "Aksi tidak dikenali" });

  } catch (error) {
    return NextResponse.json({ status: "error", msg: error.message }, { status: 500 });
  }
}
