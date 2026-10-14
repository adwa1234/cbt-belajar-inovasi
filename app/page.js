"use client";

import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    // Mencegah eksekusi ganda di React
    if (typeof window === "undefined" || window.appInitialized) return;
    window.appInitialized = true;

    // =================================================================
    // 1. INJEKSI CSS & HTML SECARA NATIVE (MENCEGAH VERCEL CRASH)
    // =================================================================
    const injectCSS = (href) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    };

    injectCSS("https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap");
    injectCSS("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css");
    injectCSS("https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css");
    injectCSS("https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css");
    injectCSS("https://cdn.jsdelivr.net/npm/summernote@0.8.18/dist/summernote-lite.min.css");

    const appRoot = document.getElementById("cbt-root");
    if (appRoot) {
      appRoot.innerHTML = `
        <style>
          :root { --primary: #7e22ce; --secondary: #a855f7; --accent: #84cc16; --bg-body: #faf5ff; }
          body { font-family: 'Poppins', sans-serif; background-color: var(--bg-body); color: #1e293b; overflow-x: hidden; margin: 0; }
          body.exam-mode { overflow: hidden; user-select: none; }
          .hidden { display: none !important; }
          .q-content img, .opt-content img { max-width: 100% !important; height: auto !important; border-radius: 6px; margin: 5px 0; }
          
          .text-primary { color: var(--primary) !important; }
          .bg-primary { background-color: var(--primary) !important; color: white !important; }
          .btn-primary { background-color: var(--primary) !important; border-color: var(--primary) !important; color: white !important; }
          .btn-primary:hover { background-color: #6b21a8 !important; border-color: #6b21a8 !important; }
          .btn-outline-primary { color: var(--primary) !important; border-color: var(--primary) !important; }
          .btn-outline-primary:hover { background-color: var(--primary) !important; color: white !important; }
          .border-primary { border-color: var(--primary) !important; }
          .text-success { color: var(--accent) !important; }
          .bg-success { background-color: var(--accent) !important; color: white !important; }
          .btn-success { background-color: var(--accent) !important; border-color: var(--accent) !important; color: white !important; }
          .btn-success:hover { background-color: #65a30d !important; border-color: #65a30d !important; }
          .badge.bg-primary { background-color: var(--primary) !important; }
          .badge.bg-success { background-color: var(--accent) !important; }

          /* TAMPILAN LOGIN SPLIT KIRI KANAN */
          .auth-wrapper { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(126,34,206,0.95) 0%, rgba(132,204,22,0.95) 100%); padding: 20px; position: relative; }
          .auth-card-split { display: flex; background: white; border-radius: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); max-width: 900px; width: 100%; overflow: hidden; z-index: 2; margin-bottom: 20px; min-height: 400px; }
          .auth-left { flex: 1; background: linear-gradient(135deg, rgba(126,34,206,1) 0%, rgba(132,204,22,1) 100%); color: white; padding: 40px; display: flex; flex-direction: column; justify-content: center; }
          .auth-right { flex: 1; padding: 40px; display: flex; flex-direction: column; justify-content: center; background: white; }
          .auth-footer { text-align: center; color: rgba(255,255,255,0.9); font-size: 0.875rem; z-index: 3; width: 100%; font-weight: 600; }
          @media (max-width: 768px) { .auth-card-split { flex-direction: column; } .auth-left { padding: 30px; text-align: center; } .auth-left ul li { justify-content: center; } }
          .auth-left h2 { font-weight: 700; margin-bottom: 15px; }
          .auth-left p { font-size: 14px; opacity: 0.9; margin-bottom: 20px; line-height: 1.6; }
          .auth-left ul { list-style: none; padding: 0; margin: 0; }
          .auth-left ul li { margin-bottom: 15px; font-size: 14px; display: flex; align-items: center; gap: 12px; }

          .wrapper { display: flex; width: 100%; align-items: stretch; position: relative; }
          #sidebar { min-width: 260px; max-width: 260px; background: #3b0764; color: #fff; min-height: 100vh; position: fixed; z-index: 1050; transition: all 0.3s; left: 0; top: 0; }
          #sidebar.active { left: -260px; }
          #content { width: 100%; margin-left: 260px; padding: 20px; transition: all 0.3s; min-height: 100vh; display: flex; flex-direction: column; }
          #sidebar ul li a { padding: 15px 25px; display: block; color: #cbd5e1; text-decoration: none; border-left: 4px solid transparent; cursor: pointer; }
          #sidebar ul li a:hover, #sidebar ul li a.active { background: rgba(255,255,255,0.05); color: #fff; border-left-color: var(--accent); }
          @media (max-width: 768px) { #sidebar { left: -260px; } #sidebar.active { left: 0; } #content { margin-left: 0; padding: 15px; } .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1040; display: none; } .overlay.active { display: block; } }
          
          #view-exam { position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; z-index: 9999; background: #f8fafc; overflow: hidden; display: flex; flex-direction: column; }
          .exam-header { flex-shrink: 0; height: 60px; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
          .exam-container-split { flex-grow: 1; display: flex; gap: 20px; padding: 20px; overflow: hidden; }
          .q-main-area { flex: 3; background: white; border-radius: 12px; padding: 25px; display: flex; flex-direction: column; overflow-y: auto; height: 100%; }
          #q-slides-container { flex-grow: 1; overflow-y: auto; }
          .q-nav-area { flex: 1; background: white; border-radius: 12px; padding: 20px; overflow-y: auto; height: 100%; }
          @media (max-width: 768px) { .exam-container-split { flex-direction: column-reverse; padding: 10px; gap: 10px; } .q-nav-area { flex: none; height: auto; max-height: 150px; } }
          .q-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 8px; margin-top: 15px; }
          .q-nav-btn { aspect-ratio: 1; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; cursor: pointer; }
          .q-nav-btn.active-q { background: var(--secondary); color: white; }
          .q-nav-btn.answered { background: var(--accent); color: white; }
          .loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
          .spinner { width: 50px; height: 50px; border: 5px solid #e2e8f0; border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { 100% { transform: rotate(360deg); } }
          .match-container { position: relative; width: 100%; min-height: 300px; display: flex; justify-content: space-between; padding: 10px; user-select: none; }
          .match-col { width: 40%; display: flex; flex-direction: column; gap: 15px; z-index: 2; }
          .match-item { background: #fff; border: 2px solid #e2e8f0; padding: 10px 15px; border-radius: 8px; cursor: pointer; transition: all 0.2s; position: relative; }
          .match-item:hover { border-color: var(--secondary); }
          .match-item.selected { border-color: var(--primary); background: #eff6ff; }
          .match-item.matched { border-color: var(--accent); background: #f0fdf4; opacity: 0.8; }
          .match-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
          .tbl-pgkk th, .tbl-pgkk td { text-align: center; vertical-align: middle; }
          .tbl-pgkk td:first-child { text-align: left; }
          .swal2-container { z-index: 20000 !important; }
          .btn-loading { pointer-events: none; opacity: 0.8; }
          #q-slides-container .form-check-input { width: 1.8em !important; height: 1.8em !important; cursor: pointer; margin-top: 0 !important; }
          .clickable-opt { cursor: pointer; transition: all 0.2s ease-in-out; margin-bottom: 0; }
          .clickable-opt:hover { background-color: #f1f5f9 !important; border-color: var(--secondary) !important; }
          #content-area { flex: 1; }
        </style>

        <div id="loader" class="loader hidden"><div class="spinner"></div></div>
        <div id="sidebar-overlay" class="overlay" onclick="window.toggleSidebar()"></div>
        
        <!-- LAYAR LOGIN SPLIT KIRI-KANAN (ANTI RELOAD) -->
        <div id="view-auth" class="auth-wrapper">
            <div class="auth-card-split">
                <div class="auth-left">
                    <h2>CBT Belajar Inovasi</h2>
                    <p>Selamat datang di sistem Ujian Berbasis Komputer. Platform ini dirancang untuk memberikan pengalaman ujian yang interaktif, stabil, dan aman.</p>
                    <ul>
                        <li><i class="fas fa-bolt fs-5 text-warning"></i> Sinkronisasi Cepat & Real-Time</li>
                        <li><i class="fas fa-shield-alt fs-5 text-info"></i> Aman dari Kecurangan</li>
                        <li><i class="fas fa-mobile-alt fs-5 text-success"></i> Responsif di Semua Perangkat</li>
                    </ul>
                </div>
                <div class="auth-right">
                    <div class="text-center mb-4">
                        <img src="https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk" class="mb-3 rounded" width="100" alt="Logo">
                        <h4 class="fw-bold text-center text-primary">BELAJAR INOVASI</h4>
                        <p class="small text-muted mt-1">Aplikasi Ujian Berbasis Komputer</p>
                    </div>
                    <form id="frm-login" onsubmit="event.preventDefault(); window.handleLogin(); return false;">
                        <div class="form-floating mb-3"><input type="text" id="u-login" class="form-control" placeholder="User" required><label>Username</label></div>
                        <div class="form-floating mb-4 position-relative">
                            <input type="password" id="p-login" class="form-control" placeholder="Pass" required>
                            <label>Password</label>
                            <i class="fas fa-eye position-absolute top-50 end-0 translate-middle-y me-3 text-muted" id="togglePassword" style="cursor: pointer; z-index: 100; pointer-events: auto;" onclick="window.togglePwd()"></i>
                        </div>
                        <button type="submit" class="btn btn-primary w-100 py-2 fw-bold shadow-sm">MASUK SEKARANG</button>
                    </form>
                </div>
            </div>
            <div class="auth-footer">© 2026 BELAJAR INOVASI</div>
        </div>

        <div id="view-dashboard" class="hidden wrapper">
            <nav id="sidebar">
                <div class="sidebar-header d-flex align-items-center justify-content-between p-3 border-bottom border-secondary">
                    <div><h5 class="fw-bold mb-0 text-white">MENU UTAMA</h5><small class="text-white-50" id="user-role-disp"></small></div>
                </div>
                <ul class="list-unstyled components hidden" id="menu-admin">
                    <li><a onclick="window.loadPage('admin-home')" class="nav-link active"><i class="fas fa-home me-2"></i>Dashboard</a></li>
                    <li><a onclick="window.loadPage('admin-users')" class="nav-link"><i class="fas fa-users me-2"></i>Data Peserta</a></li>
                    <li><a onclick="window.loadPage('admin-ujian')" class="nav-link"><i class="fas fa-calendar me-2"></i>Bank Soal</a></li>
                    <li><a onclick="window.loadPage('hasil-rekap')" class="nav-link"><i class="fas fa-chart-bar me-2"></i>Hasil Nilai</a></li>
                    <li><a onclick="window.loadPage('guru-monitoring')" class="nav-link"><i class="fas fa-tv me-2"></i>Monitoring</a></li>
                    <li><a onclick="window.loadPage('admin-administrasi')" class="nav-link text-info"><i class="fas fa-print me-2"></i>Cetak Administrasi</a></li>
                    <li><a onclick="window.handleResetCache()" class="nav-link text-warning"><i class="fas fa-bolt me-2"></i>Reset Cache</a></li>
                </ul>
                <ul class="list-unstyled components hidden" id="menu-guru">
                    <li><a onclick="window.loadPage('admin-home')" class="nav-link active"><i class="fas fa-home me-2"></i>Dashboard</a></li>
                    <li><a onclick="window.loadPage('admin-users')" class="nav-link"><i class="fas fa-users me-2"></i>Data Peserta</a></li>
                    <li><a onclick="window.loadPage('admin-ujian')" class="nav-link"><i class="fas fa-file-alt me-2"></i>Bank Soal</a></li>
                    <li><a onclick="window.loadPage('hasil-rekap')" class="nav-link"><i class="fas fa-poll me-2"></i>Hasil Nilai</a></li>
                    <li><a onclick="window.loadPage('guru-monitoring')" class="nav-link"><i class="fas fa-desktop me-2"></i>Live Monitor</a></li>
                    <li><a onclick="window.loadPage('admin-administrasi')" class="nav-link text-info"><i class="fas fa-print me-2"></i>Cetak Administrasi</a></li>
                </ul>
                <ul class="list-unstyled components hidden" id="menu-siswa">
                    <li><a onclick="window.loadPage('siswa-home')" class="nav-link active"><i class="fas fa-pencil-alt me-2"></i>Ujian Saya</a></li>
                </ul>
                <div class="p-3 mt-auto border-top border-secondary position-absolute bottom-0 w-100">
                    <div class="mb-3 text-white small"><i class="fas fa-user-circle me-1"></i> <span id="u-name-disp" class="fw-bold">User</span></div>
                    <button onclick="window.handleLogout()" class="btn btn-danger btn-sm w-100">LOGOUT</button>
                </div>
            </nav>
            <div id="content">
                <nav class="navbar navbar-light bg-white rounded shadow-sm mb-4 p-2 d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center">
                        <button id="menuToggle" class="btn btn-light me-2 border" onclick="window.toggleSidebar()"><i class="fas fa-bars"></i></button>
                        <span class="navbar-brand mb-0 h1 fw-bold fs-5 text-primary" id="page-title">DASHBOARD</span>
                    </div>
                    <button class="btn btn-outline-primary btn-sm rounded-pill px-3" onclick="window.appRefresh()"><i class="fas fa-sync-alt"></i> Refresh</button>
                </nav>
                <div id="content-area"></div>
                <footer class="mt-4 text-center text-muted small pb-3 border-top pt-3">© 2026 BELAJAR INOVASI</footer>
            </div>
        </div>

        <div id="view-exam" class="hidden">
            <div class="exam-header">
                <div class="d-flex align-items-center">
                    <i class="fas fa-laptop-code me-2 fs-4 text-primary"></i>
                    <div class="d-none d-md-block"><h6 class="fw-bold m-0" id="do-exam-title">Judul Ujian</h6></div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-sm btn-outline-primary me-2 shadow-sm" onclick="window.refreshUjianSiswa()"><i class="fas fa-sync-alt me-1"></i>Refresh Soal</button>
                    <div class="badge bg-dark fs-6 p-2 font-monospace"><i class="fas fa-clock me-1"></i><span id="timer-disp">00:00</span></div>
                </div>
            </div>
            <div class="exam-container-split">
                <div class="q-main-area">
                    <div id="q-slides-container"></div>
                    <div class="d-flex justify-content-between mt-4 pt-3 border-top">
                        <button class="btn btn-outline-secondary px-3" id="btn-prev" onclick="window.navSlide(-1)"><i class="fas fa-chevron-left"></i> Prev</button>
                        <button class="btn btn-primary px-3" id="btn-next" onclick="window.navSlide(1)">Next <i class="fas fa-chevron-right"></i></button>
                        <button class="btn btn-success px-4" id="btn-finish" onclick="window.submitExamButton(false)"><i class="fas fa-check-circle me-1"></i> KIRIM JAWABAN</button>
                    </div>
                </div>
                <div class="q-nav-area shadow-sm">
                    <h6 class="fw-bold border-bottom pb-2 mb-2 small text-muted">NAVIGASI SOAL</h6>
                    <div id="nav-grid" class="q-grid"></div>
                </div>
            </div>
        </div>

        <!-- MODAL LAINNYA -->
        <div class="modal fade" id="modalExam" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white"><h5 class="modal-title">Konfigurasi Ujian</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body">
                        <form id="frm-exam" onsubmit="event.preventDefault(); window.saveExam(); return false;">
                            <input type="hidden" id="ex-id" name="examId">
                            <div class="mb-3"><label class="small fw-bold">Judul Ujian</label><input type="text" name="judul" id="ex-judul" class="form-control" required></div>
                            <div class="row g-3 mb-3">
                                <div class="col-md-6"><label class="small fw-bold">Mata Pelajaran</label><input type="text" name="mapel" id="ex-mapel" class="form-control" required></div>
                                <div class="col-md-6"><label class="small fw-bold">Durasi (Menit)</label><input type="number" name="durasi" id="ex-durasi" class="form-control" required></div>
                            </div>
                            <div class="row g-3 mb-3">
                                <div class="col-md-6"><label class="small fw-bold">Waktu Mulai</label><input type="datetime-local" name="start" id="ex-start" class="form-control" required></div>
                                <div class="col-md-6"><label class="small fw-bold">Waktu Selesai</label><input type="datetime-local" name="end" id="ex-end" class="form-control" required></div>
                            </div>
                            <div class="row g-3 mb-3">
                                <div class="col-md-3">
                                    <label class="small fw-bold">Target Kelas</label>
                                    <div id="kelas-container"></div>
                                </div>
                                <div class="col-md-3"><label class="small fw-bold">Batas Pelanggaran</label><input type="number" name="maxViolations" id="ex-violations" class="form-control" value="3" required></div>
                                <div class="col-md-3"><label class="small fw-bold">Limit Kerjakan</label><input type="number" name="limit" id="ex-limit" class="form-control" value="1"></div>
                                <div class="col-md-3"><label class="small fw-bold">Token (Opsional)</label><input type="text" name="token" id="ex-token" class="form-control"></div>
                            </div>
                            <div class="d-flex gap-4 mb-3">
                                <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="showStats" id="ex-showStats" value="Yes"><label class="small">Tampilkan Nilai</label></div>
                                <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="randomQ" id="ex-randomQ" value="Yes"><label class="small">Acak Soal</label></div>
                            </div>
                            <button type="submit" class="btn btn-primary w-100 fw-bold">SIMPAN JADWAL</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal fade" id="modalQ" tabindex="-1">
            <div class="modal-dialog modal-fullscreen">
                <div class="modal-content bg-light">
                    <div class="modal-header bg-white shadow-sm">
                        <h5 class="modal-title fw-bold text-primary">Editor Soal</h5>
                        <button class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4">
                        <div class="container" style="max-width:900px">
                            <div class="alert alert-info small mb-3">
                                <b>Tips Format Persamaan/LaTeX:</b> Anda bisa menggunakan tombol <b>Rumus</b> di editor untuk memasukkan persamaan matematika.
                            </div>
                            <div id="q-list-container"></div>
                            <div class="text-center mt-5 mb-5">
                                <button class="btn btn-lg btn-success rounded-pill px-5 shadow" onclick="window.addNewQuestionBlock()"><i class="fas fa-plus-circle me-2"></i> TAMBAH SOAL</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal fade" id="modalUser" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white"><h5 class="modal-title">User Editor</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body">
                        <form id="frm-user" onsubmit="event.preventDefault(); window.saveUser(); return false;">
                            <input type="hidden" id="mu-id">
                            <input type="text" id="mu-nama" class="form-control mb-2" placeholder="Nama Lengkap" required>
                            <input type="text" id="mu-user" class="form-control mb-2" placeholder="Username" required>
                            <input type="text" id="mu-pass" class="form-control mb-2" placeholder="Password" required>
                            <div class="row g-2 mb-2">
                                <div class="col"><select id="mu-role" class="form-select"><option value="siswa">Siswa</option><option value="guru">Guru</option><option value="admin">Admin</option></select></div>
                                <div class="col"><input type="text" id="mu-kelas" class="form-control" placeholder="Kelas"></div>
                            </div>
                            <input type="text" id="mu-sekolah" class="form-control mb-2" placeholder="Sekolah (Opsional)">
                            <button type="submit" class="btn btn-success w-100 mt-3">Simpan User</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal fade" id="modalKoreksi" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-info text-white"><h5 class="modal-title fw-bold"><i class="fas fa-edit me-2"></i>Koreksi Jawaban Siswa</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body bg-light" id="kor-body"></div>
                    <div class="modal-footer bg-white border-top">
                        <button class="btn btn-secondary px-4" data-bs-dismiss="modal">Tutup</button>
                        <button class="btn btn-success px-4 shadow-sm" id="btn-save-kor" onclick="window.saveKoreksi()">Simpan Perubahan</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal fade" id="modalKatrol" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning"><h5 class="modal-title">Katrol Nilai Massal</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label fw-bold">Tambahkan Nilai (+)</label>
                            <input type="number" id="katrol-value" class="form-control form-control-lg text-center" value="0">
                            <small class="text-muted mt-2 d-block">Nilai ini akan ditambahkan ke semua siswa yang sedang tampil di tabel filter saat ini.</small>
                        </div>
                        <button class="btn btn-primary w-100 fw-bold" onclick="window.applyKatrolMassal()">Terapkan Katrol Sekarang</button>
                    </div>
                </div>
            </div>
        </div>
      `;
    }

    // =================================================================
    // 2. PEMUATAN SCRIPT EKSTERNAL (SECARA BERURUTAN)
    // =================================================================
    const loadScript = (src) => new Promise((resolve) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = resolve;
      document.body.appendChild(s);
    });

    async function setupExternalLibraries() {
      try {
        await loadScript("https://code.jquery.com/jquery-3.6.0.min.js");
        await loadScript("https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js");
        await loadScript("https://cdn.jsdelivr.net/npm/sweetalert2@11");
        await loadScript("https://cdn.jsdelivr.net/npm/summernote@0.8.18/dist/summernote-lite.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/7.12.1/polyfill.min.js");
        await loadScript("https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js");
        
        // Panggil inisialisasi utama setelah library siap
        initMainLogic();
      } catch (err) {
        console.error("Gagal memuat library:", err);
      }
    }

    // =================================================================
    // 3. FUNGSI LOGIKA UTAMA APLIKASI
    // =================================================================
    function initMainLogic() {
      const $ = window.jQuery;
      const LOGO_BARU = window.LOGO_BARU;

      // PROXY API: PENGGANTI GOOGLE.SCRIPT.RUN
      window.google = {
        script: {
          get run() {
            const runner = {
              successFn: null,
              failureFn: null,
              withSuccessHandler: function (fn) { this.successFn = fn; return this; },
              withFailureHandler: function (fn) { this.failureFn = fn; return this; }
            };

            return new Proxy(runner, {
              get: function (target, prop) {
                if (prop in target) return target[prop];
                
                return function (...args) {
                  fetch("/api/cbt", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: prop, args: args }),
                  })
                  .then(async (r) => {
                     if (!r.ok) throw new Error(await r.text());
                     return r.json();
                  })
                  .then((res) => { 
                      if (target.successFn) target.successFn(res); 
                  })
                  .catch((err) => { 
                      console.error("API Fetch Error:", err);
                      if (window.showLoad) window.showLoad(false); 
                      if (target.failureFn) target.failureFn(err); 
                      else if (window.Swal) window.Swal.fire("Koneksi Error", err.message, "error");
                  });
                };
              }
            });
          }
        }
      };

      // FUNGSI RENDER HALAMAN
      window.renderContent = function(page) {
          try {
              const area = $('#content-area'); let h = '';
              
              if (page === 'admin-home') {
                  const tSiswa = window.gData?.stats?.totalSiswa || 0;
                  const tUjian = window.gData?.stats?.totalUjian || 0;
                  h = `<div class="row g-4"><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-primary"><h3>${tSiswa}</h3><small>Siswa di Kelas Anda</small></div></div><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-success"><h3>${tUjian}</h3><small>Total Ujian</small></div></div></div>`;
              }
              else if (page === 'admin-ujian') {
                  let exams = window.gData?.exams || [];
                  let uniqueMapel = [...new Set(exams.map(e => e.Mapel))];
                  let uniqueKelas = [...new Set(exams.map(e => String(e.TargetKelas).trim()))];
                  
                  h = `<div class="d-flex justify-content-between mb-3"><button class="btn btn-primary shadow-sm" onclick="window.openExamModal()">+ Buat Jadwal Baru</button>
                       <div class="d-flex gap-2">
                          <select id="filter-mapel-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Mapel</option>${uniqueMapel.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
                          <select id="filter-kelas-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Kelas</option>${uniqueKelas.map(k=>`<option value="${k}">${k}</option>`).join('')}</select>
                       </div></div><div class="row g-4" id="admin-ujian-list">`;
                  
                  exams.forEach(e => {
                      const isOwner = (String(window.user.Role).trim().toLowerCase() === 'admin' || String(e.PembuatID) === String(window.user.ID));
                      const actionButtons = isOwner ? `<button class="btn btn-sm btn-outline-dark flex-fill" onclick="window.openExamModal('${encodeURIComponent(JSON.stringify(e))}')">Edit</button> <button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.manageQ('${e.ExamID}')"><i class="fas fa-list me-1"></i> Soal</button> <button class="btn btn-sm btn-danger" onclick="window.delExam('${e.ExamID}')"><i class="fas fa-trash"></i></button>` : `<div class="alert alert-light small m-0 p-1 text-center w-100">Read Only</div>`;
                      h += `<div class="col-md-6 col-lg-4 ujian-card" data-mapel="${e.Mapel}" data-kelas="${e.TargetKelas}"><div class="card h-100 shadow-sm border-0"><div class="card-body"><div class="d-flex justify-content-between mb-2"><span class="badge bg-primary">${e.Mapel}</span><span class="badge bg-light text-dark border">${e.TargetKelas}</span></div><h5 class="fw-bold text-dark">${e.Judul}</h5><div class="d-flex gap-2">${actionButtons}</div></div></div></div>`;
                  });
                  h += '</div>';
              }
              else if (page === 'siswa-home') {
                  let availExams = window.gData?.availableExams || [];
                  let historyData = window.gData?.history || [];
                  
                  h = `<div class="card mb-4 border-0 shadow-sm bg-primary text-white"><div class="card-body"><h5 class="fw-bold">Halo, ${window.user.Nama}</h5></div></div><h5 class="fw-bold mb-3 border-bottom pb-2 text-primary">Ujian Aktif</h5><div class="row g-4 mb-5">`;
                  if(availExams.length === 0) { h += '<div class="col-12"><div class="alert alert-info text-center">Tidak ada ujian aktif saat ini.</div></div>'; } 
                  else {
                      availExams.forEach(e => {
                          let btnState = '', btnText = 'MULAI UJIAN', btnClass = 'btn-primary';
                          if (e.IsFinished) { btnState = 'disabled'; btnText = 'SUDAH DIKERJAKAN / BATAS HABIS'; btnClass = 'btn-secondary'; }
                          else if (e.IsExpired) { btnState = 'disabled'; btnText = 'WAKTU HABIS'; btnClass = 'btn-danger'; }
                          h += `<div class="col-md-6 col-lg-4"><div class="card h-100 shadow-sm border-0"><div class="card-body"><h5 class="fw-bold text-primary">${e.Judul}</h5><div class="mb-2"><span class="badge bg-primary">${e.Mapel}</span> <span class="badge bg-light text-dark border">${e.Durasi} Menit</span></div><button class="btn ${btnClass} w-100 fw-bold shadow-sm" onclick="window.startExam('${e.ExamID}')" ${btnState}>${btnText}</button></div></div></div>`;
                      });
                  }
                  h += '</div><h5 class="fw-bold mb-3 border-bottom pb-2 mt-4 text-primary"><i class="fas fa-history me-2"></i>Riwayat</h5>';
                  if(historyData.length === 0) { h += '<p class="text-muted fst-italic">Belum ada riwayat.</p>'; } 
                  else {
                      h += `<div class="table-responsive bg-white rounded shadow-sm p-3"><table class="table table-hover align-middle mb-0"><thead><tr class="table-light"><th>Tanggal</th><th>Ujian</th><th>Nilai</th><th>Status</th></tr></thead><tbody>`;
                      historyData.forEach(r => { h += `<tr><td>${r.WaktuSubmit}</td><td><div class="fw-bold">${r.Judul}</div></td><td><span class="badge bg-warning text-dark">${r.Nilai}</span></td><td><span class="badge bg-success">Selesai</span></td></tr>`; });
                      h += `</tbody></table></div>`;
                  }
              }
              if($) area.html(h);
          } catch (err) {
              console.error("Render Content Error: ", err);
              if($) $('#content-area').html(`<div class="alert alert-danger">Sistem sedang memproses data... Harap muat ulang halaman.</div>`);
          }
      };

      // INIT AUTO-LOGIN JIKA ADA SESSION
      const savedUser = localStorage.getItem('cbt_user');
      if(savedUser) {
          window.user = JSON.parse(savedUser);
          const logoEl = document.querySelector('#logo-container img');
          if (logoEl) logoEl.src = window.user.LogoUrl || LOGO_BARU;
          window.initDash();
          window.checkResumeExam();
      } else {
          // Jika belum login, pastikan loading mati
          window.showLoad(false);
      }
    }

    // Mulai proses
    setupExternalLibraries();

  }, []);

  // Tampilkan layar loading polos sementara Client menginjeksikan HTML agar Vercel tidak bingung
  if (!isMounted) return <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f1f5f9' }} />;

  return (
    <div id="cbt-root">
      {/* HTML AKAN DI-INJEKSI OLEH JAVASCRIPT NATIVE UNTUK MENGHINDARI VERCEL CRASH */}
    </div>
  );
}
