"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export default function Page() {
  const [isMounted, setIsMounted] = useState(false);

  // Mencegah Vercel Crash (Hydration Mismatch)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    if (typeof window === "undefined" || window.appInitialized) return;
    window.appInitialized = true;

    // =================================================================
    // 1. DEKLARASI STATE GLOBAL
    // =================================================================
    window.LOGO_BARU = "https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk";
    window.examSubmitting = false;
    window.user = null;
    window.gData = {};
    window.gAdminData = { exams: [], users: [] };
    window.activeExamId = null;
    window.activeExamViolations = 3;
    window.totalQ = 0;
    window.currentQuestionsData = [];
    window.currentQIdx = 0;
    window.recapAllData = [];
    window.recapDataStore = {};
    window.violationCount = 0;
    window.isExamFinished = false;
    window.violationLock = false;
    window.matchState = {};

    let audioCtx = null;
    try { window.AudioContext = window.AudioContext || window.webkitAudioContext; audioCtx = new AudioContext(); } catch(e) {}
    let finalBeepOsc = null;
    let beepInterval = null;

    // =================================================================
    // 2. FUNGSI INISIALISASI (MENUNGGU SCRIPT SIAP)
    // =================================================================
    const initApp = () => {
      if (!window.jQuery || !window.Swal || !window.XLSX) {
        setTimeout(initApp, 100);
        return;
      }

      const $ = window.jQuery;

      // =================================================================
      // 3. FUNGSI AUDIO ALARM (PELANGGARAN UJIAN)
      // =================================================================
      window.playBeep = function(times, continuous = false) {
          if(!audioCtx) return;
          if(audioCtx.state === 'suspended') audioCtx.resume();
          
          if (continuous) {
              finalBeepOsc = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              finalBeepOsc.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              finalBeepOsc.type = 'square';
              finalBeepOsc.frequency.value = 800;
              gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
              finalBeepOsc.start();
              return;
          }
          let count = 0;
          function beep() {
              if (count >= times) return;
              const oscillator = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              oscillator.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              oscillator.type = 'square';
              oscillator.frequency.value = 800;
              gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
              oscillator.start(audioCtx.currentTime);
              oscillator.stop(audioCtx.currentTime + 0.3);
              count++;
              setTimeout(beep, 600);
          }
          beep();
      };

      window.stopContinuousBeep = function() {
          if (finalBeepOsc) { try { finalBeepOsc.stop(); finalBeepOsc.disconnect(); } catch(e){} finalBeepOsc = null; }
          if (beepInterval) { clearTimeout(beepInterval); beepInterval = null; }
      };

      // =================================================================
      // 4. FUNGSI NATIVE UI & MANAJEMEN MODAL/CACHE
      // =================================================================
      window.showLoad = function(show) {
          const loader = document.getElementById('loader');
          if (loader) {
              if (show) loader.classList.remove('hidden');
              else loader.classList.add('hidden');
          }
      };

            // PERBAIKAN: Reset Cache tanpa reload layar penuh, tetap di halaman akun saat ini
      window.handleResetCache = function() {
          window.Swal.fire({
              title: 'Sinkronisasi & Reset Cache?',
              text: 'Sistem akan membersihkan memori sementara untuk memperbarui data CBT tanpa perlu logout.',
              icon: 'info',
              showCancelButton: true,
              confirmButtonColor: '#3085d6',
              confirmButtonText: 'Ya, Sinkronkan!'
          }).then((r) => {
              if (r.isConfirmed) {
                  window.showLoad(true);
                  
                  // Ambil halaman aktif saat ini sebelum cache dibersihkan
                  const activeLink = document.querySelector('.nav-link.active');
                  let currentPage = 'admin-home';
                  if (activeLink) {
                      const match = activeLink.getAttribute('onclick').match(/'([^']+)'/);
                      if (match && match[1]) currentPage = match[1];
                  }

                  const savedUser = localStorage.getItem('cbt_user');
                  localStorage.clear();
                  sessionStorage.clear();
                  if(savedUser) localStorage.setItem('cbt_user', savedUser);
                  localStorage.setItem('cbt_app_version', 'v23_final_fix');
                  
                  // Render ulang halaman saat ini untuk mengambil data baru dari database
                  window.toast('success', 'Cache dibersihkan. Memuat ulang data...');
                  setTimeout(() => { window.loadPage(currentPage); }, 500);
              }
          });
      };

      // PERBAIKAN: Manajemen Modal Diperbarui agar Form Berfungsi Normal
      // PERBAIKAN: Memastikan popup (modal) muncul dengan benar dan tombol bisa diklik
      window.openModal = function(id) {
          const el = document.getElementById(id);
          if (!el) return;
          if (window.bootstrap) {
              window.bootstrap.Modal.getOrCreateInstance(el).show();
          } else if (window.jQuery) {
              window.jQuery(el).modal('show');
          }
          setTimeout(() => {
              el.style.zIndex = '10505';
              document.querySelectorAll('.modal-backdrop').forEach(b => { b.style.zIndex = '10500'; });
          }, 100);
      };

      window.closeModal = function(id) {
          const el = document.getElementById(id);
          if (!el) return;
          if (window.bootstrap) {
              const modalInstance = window.bootstrap.Modal.getInstance(el);
              if(modalInstance) modalInstance.hide();
          } else if (window.jQuery) {
              window.jQuery(el).modal('hide');
          }
          setTimeout(() => {
              document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
              document.body.classList.remove('modal-open');
              document.body.style.overflow = '';
              document.body.style.paddingRight = '';
          }, 250);
      };

      window.togglePwd = function() {
          const p = document.getElementById('p-login');
          const icon = document.getElementById('togglePassword');
          if (!p || !icon) return;
          if (p.type === 'password') {
              p.type = 'text'; icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash');
          } else {
              p.type = 'password'; icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye');
          }
      };

      window.toggleSidebar = function() { 
          $('#sidebar').toggleClass('active'); 
          $('#sidebar-overlay').toggleClass('active');
      };

      window.toast = function(icon, title) { 
          window.Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000}).fire({icon: icon, title: title}); 
      };

      // =================================================================
      // 5. PROXY API TURSO (DIJAMIN STABIL)
      // =================================================================
      window.google = {
        script: {
          get run() {
            const runner = { successFn: null, failureFn: null };
            const proxy = new Proxy(runner, {
              get: function (target, prop) {
                if (prop === "withSuccessHandler") { return function (fn) { target.successFn = fn; return proxy; }; }
                if (prop === "withFailureHandler") { return function (fn) { target.failureFn = fn; return proxy; }; }
                if (prop === 'then' || prop === 'catch' || prop === 'finally' || typeof prop === 'symbol') { return target[prop]; }

                return function (...args) {
                  fetch("/api/cbt", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: prop, args: args }),
                  })
                  .then(async (r) => {
                     if (!r.ok) throw new Error(await r.text());
                     return r.json();
                  })
                  .then((res) => { if (target.successFn) target.successFn(res); })
                  .catch((err) => { 
                      console.error("API Fetch Error:", err);
                      if (target.failureFn) target.failureFn(err); 
                      else window.Swal.fire("Koneksi Error", err.message, "error");
                  });
                };
              }
            });
            return proxy;
          }
        }
      };

      // =================================================================
      // 6. LOGIKA HALAMAN, LOGIN & MENU
      // =================================================================
      window.handleLogin = async function() {
          const u = document.getElementById('u-login').value;
          const p = document.getElementById('p-login').value;
          
          if (!u || !p) { window.Swal.fire('Perhatian', 'Username dan Password wajib diisi!', 'warning'); return; }

          const btn = document.querySelector('#frm-login button');
          const origText = btn.innerHTML;
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> MEMPROSES...';

          try {
              const res = await fetch("/api/cbt", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "loginUser", args: [u, p] })
              });

              if (!res.ok) throw new Error(await res.text());
              const data = await res.json();
              
              btn.disabled = false;
              btn.innerHTML = origText;

              if (data.status === 'success') {
                  window.user = data.data; window.user.LogoUrl = window.LOGO_BARU;
                  localStorage.setItem('cbt_user', JSON.stringify(window.user));
                  const logoEl = document.querySelector('#logo-container img'); if(logoEl) logoEl.src = window.LOGO_BARU;
                  window.initDash();
              } else {
                  window.Swal.fire('Gagal Login', data.msg, 'error');
              }
          } catch (err) {
              btn.disabled = false;
              btn.innerHTML = origText;
              window.Swal.fire('Koneksi Gagal', 'Detail: ' + err.message, 'error');
          }
      };

      window.initDash = function() {
          if(window.showLoad) window.showLoad(false); 
          if(!window.user) return;
          
          const viewAuth = document.getElementById('view-auth');
          const viewDash = document.getElementById('view-dashboard');
          if(viewAuth) { viewAuth.classList.add('hidden'); viewAuth.style.display = 'none'; }
          if(viewDash) { viewDash.classList.remove('hidden'); viewDash.style.display = 'flex'; }
          
          const elName = document.getElementById('u-name-disp');
          if(elName) elName.innerText = window.user.Nama;
          
          const role = String(window.user.Role || '').trim().toLowerCase(); 
          const elRole = document.getElementById('user-role-disp');
          if(elRole) elRole.innerText = role.toUpperCase();
          
          const menuAdmin = document.getElementById('menu-admin');
          const menuGuru = document.getElementById('menu-guru');
          const menuSiswa = document.getElementById('menu-siswa');
          
          if(menuAdmin) { menuAdmin.style.display = 'none'; menuAdmin.classList.add('hidden'); }
          if(menuGuru) { menuGuru.style.display = 'none'; menuGuru.classList.add('hidden'); }
          if(menuSiswa) { menuSiswa.style.display = 'none'; menuSiswa.classList.add('hidden'); }
          
          if(role === 'siswa') { 
              if(menuSiswa) { menuSiswa.style.display = 'block'; menuSiswa.classList.remove('hidden'); }
              window.loadPage('siswa-home'); 
          } 
          else if(role === 'guru') { 
              if(menuGuru) { menuGuru.style.display = 'block'; menuGuru.classList.remove('hidden'); }
              window.loadPage('admin-home'); 
          } 
          else if(role === 'admin') { 
              if(menuAdmin) { menuAdmin.style.display = 'block'; menuAdmin.classList.remove('hidden'); }
              window.loadPage('admin-home'); 
          } else {
              window.Swal.fire('Error Role', 'Role user tidak valid!', 'error');
          }
      };

      window.appRefresh = function() {
          const activeLink = document.querySelector('.nav-link.active');
          if (activeLink) {
              const onclickAttr = activeLink.getAttribute('onclick');
              if(onclickAttr) { const match = onclickAttr.match(/'([^']+)'/); if(match && match[1]) window.loadPage(match[1]); }
          } else { window.loadPage('admin-home'); }
      };

      window.loadPage = function(page) {
          clearInterval(window.timerInt); clearInterval(window.monitorInterval); clearInterval(window.autosaveInterval); 
          if(window.disableSecurity) window.disableSecurity(); if(window.stopContinuousBeep) window.stopContinuousBeep();
          
          $('#view-exam').addClass('hidden'); 
          $('#view-dashboard').removeClass('hidden');
          $('body').removeClass('exam-mode');
          
          const titleEl = document.getElementById('page-title'); 
          if(titleEl) titleEl.innerText = page.replace('-', ' ').toUpperCase();
          
          $('.nav-link').removeClass('active'); 
          $(`a[onclick="window.loadPage('${page}')"]`).addClass('active');
          
          if(window.innerWidth <= 768) { $('#sidebar').removeClass('active'); $('#sidebar-overlay').removeClass('active'); }
          
          const area = document.getElementById('content-area');
          if(area) {
              area.innerHTML = `
                  <div class="d-flex flex-column justify-content-center align-items-center" style="min-height: 50vh;">
                      <div class="spinner-border text-primary" style="width: 3.5rem; height: 3.5rem;" role="status"></div>
                      <h5 class="mt-3 text-muted fw-bold">Memuat Data...</h5>
                  </div>
              `;
          }

          if(page === 'admin-users') {
              window.google.script.run.withSuccessHandler(r => {
                  if(r.status === 'success') window.renderUsers(r.data); 
                  else window.Swal.fire('Error', r.msg, 'error');
              }).withFailureHandler(e => { window.Swal.fire('Error', e.message, 'error'); }).getUserList(window.user.Role, window.user.ID, window.user.Kelas);
              return;
          }
          if(page === 'hasil-rekap') {
              window.google.script.run.withSuccessHandler(r => {
                  if(r.status === 'success') { window.recapAllData = r.data; window.renderRecapTable(); }
                  else { if(area) area.innerHTML = `<div class="alert alert-danger">${r.msg}</div>`; }
              }).withFailureHandler(e => { window.Swal.fire('Error', e.message, 'error'); }).getRecapList(window.user.Role, window.user.ID, window.user.Kelas);
              return;
          }
          if(page === 'guru-monitoring') { window.renderMonitoring(); return; }
          if(page === 'admin-administrasi') {
              window.google.script.run.withSuccessHandler(r => {
                  if(r.status === 'success') { window.gAdminData = r; window.renderAdministrasi(); } 
                  else window.Swal.fire('Error', r.msg, 'error');
              }).withFailureHandler(e => { window.Swal.fire('Error', e.message, 'error'); }).getAdminData(window.user.Role, window.user.ID, window.user.Kelas);
              return;
          }
          
          window.google.script.run.withSuccessHandler(res => {
              if (res.status === 'success') { window.gData = res.data; window.renderContent(page); if(window.applyMathJax) window.applyMathJax(); } 
              else window.Swal.fire('Error', res.msg, 'error');
          }).withFailureHandler(e => { window.Swal.fire('Error', e.message || 'Gagal memuat dashboard', 'error'); }).getDashboardData(window.user.Role, window.user.ID, window.user.Kelas);
      };

      window.handleLogout = function() {
          const executeLogout = () => {
              if(window.stopContinuousBeep) window.stopContinuousBeep();
              localStorage.removeItem('cbt_user'); localStorage.removeItem('cbt_active_exam'); window.user = null;
              clearInterval(window.timerInt); clearInterval(window.monitorInterval); clearInterval(window.autosaveInterval); window.activeExamId = null;
              
              $('#view-dashboard').addClass('hidden'); $('#view-dashboard').hide(); 
              $('#view-exam').addClass('hidden'); $('body').removeClass('exam-mode');
              $('#sidebar').removeClass('active'); $('#sidebar-overlay').removeClass('active');
              
              ['menu-admin', 'menu-guru', 'menu-siswa'].forEach(id => {
                  const m = document.getElementById(id);
                  if(m) { m.style.display = 'none'; m.classList.add('hidden'); }
              });
              
              document.getElementById('u-login').value = ''; document.getElementById('p-login').value = ''; 
              const authView = document.getElementById('view-auth');
              if(authView) { authView.classList.remove('hidden'); authView.style.display = 'flex'; }
          };

          window.Swal.fire({ title: 'Logout?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' }).then((r) => {
              if(r.isConfirmed) executeLogout();
          });
      };
      // =================================================================
      // FUNGSI JADWAL UJIAN: TAMBAH, EDIT, DAN HAPUS
      // =================================================================
      window.openExamModal = function(str) {
          const form = document.getElementById('frm-exam');
          if(form) form.reset();
          
          document.getElementById('ex-id').value = '';
          let d = null;
          if(str) {
              try {
                  // PERBAIKAN: Decode Base64 dengan aman
                  d = JSON.parse(decodeURIComponent(atob(str)));
                  document.getElementById('ex-id').value = d.ExamID || '';
                  document.getElementById('ex-judul').value = d.Judul || '';
                  document.getElementById('ex-mapel').value = d.Mapel || '';
                  document.getElementById('ex-durasi').value = d.Durasi || '';
                  document.getElementById('ex-limit').value = d.LimitTries || d.Limit || 1;
                  document.getElementById('ex-start').value = d.StartDate ? d.StartDate.replace(' ','T') : '';
                  document.getElementById('ex-end').value = d.EndDate ? d.EndDate.replace(' ','T') : '';
                  document.getElementById('ex-token').value = d.Token || '';
                  document.getElementById('ex-randomQ').checked = d.RandomQ === 'Yes';
                  document.getElementById('ex-showStats').checked = d.ShowStats === 'Yes';
                  document.getElementById('ex-violations').value = d.MaxViolations || 3;
              } catch(e) {
                  console.error("Gagal membaca data edit:", e);
                  window.Swal.fire('Error', 'Data ujian rusak, tidak dapat diedit.', 'error');
                  return;
              }
          } else {
              document.getElementById('ex-violations').value = 3;
              document.getElementById('ex-limit').value = 1;
          }

          const role = String(window.user.Role).trim().toLowerCase();
          const container = document.getElementById('kelas-container');

          if (role === 'guru') {
              const kelasArr = String(window.user.Kelas).split(',').map(k => k.trim()).filter(k => k);
              let selectedKelas = d && d.TargetKelas ? String(d.TargetKelas).split(',').map(k => k.trim()) : kelasArr;
              let htmlKelas = `<div class="d-flex flex-wrap gap-2 mt-2">`;
              kelasArr.forEach(k => {
                  const isChecked = selectedKelas.includes(k) ? 'checked' : '';
                  htmlKelas += `<div class="form-check"><input class="form-check-input kls-cb" type="checkbox" value="${k}" id="cb-${k}" ${isChecked}><label class="form-check-label small" for="cb-${k}">${k}</label></div>`;
              });
              htmlKelas += `</div>`;
              container.innerHTML = htmlKelas;
          } else {
              let valKelas = d && d.TargetKelas ? d.TargetKelas : '';
              container.innerHTML = `<input type="text" id="ex-kelas" class="form-control" placeholder="Contoh: 7A, 7B" value="${valKelas}" required>`;
          }
          
          window.openModal('modalExam');
      };

      window.saveExam = function() {
          let targetKelas = "";
          const role = String(window.user.Role).trim().toLowerCase();
          
          if (role === 'guru') {
              let selectedKls = [];
              document.querySelectorAll('.kls-cb:checked').forEach(cb => selectedKls.push(cb.value));
              if (selectedKls.length === 0) { window.Swal.fire('Error', 'Pilih minimal 1 target kelas!', 'error'); return; }
              targetKelas = selectedKls.join(', ');
          } else {
              const klsEl = document.getElementById('ex-kelas');
              if(klsEl) targetKelas = klsEl.value;
          }

          const d = {
              examId: document.getElementById('ex-id').value,
              judul: document.getElementById('ex-judul').value,
              mapel: document.getElementById('ex-mapel').value,
              durasi: document.getElementById('ex-durasi').value,
              start: document.getElementById('ex-start').value,
              end: document.getElementById('ex-end').value,
              limit: document.getElementById('ex-limit').value,
              token: document.getElementById('ex-token').value,
              maxViolations: document.getElementById('ex-violations').value,
              showStats: document.getElementById('ex-showStats').checked ? 'Yes' : 'No',
              randomQ: document.getElementById('ex-randomQ').checked ? 'Yes' : 'No',
              targetKelas: targetKelas,
              userRole: window.user.Role,
              userClass: window.user.Kelas,
              userId: window.user.ID
          };

          if (!d.judul || !d.mapel || !d.start || !d.end || !d.targetKelas) {
              window.Swal.fire('Error', 'Lengkapi data wajib!', 'error'); return;
          }

          const btn = document.querySelector('#frm-exam button[type="submit"]');
          const origBtn = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
          btn.disabled = true;

          window.google.script.run.withSuccessHandler((res) => {
              btn.innerHTML = origBtn; btn.disabled = false;
              if(res.status === 'success') {
                  window.closeModal('modalExam');
                  // PERBAIKAN: Langsung arahkan ke refresh dashboard tanpa trigger loader tambahan
                  window.toast('success', 'Jadwal berhasil disimpan!');
                  window.loadPage('admin-ujian'); 
              } else { 
                  window.Swal.fire('Gagal Menyimpan', res.msg, 'error'); 
              }
          }).withFailureHandler(err => { 
              btn.innerHTML = origBtn; btn.disabled = false; 
              window.Swal.fire('Koneksi Error', err.message, 'error'); 
          }).adminSaveExam(d);
      };


      window.delExam = function(id) { 
          window.Swal.fire({
              title: 'Hapus Jadwal?', 
              text: "Jadwal dan soal ujian di dalamnya akan dihapus.",
              icon: 'warning', 
              showCancelButton: true, 
              confirmButtonColor: '#d33',
              confirmButtonText: 'Ya, Hapus!'
          }).then(r => {
              if(r.isConfirmed) { 
                  window.showLoad(true); 
                  window.google.script.run.withSuccessHandler(() => {
                      window.showLoad(false); // PERBAIKAN: Mematikan loader!
                      window.toast('success', 'Jadwal berhasil dihapus!');
                      window.loadPage('admin-ujian');
                  }).withFailureHandler(err => { 
                      window.showLoad(false); 
                      window.Swal.fire('Error', err.message, 'error');
                  }).adminDeleteExam(id, window.user.ID, window.user.Role); 
              } 
          }); 
      };


      // =================================================================
      // 7. RENDER KONTEN DASHBOARD
      // =================================================================
      window.renderContent = function(page) {
          try {
              const area = document.getElementById('content-area'); if(!area) return;
              let h = '';
              
              if (page === 'admin-home') {
                  const tSiswa = window.gData?.stats?.totalSiswa || 0;
                  const tUjian = window.gData?.stats?.totalUjian || 0;
                  h = `<div class="row g-4"><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-primary"><h3>${tSiswa}</h3><small>Siswa di Kelas Anda</small></div></div><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-success"><h3>${tUjian}</h3><small>Total Ujian</small></div></div></div>`;
              }
              else if (page === 'admin-ujian') {
                  let exams = window.gData?.exams || [];
                  let uniqueMapel = [...new Set(exams.map(e => e.Mapel))];
                  let uniqueKelas = [...new Set(exams.map(e => String(e.TargetKelas).trim()))];
                  
                  h = `<div class="d-flex justify-content-between mb-3">
                          <button class="btn btn-primary shadow-sm" onclick="window.openExamModal()">+ Buat Jadwal Baru</button>
                          <div class="d-flex gap-2">
                            <select id="filter-mapel-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Mapel</option>${uniqueMapel.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
                            <select id="filter-kelas-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Kelas</option>${uniqueKelas.map(k=>`<option value="${k}">${k}</option>`).join('')}</select>
                          </div>
                       </div><div class="row g-4" id="admin-ujian-list">`;
                  
                  exams.forEach(e => {
                      const isOwner = (String(window.user.Role).trim().toLowerCase() === 'admin' || String(e.PembuatID) === String(window.user.ID));
                      
                      // PERBAIKAN: Gunakan Base64 agar string JSON aman dari kerusakan tanda kutip di HTML
                      const safeE = btoa(encodeURIComponent(JSON.stringify(e)));
                      
                      const actionButtons = isOwner ? `<button class="btn btn-sm btn-outline-dark flex-fill" onclick="window.openExamModal('${safeE}')">Edit</button> <button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.manageQ('${e.ExamID}')"><i class="fas fa-list me-1"></i> Soal</button> <button class="btn btn-sm btn-danger" onclick="window.delExam('${e.ExamID}')"><i class="fas fa-trash"></i></button>` : `<div class="alert alert-light small m-0 p-1 text-center w-100">Read Only</div>`;
                      h += `<div class="col-md-6 col-lg-4 ujian-card" data-mapel="${e.Mapel}" data-kelas="${e.TargetKelas}"><div class="card h-100 shadow-sm border-0"><div class="card-body"><div class="d-flex justify-content-between mb-2"><span class="badge bg-primary">${e.Mapel}</span><span class="badge bg-light text-dark border">${e.TargetKelas}</span></div><h5 class="fw-bold text-dark">${e.Judul}</h5><div class="d-flex gap-2">${actionButtons}</div></div></div></div>`;
                  });
                  h += '</div>';
              }

              else if (page === 'siswa-home') {
                  let availExams = window.gData?.availableExams || [];
                  let historyData = window.gData?.history || [];
                  
                  historyData = historyData.map(h => {
                      let ex = availExams.find(e => e.ExamID === h.ExamID) || window.gData?.exams?.find(e => e.ExamID === h.ExamID) || {};
                      return {
                          ...h,
                          Judul: h.Judul || ex.Judul || h.ExamID,
                          Mapel: h.Mapel || ex.Mapel || 'Umum',
                          Nilai: h.TotalNilai !== undefined ? h.TotalNilai : (h.Nilai !== undefined ? h.Nilai : '0')
                      };
                  });
                  
                  h = `<div class="card mb-4 border-0 shadow-sm bg-primary text-white"><div class="card-body"><h5 class="fw-bold">Halo, ${window.user.Nama}</h5></div></div><h5 class="fw-bold mb-3 border-bottom pb-2 text-primary">Ujian Aktif</h5><div class="row g-4 mb-5">`;
                  if(availExams.length === 0) { h += '<div class="col-12"><div class="alert alert-info text-center">Tidak ada ujian aktif saat ini.</div></div>'; } 
                  else {
                      availExams.forEach(e => {
                          let historyCount = historyData.filter(hx => String(hx.ExamID) === String(e.ExamID)).length;
                          let limit = Number(e.LimitTries || e.Limit) || 1;
                          if (historyCount >= limit) { e.IsFinished = true; }
                          
                          let btnState = '', btnText = 'MULAI UJIAN', btnClass = 'btn-primary';
                          if (e.IsFinished) { btnState = 'disabled'; btnText = 'BATAS PENGERJAAN HABIS'; btnClass = 'btn-secondary'; }
                          else if (e.IsExpired) { btnState = 'disabled'; btnText = 'WAKTU HABIS'; btnClass = 'btn-danger'; }
                          h += `<div class="col-md-6 col-lg-4"><div class="card h-100 shadow-sm border-0"><div class="card-body"><h5 class="fw-bold text-primary">${e.Judul}</h5><div class="mb-2"><span class="badge bg-primary">${e.Mapel}</span> <span class="badge bg-light text-dark border">${e.Durasi} Menit</span></div><button class="btn ${btnClass} w-100 fw-bold shadow-sm" onclick="window.startExam('${e.ExamID}')" ${btnState}>${btnText}</button></div></div></div>`;
                      });
                  }
                  
                  let groupedHistory = {};
                  historyData.forEach(r => {
                      let mapel = r.Mapel || 'Umum';
                      if(!groupedHistory[mapel]) groupedHistory[mapel] = [];
                      groupedHistory[mapel].push(r);
                  });
                  
                  let uniqueMapelRiwayat = Object.keys(groupedHistory);
                  let filterHtml = `<select class="form-select form-select-sm w-auto shadow-sm" onchange="window.filterRiwayatSiswa(this.value)"><option value="">Semua Mapel</option>${uniqueMapelRiwayat.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>`;
                  
                  h += `<div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2 mt-4"><h5 class="fw-bold text-primary m-0"><i class="fas fa-history me-2"></i>Riwayat</h5>${filterHtml}</div>`;
                  
                  if(historyData.length === 0) { 
                      h += '<p class="text-muted fst-italic">Belum ada riwayat.</p>'; 
                  } else {
                      h += `<div class="table-responsive bg-white rounded shadow-sm p-3"><table class="table table-hover align-middle mb-0"><thead><tr class="table-light"><th>Tanggal</th><th>Mapel</th><th>Ujian</th><th>Nilai</th><th>Status</th></tr></thead>`;
                      uniqueMapelRiwayat.forEach(mapel => {
                          h += `<tbody class="riwayat-group" data-mapel="${mapel}">
                                <tr class="table-secondary"><td colspan="5" class="fw-bold text-dark small">${mapel}</td></tr>`;
                          groupedHistory[mapel].forEach(r => {
                              h += `<tr><td>${r.WaktuSubmit}</td><td><span class="badge bg-info">${mapel}</span></td><td><div class="fw-bold">${r.Judul}</div></td><td><span class="badge bg-warning text-dark">${r.Nilai}</span></td><td><span class="badge bg-success">Selesai</span></td></tr>`; 
                          });
                          h += `</tbody>`;
                      });
                      h += `</table></div>`;
                  }
              }
              area.innerHTML = h;
          } catch (err) {
              console.error("Render Content Error: ", err);
              const area = document.getElementById('content-area');
              if(area) area.innerHTML = `<div class="alert alert-danger">Error memproses data: ${err.message}.</div>`;
          }
      };

      window.filterRiwayatSiswa = function(val) {
          document.querySelectorAll('.riwayat-group').forEach(group => {
              if(!val || group.getAttribute('data-mapel') === val) group.style.display = '';
              else group.style.display = 'none';
          });
      };

      window.filterAdminUjian = function() {
          const m = document.getElementById('filter-mapel-ujian').value; 
          const k = document.getElementById('filter-kelas-ujian').value;
          document.querySelectorAll('.ujian-card').forEach(card => {
              const matchMapel = m === '' || card.getAttribute('data-mapel') === m;
              const matchKelas = k === '' || card.getAttribute('data-kelas') === k;
              if(matchMapel && matchKelas) card.style.display = '';
              else card.style.display = 'none';
          });
      };

      // =================================================================
      // FUNGSI RENDER MENU: USERS, REKAP, ADMINISTRASI & MONITORING
      // =================================================================
      window.generateUserExcelTemplate = function() {
          const ws_data = [
              ["Nama", "Username", "Password", "Role", "Sekolah", "Kelas"],
              ["Siswa Teladan", "siswa01", "12345", "Siswa", "SMA Negeri 1", "10A"],
              ["Guru Budi", "guru01", "guru123", "Guru", "SMA Negeri 1", "10A,10B"]
          ];
          const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
          const wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, "TemplateUser");
          window.XLSX.writeFile(wb, "Template_Upload_User.xlsx");
      };

      window.handleUploadUsersExcel = function(e) {
          const file = e.target.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = function(evt) {
              const data = evt.target.result;
              const workbook = window.XLSX.read(data, {type: 'binary'});
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              const json = window.XLSX.utils.sheet_to_json(worksheet);
              
              let formattedData = json.map(row => ({
                  nama: row['Nama'] || '',
                  username: row['Username'] || '',
                  password: String(row['Password'] || ''),
                  role: row['Role'] || 'Siswa',
                  sekolah: row['Sekolah'] || '-',
                  kelas: String(row['Kelas'] || '-')
              })).filter(u => u.nama && u.username);
              
              if(formattedData.length === 0) return window.Swal.fire('Error', 'Data kosong atau format salah.', 'error');
              
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(res => {
                  window.showLoad(false);
                  if(res.status === 'success') {
                      window.Swal.fire('Sukses', res.msg, 'success');
                      window.loadPage('admin-users');
                  } else window.Swal.fire('Gagal', res.msg, 'error');
              }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminBatchSaveUsers(formattedData);
          };
          reader.readAsBinaryString(file);
      };

      window.toggleAllCb = function(type) {
          const isChecked = $('#cb-all-'+type).is(':checked');
          $('.cb-'+type).prop('checked', isChecked);
          window.checkBulkDelete(type);
      };

      window.checkBulkDelete = function(type) {
          const count = $('.cb-'+type+':checked').length;
          if(count > 0) $('#btn-bulk-del-'+type).removeClass('hidden');
          else $('#btn-bulk-del-'+type).addClass('hidden');
      };

      window.bulkDeleteUsers = function() {
          const ids = [];
          $('.cb-user:checked').each(function(){ ids.push($(this).val()); });
          if(ids.length === 0) return;
          window.Swal.fire({title:'Hapus '+ids.length+' User?', text: "Data tidak bisa dikembalikan", icon: 'warning', showCancelButton:true, confirmButtonColor: '#d33'}).then(r=>{
              if(r.isConfirmed){
                  window.showLoad(true);
                  window.google.script.run.withSuccessHandler(res=>{
                      window.showLoad(false); 
                      if(res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('admin-users'); }
                      else { window.Swal.fire('Gagal', res.msg, 'error'); }
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminBulkDeleteUsers(ids);
              }
          });
      };

      window.bulkDeleteRekap = function() {
          const rids = [];
          $('.cb-rekap:checked').each(function(){ rids.push($(this).val()); });
          if(rids.length === 0) return;
          window.Swal.fire({title:'Hapus '+rids.length+' Hasil Ujian?', text: "Siswa yang dihapus hasilnya akan bisa mengikuti ujian kembali.", icon: 'warning', showCancelButton:true, confirmButtonColor: '#d33'}).then(r=>{
              if(r.isConfirmed){
                  window.showLoad(true);
                  window.google.script.run.withSuccessHandler(res=>{
                      window.showLoad(false); 
                      if(res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('hasil-rekap'); }
                      else { window.Swal.fire('Gagal', res.msg, 'error'); }
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminBulkDeleteResult(rids);
              }
          });
      };

      window.exportToExcel = function(tableId, filename) {
          const table = document.getElementById(tableId);
          const wb = window.XLSX.utils.table_to_book(table, {sheet: "Rekap Nilai"});
          window.XLSX.writeFile(wb, filename + '.xlsx');
      };

      window.renderUsers = function(users) {
          const cleanRole = String(window.user.Role).trim().toLowerCase();
          const isAdmin = cleanRole === 'admin';
          let h = `<div class="d-flex justify-content-between mb-3 flex-wrap gap-2">
              <div>
                  ${isAdmin ? `<button class="btn btn-success shadow-sm me-2" onclick="window.openModal('modalUser');document.getElementById('frm-user').reset();document.getElementById('mu-id').value='';">+ Tambah User</button>
                  <button class="btn btn-outline-info shadow-sm me-2" onclick="window.generateUserExcelTemplate()"><i class="fas fa-download"></i> Template Excel</button>
                  <label class="btn btn-primary shadow-sm m-0 me-2"><i class="fas fa-upload"></i> Upload Excel <input type="file" hidden accept=".xlsx,.xls" onchange="window.handleUploadUsersExcel(event)"></label>
                  <button id="btn-bulk-del-users" class="btn btn-danger hidden shadow-sm me-2" onclick="window.bulkDeleteUsers()"><i class="fas fa-trash"></i> Hapus Terpilih</button>
                  ` 
                  : `<h5 class="fw-bold text-primary mb-0"><i class="fas fa-users me-2"></i>Data Siswa Kelas Anda</h5>`}
              </div>
              <input type="text" id="user-search" class="form-control" style="width:250px" placeholder="Cari Siswa..." onkeyup="window.filterTable('tbl-users', this.value)">
          </div>
          <div class="card border-0 shadow-sm"><div class="card-body p-0"><div class="table-responsive">
          <table class="table table-hover align-middle mb-0" id="tbl-users"><thead class="table-light">
          <tr>
              ${isAdmin ? `<th width="5%"><input type="checkbox" id="cb-all-users" class="form-check-input" onchange="window.toggleAllCb('users')"></th>` : ''}
              <th>Nama</th><th>Username</th><th>Role</th><th>Kelas</th>${isAdmin ? '<th>Aksi</th>' : ''}
          </tr></thead><tbody>`;
          
          users.forEach(u => {
              const safeData = encodeURIComponent(JSON.stringify(u));
              h += `<tr>
              ${isAdmin ? `<td><input type="checkbox" class="cb-user form-check-input" value="${u.ID}" onchange="window.checkBulkDelete('users')"></td>` : ''}
              <td class="fw-bold">${u.Nama}</td><td>${u.Username}</td>
              <td><span class="badge bg-${String(u.Role).trim().toLowerCase()==='admin'?'danger':(String(u.Role).trim().toLowerCase()==='guru'?'warning':'primary')}">${u.Role}</span></td>
              <td>${u.Kelas || '-'}</td>
              ${isAdmin ? `<td><button class="btn btn-sm btn-outline-dark me-1" onclick="window.openUserModal('${safeData}')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.delUser('${u.ID}')"><i class="fas fa-trash"></i></button></td>` : ''}</tr>`;
          });
          h += `</tbody></table></div></div></div>`;
          document.getElementById('content-area').innerHTML = h;
      };

      window.openKatrolModal = function() { window.openModal('modalKatrol'); };

      window.renderRecapTable = function() {
          const uniqueKelas = [...new Set(window.recapAllData.map(item => item.KelasSiswa))].filter(k => k).sort();
          const uniqueUjian = [...new Set(window.recapAllData.map(item => item.JudulUjian))].sort();
          let h = `
          <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0 text-primary"><i class="fas fa-chart-bar me-2"></i>Rekapitulasi Nilai</h5>
              <div>
                  <button id="btn-bulk-del-rekap" class="btn btn-danger hidden shadow-sm me-2" onclick="window.bulkDeleteRekap()"><i class="fas fa-trash"></i> Hapus Terpilih</button>
                  <button class="btn btn-warning shadow-sm me-2" onclick="window.openKatrolModal()"><i class="fas fa-sort-amount-up me-1"></i> Katrol Nilai</button>
                  <button class="btn btn-success shadow-sm me-2" onclick="window.exportToExcel('tbl-rekap', 'Rekap_Nilai')"><i class="fas fa-file-excel me-1"></i> Export Excel</button>
                  <button class="btn btn-info shadow-sm text-white" onclick="window.printFilteredRecap()"><i class="fas fa-print me-1"></i> Cetak Rekap</button>
              </div>
          </div>
          <div class="row g-2 mb-3">
              <div class="col-md-4"><select id="filter-ujian" class="form-select" onchange="window.applyFilter()"><option value="">Semua Ujian</option>${uniqueUjian.map(u => `<option value="${u}">${u}</option>`).join('')}</select></div>
              <div class="col-md-4"><select id="filter-kelas" class="form-select" onchange="window.applyFilter()"><option value="">Semua Kelas</option>${uniqueKelas.map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
              <div class="col-md-4"><input type="text" id="filter-search" class="form-control" placeholder="Cari Nama Siswa..." onkeyup="window.applyFilter()"></div>
          </div>
          <div class="card border-0 shadow-sm"><div class="card-body p-0"><div class="table-responsive">
          <table class="table table-hover align-middle mb-0" id="tbl-rekap"><thead class="table-light">
          <tr>
              <th width="5%"><input type="checkbox" id="cb-all-rekap" class="form-check-input" onchange="window.toggleAllCb('rekap')"></th>
              <th>Waktu</th><th>Nama Siswa</th><th>Kelas</th><th>Mata Pelajaran</th><th>Nilai Akhir</th><th>Aksi</th>
          </tr></thead><tbody id="tbl-rekap-body"></tbody></table></div></div></div>`;
          
          document.getElementById('content-area').innerHTML = h; 
          window.applyFilter();
      };

      window.applyFilter = function() {
        const fUjian = document.getElementById('filter-ujian').value; 
        const fKelas = document.getElementById('filter-kelas').value; 
        const fSearch = document.getElementById('filter-search').value.toLowerCase();
        
        const tbody = document.getElementById('tbl-rekap-body'); 
        tbody.innerHTML = ''; 
        window.recapDataStore = {};
        
        const filtered = window.recapAllData.filter(item => { 
            if(fUjian && item.JudulUjian !== fUjian) return false; 
            if(fKelas && item.KelasSiswa !== fKelas) return false; 
            if(fSearch && !item.NamaSiswa.toLowerCase().includes(fSearch)) return false; 
            return true; 
        });
        window.currentFilteredData = filtered;
        
        document.getElementById('cb-all-rekap').checked = false;
        document.getElementById('btn-bulk-del-rekap').classList.add('hidden');

        if(filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="text-center p-3">Tidak ada data ditemukan.</td></tr>'; return; }
        
        filtered.forEach(r => {
          window.recapDataStore[r.ResultID] = { detail: r.Detail, nama: r.NamaSiswa, ujian: r.JudulUjian, nilai: r.TotalNilai, pembuat: r.PembuatNama };
          tbody.insertAdjacentHTML('beforeend', `<tr>
          <td><input type="checkbox" class="cb-rekap form-check-input" value="${r.ResultID}" onchange="window.checkBulkDelete('rekap')"></td>
          <td class="small text-muted">${r.WaktuSubmit}</td><td><div class="fw-bold">${r.NamaSiswa}</div></td><td>${r.KelasSiswa}</td><td>${r.Mapel} <br><small class="text-muted">${r.JudulUjian}</small></td><td><span class="badge bg-primary fs-6">${r.TotalNilai}</span></td><td>
          <button class="btn btn-sm btn-outline-info me-1" onclick="window.openKoreksi('${r.ResultID}')" title="Koreksi"><i class="fas fa-edit"></i> Edit</button>
          <button class="btn btn-sm btn-outline-success me-1" onclick="window.printRecap('${r.ResultID}')" title="Cetak"><i class="fas fa-print"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="window.deleteResult('${r.ResultID}')" title="Hapus"><i class="fas fa-trash"></i></button></td></tr>`);
        });
      };

      window.printFilteredRecap = function() {
        if(!window.currentFilteredData || window.currentFilteredData.length === 0) { window.Swal.fire('Data Kosong', 'Tidak ada data nilai yang tampil untuk dicetak.', 'info'); return; }
        const fUjian = document.getElementById('filter-ujian').value || 'Semua Ujian'; const fKelas = document.getElementById('filter-kelas').value || 'Semua Kelas';
        let namaPengawas = window.currentFilteredData.length > 0 ? window.currentFilteredData[0].PembuatNama : window.user.Nama;
        
        let html = `<html><head><title>Cetak Rekap Nilai</title><style>body { font-family: 'Times New Roman', Times, serif; padding: 30px;} h2, h4 { text-align: center; margin: 5px 0; } table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;} th, td { border: 1px solid black; padding: 8px; text-align: left; } th { background-color: #f2f2f2; text-align: center;font-weight: bold; } .text-center { text-align: center; } .signature { margin-top: 50px; width: 100%; text-align: right;} .signature div { display: inline-block; text-align: center; width: 250px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer; background:#198754; color:white; border:none; border-radius:5px;">Cetak Rekap</button></div><h4><div id="logo-container"><img src="${window.user.LogoUrl || 'https://via.placeholder.com/100'}" class="mb-3 rounded" width="100" alt="Logo"></div></h4><hr style="border:1px solid #000; margin-bottom: 20px;"><div><h2>REKAPITULASI HASIL UJIAN</h2><p><strong>Ujian / Materi :</strong> ${fUjian}</p><p><strong>Kelas :</strong> ${fKelas}</p><p><strong>Waktu Cetak :</strong> ${new Date().toLocaleString('id-ID')}</p></div><table><thead><tr><th width="5%">No</th><th width="15%">Waktu Submit</th><th width="25%">Nama Siswa</th><th width="10%">Kelas</th><th width="35%">Mata Pelajaran / Judul</th><th width="10%">Nilai Akhir</th></tr></thead><tbody>`;
        window.currentFilteredData.forEach((r, i) => { html += `<tr><td class="text-center">${i + 1}</td><td class="text-center">${r.WaktuSubmit}</td><td>${r.NamaSiswa}</td><td class="text-center">${r.KelasSiswa}</td><td>${r.Mapel} - ${r.JudulUjian}</td><td class="text-center" style="font-weight: bold;">${r.TotalNilai}</td></tr>`; });
        html += `</tbody></table><div class="signature"><div><p> ${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p><p style="margin-bottom: 70px;">Guru Pengampu / Pengawas</p><p><strong>${namaPengawas}</strong></p></div></div><script>window.onload = function() { window.print();}<\/script></body></html>`;
        const printWin = window.open('', '', 'width=900,height=700'); printWin.document.write(html); printWin.document.close();
      };

      window.printRecap = function(rid) {
        const d = window.recapDataStore[rid]; if(!d) return;
        let namaPengawas = d.pembuat || window.user.Nama;
        
        let detailArr = []; try { detailArr = JSON.parse(d.detail); } catch(e) {}
        let detailHtml = '<table class="data-table"><thead><tr><th width="10%">No</th><th width="20%">Tipe Soal</th><th width="50%">Jawaban Siswa</th><th width="20%">Skor</th></tr></thead><tbody>';
        detailArr.forEach(item => {
          let n = item.i !== undefined ? item.i : item[0]; let s = item.s !== undefined ? item.s : item[1]; let t = item.t || 'Objektif'; let a = item.a !== undefined ? item.a : '';
          let displayAns = Array.isArray(a) ? a.join(', ') : a; displayAns = displayAns ? String(displayAns).replace(/\n/g, '<br>') : '<i style="color:#999;">Tidak dijawab</i>';
          detailHtml += `<tr><td style="text-align:center">${n}</td><td style="text-align:center">${t}</td><td>${displayAns}</td><td style="text-align:center">${s}</td></tr>`;
        });
        detailHtml += '</tbody></table>';

        const printWindow = window.open('', '', 'width=800,height=600');
        printWindow.document.write(`<html><head><title>Cetak Hasil - ${d.nama}</title><style>body{ font-family: 'Times New Roman', Times, serif; padding: 40px; color: #333; } .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 20px; } .score-box { border: 2px solid #000; padding: 15px; text-align: center; margin-bottom: 20px; width: 200px; float: right; } .score { font-size: 38px; font-weight: bold; margin-top: 5px; } .data-table { width: 100%; border-collapse: collapse; margin-top: 15px; } .data-table th, .data-table td { border: 1px solid #000; padding: 8px; } .data-table th { background: #f0f0f0; text-align: center; } .clearfix::after { content: ""; clear: both; display: table; } .footer { margin-top: 50px; text-align: right; } .footer div { display: inline-block; text-align: center; width: 250px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="text-align: right; margin-bottom: 20px;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer; background:#1e3a8a; color:white; border:none; border-radius:5px;">Cetak Dokumen</button></div><div class="header"><h2>HASIL UJIAN BERBASIS KOMPUTER</h2></div><div class="clearfix"><div class="score-box"><h3>NILAI AKHIR</h3><div class="score">${d.nilai}</div></div><table class="student-info"><tr><td width="150"><strong>Nama Peserta</strong></td><td width="10">:</td><td>${d.nama}</td></tr><tr><td><strong>Mata Pelajaran</strong></td><td>:</td><td>${d.ujian}</td></tr><tr><td><strong>Waktu Cetak</strong></td><td>:</td><td>${new Date().toLocaleString('id-ID')}</td></tr></table></div><h4 style="margin-top:20px; border-bottom:1px solid #ccc; padding-bottom:5px;">Rincian Jawaban & Skor Tiap Soal</h4>${detailHtml}<div class="footer"><div><p> ${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p><p style="margin-bottom: 70px;">Guru Pengampu / Pengawas</p><p><strong>${namaPengawas}</strong></p></div></div><script>window.onload = function() { window.print(); }<\/script></body></html>`);
        printWindow.document.close();
      };

      window.renderAdministrasi = function() {
          const uniqueKelas = [...new Set(window.gAdminData.users.map(u => String(u.Kelas).trim()))].filter(k => k).sort();
          let optKelas = `<option value="ALL">Semua Kelas</option>` + uniqueKelas.map(k => `<option value="${k}">${k}</option>`).join('');
          let optUjian = `<option value="">-- Pilih Ujian --</option>` + window.gAdminData.exams.map(e => `<option value="${e.ExamID}">${e.Judul} (${e.Mapel})</option>`).join('');
          
          let h = `
          <div class="row g-4">
              <div class="col-md-4">
                  <div class="card shadow-sm border-0 h-100">
                      <div class="card-body">
                          <h5 class="fw-bold text-primary"><i class="fas fa-id-card me-2"></i>Cetak Kartu Login</h5>
                          <p class="small text-muted">Cetak kartu akun siswa untuk login aplikasi CBT.</p>
                          <label class="small fw-bold">Filter Kelas</label>
                          <select id="adm-kls-kartu" class="form-select mb-3">${optKelas}</select>
                          <button class="btn btn-primary w-100" onclick="window.printKartuLogin()"><i class="fas fa-print me-1"></i> Cetak Kartu</button>
                      </div>
                  </div>
              </div>
              <div class="col-md-4">
                  <div class="card shadow-sm border-0 h-100">
                      <div class="card-body">
                          <h5 class="fw-bold text-info"><i class="fas fa-clipboard-list me-2"></i>Cetak Daftar Hadir</h5>
                          <p class="small text-muted">Format absensi siswa saat pelaksanaan ujian.</p>
                          <label class="small fw-bold">Pilih Ujian</label>
                          <select id="adm-exam-hadir" class="form-select mb-2">${optUjian}</select>
                          <label class="small fw-bold">Filter Kelas</label>
                          <select id="adm-kls-hadir" class="form-select mb-3">${optKelas}</select>
                          <button class="btn btn-info text-white w-100" onclick="window.printDaftarHadir()"><i class="fas fa-print me-1"></i> Cetak Daftar Hadir</button>
                      </div>
                  </div>
              </div>
              <div class="col-md-4">
                  <div class="card shadow-sm border-0 h-100">
                      <div class="card-body">
                          <h5 class="fw-bold text-success"><i class="fas fa-file-signature me-2"></i>Cetak Berita Acara</h5>
                          <p class="small text-muted">Format laporan pelaksanaan ujian untuk pengawas.</p>
                          <label class="small fw-bold">Pilih Ujian</label>
                          <select id="adm-exam-ba" class="form-select mb-2">${optUjian}</select>
                          <label class="small fw-bold">Filter Kelas</label>
                          <select id="adm-kls-ba" class="form-select mb-3">${optKelas}</select>
                          <button class="btn btn-success w-100" onclick="window.printBeritaAcara()"><i class="fas fa-print me-1"></i> Cetak Berita Acara</button>
                      </div>
                  </div>
              </div>
          </div>`;
          document.getElementById('content-area').innerHTML = h;
      };

      window.printKartuLogin = function() {
          const kls = document.getElementById('adm-kls-kartu').value;
          let usersToPrint = window.gAdminData.users;
          if (kls !== 'ALL') usersToPrint = usersToPrint.filter(u => u.Kelas === kls);
          if (usersToPrint.length === 0) return window.Swal.fire('Kosong', 'Tidak ada data siswa untuk kelas tersebut.', 'info');
          let html = `<html><head><title>Cetak Kartu Login</title><style>
              body { font-family: 'Times New Roman', Times, serif; }
              .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; padding: 15px; }
              .card { border: 2px dashed #333; padding: 15px; border-radius: 8px; page-break-inside: avoid; }
              .kop { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
              .kop img { width: 50px; height: 50px; margin-right: 15px; }
              .kop h3 { margin: 0; font-size: 15px; text-transform: uppercase; }
              .kop p { margin: 0; font-size: 11px; }
              table { width: 100%; font-size: 14px; }
              td { padding: 4px 0; }
              @media print { .no-print { display: none; } }
          </style></head><body>
          <div class="no-print" style="margin: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#1e3a8a; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div>
          <div class="grid">`;
          usersToPrint.forEach(u => {
              html += `<div class="card">
                  <div class="kop">
                      <img src="${window.user.LogoUrl || 'https://via.placeholder.com/50'}" alt="Logo">
                      <div><h3>KARTU LOGIN UJIAN CBT</h3></div>
                  </div>
                  <table>
                      <tr><td width="30%"><strong>Nama</strong></td><td width="5%">:</td><td>${u.Nama}</td></tr>
                      <tr><td><strong>Kelas</strong></td><td>:</td><td>${u.Kelas}</td></tr>
                      <tr><td><strong>Username</strong></td><td>:</td><td><strong>${u.Username}</strong></td></tr>
                      <tr><td><strong>Password</strong></td><td>:</td><td><strong>${u.Password}</strong></td></tr>
                  </table>
              </div>`;
          });
          html += `</div><script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      };

      window.printDaftarHadir = function() {
          const examId = document.getElementById('adm-exam-hadir').value; 
          const kls = document.getElementById('adm-kls-hadir').value;
          if(!examId) return window.Swal.fire('Perhatian', 'Pilih Ujian terlebih dahulu.', 'warning');
          const exam = window.gAdminData.exams.find(e => String(e.ExamID) === String(examId));
          let usersToPrint = window.gAdminData.users;
          if (kls !== 'ALL') usersToPrint = usersToPrint.filter(u => u.Kelas === kls);
          if (usersToPrint.length === 0) return window.Swal.fire('Kosong', 'Tidak ada data siswa untuk kelas tersebut.', 'info');
          let html = `<html><head><title>Daftar Hadir Ujian</title><style>
              body { font-family: 'Times New Roman', Times, serif; padding: 30px; }
              .kop { display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 20px; text-align: center; }
              .kop img { width: 70px; height: 70px; margin-right: 20px; position: absolute; left: 40px; }
              .kop h2 { margin: 0; font-size: 20px; text-transform: uppercase; }
              .kop p { margin: 5px 0 0; font-size: 14px; }
              h3 { text-align: center; text-decoration: underline; margin-bottom: 20px; }
              .info-table { width: 100%; margin-bottom: 20px; font-size: 14px; }
              .info-table td { padding: 4px; }
              .data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
              .data-table th, .data-table td { border: 1px solid #000; padding: 8px; }
              .data-table th { background: #f0f0f0; text-align: center; }
              .ttd-box { height: 35px; }
              @media print { .no-print { display: none; } }
          </style></head><body>
          <div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#0dcaf0; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div>
          <div class="kop">
              <img src="${window.user.LogoUrl || 'https://via.placeholder.com/70'}" alt="Logo">
              <div><h2>DAFTAR HADIR PESERTA UJIAN</h2></div>
          </div>
          <h3>DAFTAR HADIR PESERTA</h3>
          <table class="info-table">
              <tr><td width="15%"><strong>Mata Pelajaran</strong></td><td width="2%">:</td><td width="33%">${exam.Mapel} - ${exam.Judul}</td><td width="15%"><strong>Hari, Tanggal</strong></td><td width="2%">:</td><td>......................................</td></tr>
              <tr><td><strong>Kelas</strong></td><td>:</td><td>${kls === 'ALL' ? 'Semua Kelas' : kls}</td><td><strong>Waktu</strong></td><td>:</td><td>......................................</td></tr>
          </table>
          <table class="data-table">
              <thead><tr><th width="5%">No</th><th width="15%">Username</th><th width="40%">Nama Peserta</th><th width="25%" colspan="2">Tanda Tangan</th><th width="15%">Ket</th></tr></thead>
              <tbody>`;
          usersToPrint.forEach((u, i) => {
              let ttdCol1 = (i % 2 === 0) ? `${i+1}.` : '';
              let ttdCol2 = (i % 2 !== 0) ? `${i+1}.` : '';
              html += `<tr>
                  <td style="text-align:center">${i + 1}</td>
                  <td style="text-align:center">${u.Username}</td>
                  <td>${u.Nama}</td>
                  <td class="ttd-box">${ttdCol1}</td><td class="ttd-box">${ttdCol2}</td>
                  <td></td>
              </tr>`;
          });
          html += `</tbody></table>
          <div style="margin-top: 50px; text-align: right; padding-right: 50px;">
              <p>..................................</p>
              <p style="margin-bottom: 70px;">Pengawas Ujian,</p>
              <p><strong>( ......................................... )</strong></p>
          </div>
          <script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      };

      window.printBeritaAcara = function() {
          const examId = document.getElementById('adm-exam-ba').value; 
          const kls = document.getElementById('adm-kls-ba').value;
          if(!examId) return window.Swal.fire('Perhatian', 'Pilih Ujian terlebih dahulu.', 'warning');
          const exam = window.gAdminData.exams.find(e => String(e.ExamID) === String(examId));
          
          let html = `<html><head><title>Berita Acara Ujian</title><style>
              body { font-family: 'Times New Roman', Times, serif; padding: 40px; line-height: 1.6; }
              .kop { display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 30px; text-align: center; }
              .kop img { width: 80px; height: 80px; margin-right: 20px; position: absolute; left: 40px; }
              .kop h2 { margin: 0; font-size: 22px; text-transform: uppercase; }
              .kop p { margin: 5px 0 0; font-size: 14px; }
              h3 { text-align: center; text-decoration: underline; margin-bottom: 30px; }
              .content { font-size: 15px; text-align: justify; }
              .content p { margin-bottom: 15px; }
              .ttd-section { margin-top: 60px; width: 100%; }
              .ttd-section table { width: 100%; text-align: center; }
              @media print { .no-print { display: none; } }
          </style></head><body>
          <div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#198754; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div>
          <div class="kop">
              <img src="${window.user.LogoUrl || 'https://via.placeholder.com/80'}" alt="Logo">
              <div><h2>PANITIA PELAKSANAAN UJIAN CBT</h2></div>
          </div>
          <h3>BERITA ACARA PELAKSANAAN UJIAN</h3>
          <div class="content">
              <p>Pada hari ini .................................. tanggal ........... bulan .............................. tahun .........................., telah diselenggarakan Ujian Berbasis Komputer (CBT) dengan rincian sebagai berikut:</p>
              <table style="width: 100%; margin-left: 20px; margin-bottom: 15px;">
                  <tr><td width="25%">Mata Pelajaran</td><td width="5%">:</td><td><strong>${exam.Mapel} - ${exam.Judul}</strong></td></tr>
                  <tr><td>Kelas / Ruang</td><td>:</td><td><strong>${kls === 'ALL' ? 'Semua Kelas' : kls}</strong></td></tr>
                  <tr><td>Waktu Pelaksanaan</td><td>:</td><td>Pukul ..................... s.d .....................</td></tr>
              </table>
              <p>Dengan jumlah peserta ujian sebagai berikut:</p>
              <table style="width: 100%; margin-left: 20px; margin-bottom: 20px;">
                  <tr><td width="25%">1. Jumlah Peserta Seharusnya</td><td width="5%">:</td><td>........... Orang</td></tr>
                  <tr><td>2. Jumlah Peserta Hadir</td><td>:</td><td>........... Orang</td></tr>
                  <tr><td>3. Jumlah Peserta Tidak Hadir</td><td>:</td><td>........... Orang</td></tr>
                  <tr><td valign="top">4. Catatan Selama Ujian</td><td valign="top">:</td><td style="border-bottom: 1px dotted #000; height: 30px;"></td></tr>
                  <tr><td></td><td></td><td style="border-bottom: 1px dotted #000; height: 30px;"></td></tr>
              </table>
              <p>Demikian Berita Acara ini dibuat dengan sesungguhnya untuk dapat dipergunakan sebagaimana mestinya.</p>
          </div>
          <div class="ttd-section">
              <table>
                  <tr>
                      <td width="50%"></td>
                      <td width="50%">....................................<br>Pengawas Ujian,</td>
                  </tr>
                  <tr><td height="80"></td><td></td></tr>
                  <tr>
                      <td></td>
                      <td><strong>( .................................................. )</strong></td>
                  </tr>
              </table>
          </div>
          <script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      };

      window.renderMonitoring = function(){ 
          window.showLoad(true); 
          window.google.script.run.withSuccessHandler(r=>{ 
              window.showLoad(false); 
              let h=`<div class="row g-2 mb-3"><div class="col-md-5"><select id="mon-sel" class="form-select" onchange="window.startMon()"><option value="">Pilih Ujian...</option>`; 
              r.data.exams.forEach(e=>h+=`<option value="${e.ExamID}">${e.Judul}</option>`); 
              h+=`</select></div>
              <div class="col-md-4"><input type="text" id="mon-search" class="form-control" placeholder="Cari..." onkeyup="window.filterTable('tbl-mon', this.value)"></div>
              <div class="col-md-3"><button class="btn btn-danger w-100 fw-bold" onclick="window.triggerResetMassal()"><i class="fas fa-recycle me-1"></i> Reset Semua Siswa</button></div>
              </div><div id="mon-area" class="bg-white p-3 rounded shadow-sm" style="min-height:200px">Silakan pilih ujian untuk memonitor progres secara Live.</div>`; 
              document.getElementById('content-area').innerHTML = h; 
          }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).getDashboardData(window.user.Role, window.user.ID, window.user.Kelas); 
      };

      window.startMon = function(){ 
          const id = document.getElementById('mon-sel').value; 
          if(id){ 
              window.fetchMon(id); 
              clearInterval(window.monitorInterval); 
              window.monitorInterval = setInterval(()=>window.fetchMon(id), 10000); 
          } else {
              document.getElementById('mon-area').innerHTML = ''; 
          }
      };
      
      window.fetchMon = function(id){ 
          window.google.script.run.withSuccessHandler(r=>{ 
              if(r.status==='error') { document.getElementById('mon-area').innerHTML = `<div class="alert alert-warning">${r.msg}</div>`; return; } 
              let h=`<table id="tbl-mon" class="table table-hover align-middle"><thead><tr class="table-light"><th>Nama</th><th>Progress</th><th>Status</th><th>Aksi</th></tr></thead><tbody>`; 
              r.data.forEach(d=>{ 
                  const p=Math.round((d.terjawab/d.total)*100)||0; 
                  h+=`<tr data-uid="${d.id}" data-nama="${d.nama}"><td><div class="fw-bold">${d.nama}</div><small class="text-muted">${d.kelas}</small></td><td><div class="progress" style="height:20px"><div class="progress-bar bg-success" style="width:${p}%">${d.terjawab}/${d.total}</div></div></td><td>${d.status==='Online'?'<span class="badge bg-success">ON</span>':'<span class="badge bg-secondary">OFF</span>'}</td><td><button class="btn btn-sm btn-outline-danger" onclick="window.triggerReset('${d.id}', '${d.nama}')">Reset User</button></td></tr>`; 
              }); 
              document.getElementById('mon-area').innerHTML = h+'</tbody></table>'; 
              const cur = document.getElementById('mon-search').value; 
              if(cur) window.filterTable('tbl-mon', cur); 
          }).withFailureHandler(err => console.log(err)).getLiveMonitoring(id, window.user.Role, window.user.Kelas); 
      };

      window.triggerReset = function(sId, sName) { 
          const eId = document.getElementById('mon-sel').value; 
          if(!sId || !eId) return window.Swal.fire('Perhatian', 'Pilih ujian terlebih dahulu', 'warning'); 
          window.Swal.fire({ title: 'Reset Siswa Ini?', text: `${sName} akan dikeluarkan dan harus login ulang.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Ya, Reset!' }).then(r => { 
              if(r.isConfirmed) { 
                  window.Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => window.Swal.showLoading() }); 
                  window.google.script.run.withSuccessHandler(res => { 
                      if(res.status === 'success') { window.Swal.fire('Berhasil', res.msg, 'success'); window.fetchMon(eId); } else { window.Swal.fire('Gagal', res.msg, 'error'); } 
                  }).withFailureHandler(err => window.Swal.fire('Error', err.message, 'error')).teacherResetStatus(sId, eId, window.user.Role, window.user.Kelas); 
              } 
          }); 
      };

      window.triggerResetMassal = function() {
          const eId = document.getElementById('mon-sel').value; 
          if(!eId) return window.Swal.fire('Perhatian', 'Pilih ujian terlebih dahulu dari dropdown', 'warning');
          window.Swal.fire({
              title: 'Reset Seluruh Siswa?',
              text: 'Ini akan mengeluarkan semua siswa yang sedang mengerjakan ujian ini. Lanjutkan?',
              icon: 'error',
              showCancelButton: true,
              confirmButtonColor: '#d33',
              confirmButtonText: 'Ya, Reset Semua!'
          }).then(r => {
              if(r.isConfirmed) {
                  window.Swal.fire({title: 'Memproses...', allowOutsideClick: false, didOpen: () => window.Swal.showLoading() });
                  window.google.script.run.withSuccessHandler(res => {
                      if(res.status === 'success') { window.Swal.fire('Berhasil', res.msg, 'success'); window.fetchMon(eId); } else { window.Swal.fire('Gagal', res.msg, 'error'); }
                  }).withFailureHandler(err => window.Swal.fire('Error', err.message, 'error')).teacherResetMassal(eId, window.user.Role, window.user.Kelas);
              }
          });
      };

      // =================================================================
      // 8. FUNGSI UJIAN SISWA (START, RUN, SUBMIT, SECURITY)
      // =================================================================
      window.startExam = function(eid) {
          try { if (screen.orientation && screen.orientation.unlock) { screen.orientation.unlock(); } } catch (e) {}

          const rules = `<div class="text-start small">
              <b>TATA CARA & ATURAN UJIAN:</b><br><br>
              1. Ujian ini menggunakan <b>Layar Penuh (Fullscreen)</b>.<br>
              2. Jangan keluar dari mode layar penuh selama ujian berlangsung.<br>
              3. Jangan membuka aplikasi, tab baru, atau split layar.<br>
              4. Sistem akan mendeteksi pelanggaran. Jika melanggar, jawaban akan <b>otomatis terkirim</b>.<br>
          </div>`;
          window.Swal.fire({ title: 'Peraturan Ujian', html: rules, icon: 'warning', showCancelButton: true, confirmButtonText: 'SETUJU & MULAI', confirmButtonColor: '#1e3a8a' }).then(r => {
              if(r.isConfirmed) {
                  // PERBAIKAN: Aktifkan Alarm Audio dengan pasti saat setuju ujian
                  if(audioCtx && audioCtx.state === 'suspended') { audioCtx.resume(); }

                  if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen().catch((err) => {}); }
                  window.showLoad(true);
                  window.google.script.run.withSuccessHandler(res => {
                      window.showLoad(false);
                      if(res.status === 'success') {
                          localStorage.removeItem(`ANS_${window.user.ID}_${eid}`);
                          window.activeExamId = eid; 
                          window.totalQ = res.data.length;
                          window.activeExamViolations = res.maxViolations || 3;
                          document.getElementById('do-exam-title').innerHTML = `${res.judul} <span class="mx-2">|</span> ${window.user.Nama}`;
                          try { localStorage.setItem('cbt_active_exam', JSON.stringify({ id: eid, qs: res.data, dur: res.duration, maxV: window.activeExamViolations, start: Date.now(), judul: res.judul, token: res.token })); } catch(e) {}
                          window.violationCount = 0; 
                          window.enableSecurity(); 
                          window.runExam(res.data, res.duration, false);
                      } else window.Swal.fire('Gagal', res.msg, 'error');
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).getExamPack(eid, window.user.ID);
              }
          });
      };

      window.refreshUjianSiswa = function() {
          window.Swal.fire({ title: 'Refresh Data Ujian?', text: 'Menyegarkan data soal tanpa menghilangkan jawaban.', icon: 'info', showCancelButton: true, confirmButtonText: 'Ya, Refresh' }).then(r => {
              if (r.isConfirmed) {
                  window.disableSecurity(); window.showLoad(true);
                  window.google.script.run.withSuccessHandler(res => {
                      window.showLoad(false);
                      if(res.status === 'success') {
                          window.totalQ = res.data.length; window.activeExamViolations = res.maxViolations || 3;
                          window.enableSecurity(); window.runExam(res.data, res.duration, true);
                          window.Swal.fire('Berhasil', 'Soal disinkronisasi.', 'success');
                      } else { window.Swal.fire('Gagal', res.msg, 'error'); }
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).getExamPack(window.activeExamId, window.user.ID);
              }
          });
      };

      window.enableSecurity = function() { 
          window.violationCount = 0; window.isExamFinished = false; window.violationLock = false; 
          document.addEventListener("visibilitychange", window.handleVisibilityChange); 
          window.addEventListener("blur", window.handleWindowBlur); 
          document.addEventListener("fullscreenchange", window.handleFullscreenChange);
          $(document).on("contextmenu.exam", function(e) { e.preventDefault(); return false; }); 
          $(document).on("keydown.exam", function(e) { if (e.key === "PrintScreen" || (e.ctrlKey && e.key === "p") || (e.key === "F12")) { e.preventDefault(); return false; } });
      };

      window.disableSecurity = function() { 
          document.removeEventListener("visibilitychange", window.handleVisibilityChange); 
          window.removeEventListener("blur", window.handleWindowBlur); 
          document.removeEventListener("fullscreenchange", window.handleFullscreenChange); 
          $(document).off(".exam"); 
      };

      window.handleVisibilityChange = function() { if (!window.isExamFinished && document.hidden) window.triggerViolation("Anda keluar dari tab ujian!"); };
      window.handleWindowBlur = function() { if (!window.isExamFinished) window.triggerViolation("Anda meninggalkan halaman ujian!"); };
      window.handleFullscreenChange = function() { if (!window.isExamFinished && !document.fullscreenElement) { window.triggerViolation("Anda keluar dari mode fullscreen!"); try{document.documentElement.requestFullscreen().catch(()=>{});}catch(e){} } };

      window.triggerViolation = function(msg) {
          if(window.violationLock || window.isExamFinished) return;
          window.violationLock = true; window.violationCount++; 
          
          if (window.violationCount >= window.activeExamViolations) {
              window.playBeep(0, true);
              window.isExamFinished = true; window.submitExamButton(true); 
          } else {
              window.playBeep(window.violationCount, false);
              window.Swal.fire({ icon: 'warning', title: 'PERINGATAN PELANGGARAN!', text: `${msg} (${window.violationCount}/${window.activeExamViolations})`, confirmButtonText: 'KEMBALI KE UJIAN', allowOutsideClick: false
              }).then(() => { window.violationLock = false; try{document.documentElement.requestFullscreen().catch(()=>{});}catch(e){} });
          }
      };

      window.runExam = function(qs, dur, isResume) {
          document.getElementById('view-dashboard').classList.add('hidden'); 
          document.getElementById('view-dashboard').style.display = 'none';
          document.getElementById('view-exam').classList.remove('hidden'); 
          document.getElementById('view-exam').style.display = 'flex';
          document.body.classList.add('exam-mode');
          
          const c = $('#q-slides-container'); const g = $('#nav-grid'); c.empty(); g.empty();
          qs.forEach((q,i) => {
              let inp = '';
              if(q.Tipe==='PGKK') {
                  const opts = JSON.parse(q.Options||"[]");
                  inp = `<table class="table table-bordered tbl-pgkk mt-3 bg-white"><thead><tr class="table-light"><th>PERNYATAAN</th><th width="15%">BENAR</th><th width="15%">SALAH</th></tr></thead><tbody>`;
                  opts.forEach((o,x)=> inp+=`<tr><td><div class="opt-content">${o}</div></td><td style="padding:0; vertical-align:middle;"><label class="d-flex w-100 h-100 justify-content-center align-items-center m-0 clickable-opt" style="padding: 15px;"><input class="form-check-input m-0" type="radio" name="ans-${q.QID}-${x}" value="B" onchange="window.saveAnsLocal('${q.QID}', 'PGKK', ${i})"></label></td><td style="padding:0; vertical-align:middle;"><label class="d-flex w-100 h-100 justify-content-center align-items-center m-0 clickable-opt" style="padding: 15px;"><input class="form-check-input m-0" type="radio" name="ans-${q.QID}-${x}" value="S" onchange="window.saveAnsLocal('${q.QID}', 'PGKK', ${i})"></label></td></tr>`);
                  inp += `</tbody></table>`;
              } else if(q.Tipe==='Menjodohkan') {
                  const lItems = JSON.parse(q.Options||"[]"); const rItems = q.Extra || [];
                  inp = `<div class="match-container" id="match-area-${i}"><input type="hidden" id="ans-in-${i}" onchange="window.saveAnsLocal('${q.QID}', 'MATCH', ${i})"><svg class="match-svg" id="svg-${i}"></svg><div class="match-col" id="col-l-${i}">${lItems.map((t,Idx)=>`<div class="match-item match-left" data-idx="${Idx}" onclick="window.matchClick(${i}, 'l', ${Idx}, this)"><div class="opt-content">${t}</div></div>`).join('')}</div><div class="match-col" id="col-r-${i}">${rItems.map((t,Idx)=>`<div class="match-item match-right" data-idx="${Idx}" data-val="${encodeURIComponent(t)}" onclick="window.matchClick(${i}, 'r', ${Idx}, this)"><div class="opt-content">${t}</div></div>`).join('')}</div></div><div class="text-end mt-2"><button class="btn btn-sm btn-outline-warning" onclick="window.resetMatch(${i})">Reset Garis</button></div>`;
              } else if(q.Tipe.includes('PG')) {
                  const opts = JSON.parse(q.Options||"[]");
                  opts.forEach(o => inp += `<label class="form-check p-3 border mb-2 rounded bg-white clickable-opt d-flex align-items-center w-100"><input class="form-check-input flex-shrink-0" type="${q.Tipe==='PGK'?'checkbox':'radio'}" name="ans-${q.QID}" value="${encodeURIComponent(o)}" onchange="window.saveAnsLocal('${q.QID}', '${q.Tipe}', ${i})"><div class="ms-3 flex-grow-1 opt-content mb-0">${o}</div></label>`);
              } else inp = `<textarea class="form-control" rows="5" name="ans-${q.QID}" onchange="window.saveAnsLocal('${q.QID}', 'ESSAY', ${i})"></textarea>`;
              c.append(`<div class="q-slide hidden" id="sl-${i}" data-qid="${q.QID}" data-type="${q.Tipe}"><div class="badge bg-primary mb-3">Soal No. ${q.Nomor||i+1}</div><div class="mb-4 q-content lead">${q.Pertanyaan}</div>${inp}</div>`);
              g.append(`<button id="nb-${i}" class="q-nav-btn ${i===0?'active-q':''}" onclick="window.jump(${i})">${i+1}</button>`);
          });
          window.restoreAnswers(qs); window.jump(0);
          if(window.applyMathJax) window.applyMathJax();
          
          let startTime = Date.now();
          if(isResume) { const storedState = JSON.parse(localStorage.getItem('cbt_active_exam') || '{}'); if(storedState && storedState.start) startTime = storedState.start; }
          const endTime = startTime + (dur * 60000);
          
          clearInterval(window.timerInt);
          window.timerInt = setInterval(() => {
              const diff = Math.floor((endTime - Date.now()) / 1000);
              if(diff <= 0) { window.submitExamButton(true); }
              else { let m = Math.floor(diff/60), s = diff%60; $('#timer-disp').text(`${m}:${s<10?'0':''}${s}`); if(diff < 300) $('#timer-disp').addClass('text-danger fw-bold'); }
          }, 1000);
          
          clearInterval(window.monitorInterval);
          window.monitorInterval = setInterval(() => { window.google.script.run.updateClientProgress(window.activeExamId, window.user.ID, $('.q-nav-btn.answered').length, window.totalQ); }, 20000);
          clearInterval(window.autosaveInterval);
          window.autosaveInterval = setInterval(() => {
              const key = `ANS_${window.user.ID}_${window.activeExamId}`;
              try { const stored = localStorage.getItem(key); if(stored) { let data = JSON.parse(decodeURIComponent(atob(stored))); window.google.script.run.autosaveAnswer(window.activeExamId, window.user.ID, JSON.stringify(data)); } } catch(e){}
          }, 60000);
      };

      window.saveAnsLocal = function(qid, type, idx) {
          let val; 
          if(type.includes('PG')) { if(type==='PGK') { val=[]; $(`input[name="ans-${qid}"]:checked`).each(function(){ val.push(decodeURIComponent($(this).val())) }); } else val = decodeURIComponent($(`input[name="ans-${qid}"]:checked`).val()); } 
          else if(type === 'PGKK') { val=[]; $(`#sl-${idx} tbody tr`).each(function(x){ val.push($(`input[name="ans-${qid}-${x}"]:checked`).val()||null) }); } 
          else if(type === 'MATCH') { const raw = $(`#ans-in-${idx}`).val(); val = raw ? JSON.parse(raw) : []; } 
          else val = $(`#sl-${idx} textarea`).val();
          
          const key = `ANS_${window.user.ID}_${window.activeExamId}`;
          let currentData = {};
          try { const stored = localStorage.getItem(key); if(stored) currentData = JSON.parse(decodeURIComponent(atob(stored))); } catch(e) {}
          currentData[qid] = val;
          try { localStorage.setItem(key, btoa(encodeURIComponent(JSON.stringify(currentData)))); } catch(e) {}
          window.markAns(idx);
      };

      window.restoreAnswers = function(qs) {
          const key = `ANS_${window.user.ID}_${window.activeExamId}`;
          let saved = {};
          try { const stored = localStorage.getItem(key); if(stored) saved = JSON.parse(decodeURIComponent(atob(stored))); } catch(e) {}
          qs.forEach((q, idx) => { 
              const val = saved[q.QID]; 
              if(val) { 
                  window.markAns(idx); 
                  if(q.Tipe === 'PGS') $(`input[name="ans-${q.QID}"][value="${encodeURIComponent(val)}"]`).prop('checked', true); 
                  else if(q.Tipe === 'PGK') val.forEach(v => $(`input[name="ans-${q.QID}"][value="${encodeURIComponent(v)}"]`).prop('checked', true)); 
                  else if(q.Tipe === 'Uraian') $(`textarea[name="ans-${q.QID}"]`).val(val); 
                  else if(q.Tipe === 'PGKK') { val.forEach((v, rIdx) => { if(v) $(`input[name="ans-${q.QID}-${rIdx}"][value="${v}"]`).prop('checked', true); }); } 
                  else if(q.Tipe === 'Menjodohkan') { $(`#ans-in-${idx}`).val(JSON.stringify(val)); setTimeout(() => window.redrawMatchLines(idx, val, q.Extra), 500); } 
              } 
          });
      };

      window.markAns = function(i) { $(`#nb-${i}`).addClass('answered'); };
      window.jump = function(i) { window.currentQIdx = i; $('.q-slide').addClass('hidden'); $(`#sl-${i}`).removeClass('hidden'); $('.q-nav-btn').removeClass('active-q'); $(`#nb-${i}`).addClass('active-q'); if($(`#sl-${i}`).data('type')==='Menjodohkan') setTimeout(()=>window.drawLines(i), 50); if(window.applyMathJax) window.applyMathJax(); };
      window.navSlide = function(dir) { let next = window.currentQIdx + dir; if(next >= 0 && next < window.totalQ) window.jump(next); };

      window.submitExamButton = function(force = false) {
          if (window.examSubmitting) return;
          if (force) { window.processSubmission(); return; }
          const answeredCount = $('.q-nav-btn.answered').length;
          const activeState = JSON.parse(localStorage.getItem('cbt_active_exam') || '{}');
          const reqToken = activeState.token && activeState.token !== '-' ? String(activeState.token).trim().toUpperCase() : "";
          let inputPlace = reqToken ? 'Ketik Token Kirim...' : 'Ketik kata SELESAI...';
          let msgHtml = `<p class="mb-3">Anda telah mengerjakan <b>${answeredCount}</b> dari <b>${window.totalQ}</b> soal.</p>`;
          if(reqToken) { msgHtml += '<div class="alert alert-info small"><i class="fas fa-lock me-1"></i> Masukkan <b>Token Kirim Jawaban</b>:</div>'; } 
          else { msgHtml += '<div class="alert alert-warning small">Ketik kata <b>SELESAI</b> di bawah ini untuk mengirim:</div>'; }
          
          window.Swal.fire({
              title: 'Kirim Jawaban', html: `<div class="text-start">${msgHtml}</div>`, input: 'text', inputAttributes: { autocapitalize: 'characters', autocomplete: 'off' },
              inputPlaceholder: inputPlace, icon: 'question', showCancelButton: true, allowOutsideClick: false, allowEscapeKey: false,
              confirmButtonText: '<i class="fas fa-paper-plane me-1"></i> Kirim Sekarang', confirmButtonColor: '#198754',
              preConfirm: (inputValue) => {
                  let val = (inputValue || '').trim().toUpperCase();
                  if (reqToken) { if (val !== reqToken) { window.Swal.showValidationMessage('Token Kirim Salah!'); return false; } } 
                  else { if (val !== 'SELESAI') { window.Swal.showValidationMessage('Ketik kata SELESAI untuk mengirim.'); return false; } }
                  return true;
              }
          }).then((result) => { if (result.isConfirmed) { window.processSubmission(); } });
      };

      window.processSubmission = function(retryCount = 0) {
          if (window.examSubmitting && retryCount === 0) return;
          window.examSubmitting = true;
          const btn = $('#btn-finish'); 
          if (retryCount === 0) {
              btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2"></span>Mengirim...');
              clearInterval(window.timerInt); clearInterval(window.monitorInterval); clearInterval(window.autosaveInterval);
              window.isExamFinished = true; window.disableSecurity(); window.stopContinuousBeep();
          }
          let ans = [];
          $('.q-slide').each(function(idx) {
              const qid = $(this).data('qid'); const t = $(this).data('type'); let v = null;
              if (t.includes('PG') && t !== 'PGKK') {
                  if (t === 'PGK') { v = []; $(this).find('input:checked').each(function() { v.push(decodeURIComponent($(this).val())) }); }
                  else { const checked = $(this).find('input:checked').val(); if(checked) v = decodeURIComponent(checked); }
              }
              else if (t === 'PGKK') { v = []; $(this).find('tbody tr').each(function(x) { v.push($(this).find('input:checked').val() || null) }); }
              else if (t === 'Menjodohkan') { const raw = $(`#ans-in-${idx}`).val(); v = raw ? JSON.parse(raw) : []; }
              else { v = $(this).find('textarea').val(); }
              if (v !== null && v !== undefined) ans.push({ qid: qid, answer: v });
          });
          
          window.google.script.run.withSuccessHandler((res) => {
              window.examSubmitting = false; btn.prop('disabled', false).html('<i class="fas fa-check-circle me-1"></i> KIRIM JAWABAN');
              if (res.status === 'success') {
                  localStorage.removeItem('cbt_active_exam'); localStorage.removeItem(`ANS_${window.user.ID}_${window.activeExamId}`);
                  $('body').removeClass('exam-mode'); try { document.exitFullscreen().catch(()=>{}) } catch (e) {};
                  window.Swal.fire({
                      title: 'Selesai!', html: `<div class="mb-3 text-success" style="font-size: 4rem;"><i class="fas fa-check-circle"></i></div><h5 class="fw-bold">Jawaban Berhasil Dikirim</h5>`,
                      confirmButtonText: 'KEMBALI KE BERANDA', confirmButtonColor: '#1e3a8a', allowOutsideClick: false, allowEscapeKey: false
                  }).then(() => { 
                    document.getElementById('view-exam').classList.add('hidden'); 
                    document.getElementById('view-exam').style.display = 'none';
                    document.getElementById('view-dashboard').classList.remove('hidden'); 
                    document.getElementById('view-dashboard').style.display = 'flex';
                    window.loadPage('siswa-home'); 
                  });
              } else { window.Swal.fire('Gagal', res.msg, 'error'); }
          }).withFailureHandler((err) => {
              if (retryCount < 3) { setTimeout(() => window.processSubmission(retryCount + 1), 3000); } 
              else { window.examSubmitting = false; btn.prop('disabled', false); window.Swal.fire('Error', 'Gagal menghubungi server.', 'error'); }
          }).submitExam(window.user.ID, window.activeExamId, ans, window.violationCount);
      };

      window.matchClick = function(qIdx, side, itemIdx, el) { if(!window.matchState[qIdx]) window.matchState[qIdx] = { sel: null, pairs: [] }; const st = window.matchState[qIdx]; $(`#match-area-${qIdx} .match-${side}`).removeClass('selected'); $(el).addClass('selected'); if(side === 'l') { st.sel = { idx: itemIdx, el: el }; } else { if(st.sel) { st.pairs = st.pairs.filter(p => p.left !== st.sel.idx); st.pairs.push({ left: st.sel.idx, right: itemIdx, rightVal: decodeURIComponent($(el).data('val')) }); window.drawLines(qIdx); window.markAns(qIdx); st.sel = null; $(`#match-area-${qIdx} .match-item`).removeClass('selected'); window.saveAnsLocal($(`#sl-${qIdx}`).data('qid'), 'MATCH', qIdx); } } };
      window.drawLines = function(qIdx) { if(!window.matchState[qIdx]) return; const svg = document.getElementById(`svg-${qIdx}`); const container = document.getElementById(`match-area-${qIdx}`); if(!container || !svg) return; const rectC = container.getBoundingClientRect(); let html = ''; let answerArr = []; const leftCount = $(`#col-l-${qIdx}`).children().length; for(let k=0; k<leftCount; k++) answerArr[k] = null; $(`#match-area-${qIdx} .match-item`).removeClass('matched'); window.matchState[qIdx].pairs.forEach(p => { const elL = $(`#col-l-${qIdx}`).children().eq(p.left)[0]; const elR = $(`#col-r-${qIdx}`).children().eq(p.right)[0]; if(elL && elR) { const rL = elL.getBoundingClientRect(); const rR = elR.getBoundingClientRect(); const x1 = rL.right - rectC.left; const y1 = (rL.top + rL.height/2) - rectC.top; const x2 = rR.left - rectC.left; const y2 = (rR.top + rR.height/2) - rectC.top; html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#10b981" stroke-width="3" />`; $(elL).addClass('matched'); $(elR).addClass('matched'); answerArr[p.left] = p.rightVal; } }); svg.innerHTML = html; $(`#ans-in-${qIdx}`).val(JSON.stringify(answerArr)); };
      window.resetMatch = function(qIdx) { window.matchState[qIdx] = { sel: null, pairs: [] }; document.getElementById(`svg-${qIdx}`).innerHTML = ''; $(`#match-area-${qIdx} .match-item`).removeClass('matched selected'); $(`#ans-in-${qIdx}`).val(''); window.saveAnsLocal($(`#sl-${qIdx}`).data('qid'), 'MATCH', qIdx); };
      window.redrawMatchLines = function(qIdx, savedArr, rightItems) { if(!window.matchState[qIdx]) window.matchState[qIdx] = { sel: null, pairs: [] }; if(Array.isArray(savedArr)) { window.matchState[qIdx].pairs = []; savedArr.forEach((val, lIdx) => { if(val) { const rIdx = rightItems.indexOf(val); if(rIdx > -1) { window.matchState[qIdx].pairs.push({ left: lIdx, right: rIdx, rightVal: val }); } } }); window.drawLines(qIdx); } };
      
      // =================================================================
      // 9. EDITOR SOAL SUMMERNOTE & KUNCI JAWABAN
      // =================================================================
      window.manageQ = function(id) { 
          window.activeExamId = id; 
          window.openModal('modalQ'); 
          window.loadQList(); 
      };

      window.loadQList = function() {
          const container = document.getElementById('q-list-container');
          if(container) container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div><div class="mt-2 text-muted">Memuat Soal...</div></div>';
          
          window.google.script.run.withSuccessHandler(qs => {
              let html = ''; window.lastQuestionNum = 0; window.currentQuestionsData = qs || [];
              let topActions = `
              <div class="d-flex justify-content-end mb-3 gap-2 flex-wrap">
                  <button class="btn btn-outline-info shadow-sm" onclick="window.generateQuestionExcelTemplate()"><i class="fas fa-download"></i> Template Excel</button>
                  <label class="btn btn-primary shadow-sm m-0"><i class="fas fa-upload"></i> Upload Excel <input type="file" hidden accept=".xlsx,.xls" onchange="window.handleUploadQuestionsExcel(event)"></label>
                  <button class="btn btn-info text-white shadow-sm" onclick="window.previewAllQ()"><i class="fas fa-eye me-1"></i> Preview Semua</button>
                  <button class="btn btn-primary shadow-sm" onclick="window.downloadAllQ()"><i class="fas fa-download me-1"></i> Download Ujian</button>
              </div>`;
              if (qs && qs.length > 0) {
                  window.lastQuestionNum = Math.max(...qs.map(q => Number(q.Nomor) || 0));
                  qs.forEach((q, idx) => { html += window.renderQuestionBlock(q, idx); });
                  if(container) container.innerHTML = topActions + html; 
                  if(window.applyMathJax) window.applyMathJax();
              } else { if(container) container.innerHTML = topActions + '<div class="alert alert-info text-center">Belum ada soal. Klik Tambah Soal atau Upload Excel.</div>'; }
          }).withFailureHandler(err => {
              window.Swal.fire('Error', err.message, 'error');
          }).getExamQuestions(window.activeExamId);
      };

      window.renderQuestionBlock = function(q, idx) {
          const uid = q.QID ? q.QID : 'NEW_' + Math.random().toString(36).substr(2, 9);
          const nomor = q.Nomor || (idx + 1); const cleanPrev = (q.Pertanyaan || 'Soal Baru...').replace(/<[^>]+>/g, '').substring(0, 80) + '...';
          const safeJson = encodeURIComponent(JSON.stringify(q)); 
          return `<div class="card mb-4 border-0 shadow-sm q-block" id="block-${uid}" data-id="${uid}" data-q-obj="${safeJson}"><div class="card-header bg-white d-flex justify-content-between align-items-center py-3"><span class="badge bg-primary rounded-pill px-3">No. ${nomor}</span><div><button class="btn btn-sm btn-secondary me-2 text-white" onclick="window.toggleEditQ('${uid}')"><i class="fas fa-edit"></i> Edit</button><button class="btn btn-sm btn-outline-danger" onclick="window.deleteQBlock('${uid}')"><i class="fas fa-trash"></i></button></div></div><div class="card-body"><div class="q-preview mb-2 fw-bold text-muted">${cleanPrev}</div><div class="q-form hidden" id="form-${uid}"><form id="frm-q-${uid}" onsubmit="return false;"><input type="hidden" name="id" value="${q.QID || ''}"><div class="row g-2 mb-3"><div class="col-md-2"><label class="small fw-bold">No</label><input type="number" name="num" class="form-control" value="${nomor}"></div><div class="col-md-4"><label class="small fw-bold">Tipe</label><select name="type" class="form-select q-type-sel" onchange="window.renderAnsFields('${uid}', this.value)" id="type-${uid}"><option value="PGS" ${q.Tipe=='PGS'?'selected':''}>Pilihan Ganda</option><option value="PGK" ${q.Tipe=='PGK'?'selected':''}>PG Kompleks</option><option value="PGKK" ${q.Tipe=='PGKK'?'selected':''}>Benar Salah</option><option value="Menjodohkan" ${q.Tipe=='Menjodohkan'?'selected':''}>Menjodohkan</option><option value="Uraian" ${q.Tipe=='Uraian'?'selected':''}>Uraian</option></select></div><div class="col-md-2"><label class="small fw-bold">Skor</label><input type="number" step="0.1" name="score" class="form-control" value="${q.Skor || 10}"></div></div><label class="small fw-bold mb-1">Pertanyaan</label><textarea id="sn-${uid}" name="text">${q.Pertanyaan || ''}</textarea><div class="card mt-3 bg-light"><div class="card-body"><label class="small fw-bold mb-2">Jawaban & Kunci</label><div id="ans-area-${uid}"></div></div></div><div class="text-end mt-3"><button type="button" class="btn btn-secondary me-1" onclick="window.toggleEditQ('${uid}')">Tutup</button><button type="button" class="btn btn-success" onclick="window.saveQBlock('${uid}')"><i class="fas fa-save"></i> Simpan</button></div></form></div></div></div>`;
      };

      window.addNewQuestionBlock = function() {
          window.lastQuestionNum++; 
          const newBlockHTML = window.renderQuestionBlock({ Nomor: window.lastQuestionNum }, window.lastQuestionNum - 1);
          
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = newBlockHTML;
          const blockEl = tempDiv.firstElementChild;
          const uid = blockEl.getAttribute('data-id');
          
          document.getElementById('q-list-container').appendChild(blockEl);
          window.toggleEditQ(uid);
          
          const modalBody = document.querySelector('#modalQ .modal-body');
          if(modalBody) modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' });
      };

      window.toggleEditQ = function(uid) { 
          const form = $('#form-'+uid); 
          if (form.hasClass('hidden')) { 
              window.activeUid = uid; form.removeClass('hidden'); $('#block-'+uid).addClass('border-primary'); 
              
              const MathButton = function (context) {
                  const ui = $.summernote.ui;
                  return ui.button({
                      contents: '<i class="fas fa-square-root-alt"></i> Rumus', tooltip: 'Tambahkan Rumus Matematika',
                      click: function () {
                          window.Swal.fire({
                              title: 'Editor Rumus (LaTeX)', html: `<div class="text-start small mb-2 text-muted">Ketik format LaTeX manual:</div><textarea id="swal-math-input" class="form-control font-monospace" rows="3"></textarea>`,
                              showCancelButton: true, confirmButtonText: 'Sisipkan Rumus'
                          }).then((result) => { if (result.isConfirmed) { const mathText = document.getElementById('swal-math-input').value; if(mathText) context.invoke('editor.insertText', ` $$ ${mathText}$$ `); } });
                      }
                  }).render();
              };
              const snConfig = { height: 180, toolbar: [['style', ['bold', 'italic', 'underline', 'clear']], ['para', ['ul', 'ol']], ['insert', ['picture', 'table', 'link', 'math']]], buttons: { math: MathButton } };
              
              $('#sn-'+uid).summernote(snConfig); 
              window.renderAnsFields(uid, document.getElementById('type-'+uid).value);
          } else { 
              form.addClass('hidden'); $('#block-'+uid).removeClass('border-primary'); 
              $('#sn-'+uid).summernote('destroy'); $('#ans-area-'+uid+' .summernote-opt').each(function(){ $(this).summernote('destroy'); }); 
          } 
      };

      window.renderAnsFields = function(uid, type) { 
          const block = $('#block-'+uid); let qData = {}; 
          try { qData = JSON.parse(decodeURIComponent(block.attr('data-q-obj'))); } catch(e){} 
          const opts = (qData.Tipe === type) ? JSON.parse(qData.Options || "[]") : [];
          
          let rawKeys = qData.KeyAnswer || qData.Key || "[]";
          let keys = [];
          try { 
              let parsed = JSON.parse(rawKeys);
              keys = Array.isArray(parsed) ? parsed : [parsed];
          } catch(e) { keys = []; }
          
          $('#ans-area-'+uid+' .summernote-opt').each(function(){ $(this).summernote('destroy'); }); let h = '';
          
          // PERBAIKAN PENTING: Extractor DOM Text Murni untuk mencocokkan string kunci dan opsi secara presisi 100%
          const cleanStr = (s) => {
              if(s === null || s === undefined) return '';
              let div = document.createElement('div');
              div.innerHTML = String(s);
              let text = div.textContent || div.innerText || "";
              return text.replace(/\s+/g, '').trim().toLowerCase();
          };

          if (type === 'PGS' || type === 'PGK') { 
              const inputType = type === 'PGS' ? 'radio' : 'checkbox';
              h = `<button type="button" class="btn btn-outline-primary btn-sm mb-2" onclick="window.addOptRow('${uid}', '${inputType}')">+ Opsi</button><div id="opts-wrap-${uid}">`; 
              if(opts.length) {
                  opts.forEach(o => {
                      let isChecked = keys.some(k => cleanStr(k) === cleanStr(o)) ? 'checked' : '';
                      h += window.genOptRow(uid, inputType, o, isChecked);
                  });
              } else { h += window.genOptRow(uid, inputType); }
              h += '</div>'; 
          } else if (type === 'PGKK') { 
              h = `<table class="table table-sm"><thead><tr><th>Pernyataan</th><th>Kunci</th><th>X</th></tr></thead><tbody id="pgkk-tbody-${uid}">`; 
              if(opts.length) opts.forEach((o,i)=>h+=window.genPGKKRow(o,keys[i])); else h+=window.genPGKKRow(); h+=`</tbody></table><button type="button" class="btn btn-sm btn-info" onclick="window.addPGKKRowTo('${uid}')">+ Baris</button>`; 
          } else if (type === 'Menjodohkan') { 
              h = `<table class="table table-sm"><thead><tr><th>Kiri</th><th>Kanan (Kunci)</th><th>X</th></tr></thead><tbody id="match-tbody-${uid}">`;
              if(opts.length) opts.forEach((o,i)=>h+=window.genMatchRow(o,keys[i])); else h+=window.genMatchRow(); h+=`</tbody></table><button type="button" class="btn btn-sm btn-info" onclick="window.addMatchRowTo('${uid}')">+ Pasangan</button>`;
          } else if (type === 'Uraian') { 
              h = `<textarea class="form-control" name="essay_key" placeholder="Kata kunci penilaian (dipisah koma)">${keys.join(',')}</textarea>`; 
          } 
          document.getElementById('ans-area-'+uid).innerHTML = h; 
          
          const MathButtonSm = function (context) { const ui = $.summernote.ui; return ui.button({ contents: '<i class="fas fa-square-root-alt"></i>', tooltip: 'Rumus', click: function () { window.Swal.fire({ title: 'LaTeX', html: `<textarea id="swal-math-input" class="form-control"></textarea>`, showCancelButton: true }).then((result) => { if (result.isConfirmed) { const mathText = document.getElementById('swal-math-input').value; if(mathText) context.invoke('editor.insertText', ` $$ ${mathText}$$ `); } }); } }).render(); };
          $('#ans-area-'+uid+' .summernote-opt').summernote({ height: 100, toolbar: [['style', ['bold', 'italic']], ['insert', ['picture', 'math']]], buttons: { math: MathButtonSm } }); 
      };

      window.genOptRow = function(uid, type, val='', checked='') { return `<div class="d-flex align-items-start mb-2 ans-row gap-2"><div class="mt-2"><input type="${type}" name="k_${uid}" class="form-check-input" ${checked}></div><div class="flex-grow-1"><textarea class="summernote-opt">${val}</textarea></div><button type="button" class="btn btn-outline-danger mt-1" onclick="window.removeOptRow(this)">X</button></div>`; };
      window.genPGKKRow = function(q='', k='B') { return `<tr><td><textarea class="summernote-opt pgkk-q">${q}</textarea></td><td><select class="form-select pgkk-k"><option value="B" ${k=='B'?'selected':''}>Benar</option><option value="S" ${k=='S'?'selected':''}>Salah</option></select></td><td><button type="button" class="btn btn-danger btn-sm" onclick="window.jQuery(this).closest('tr').remove()">X</button></td></tr>`; };
      window.genMatchRow = function(l='', r='') { return `<tr><td><textarea class="summernote-opt match-l">${l}</textarea></td><td><textarea class="summernote-opt match-r">${r}</textarea></td><td><button type="button" class="btn btn-danger btn-sm" onclick="window.jQuery(this).closest('tr').remove()">X</button></td></tr>`; };

      window.addOptRow = function(uid, t) { const el = $(window.genOptRow(uid, t));$('#opts-wrap-'+uid).append(el); const MathButtonSm = function (context) { const ui = $.summernote.ui; return ui.button({ contents: '<i class="fas fa-square-root-alt"></i>', click: function () { window.Swal.fire({ title: 'LaTeX', html: `<textarea id="swal-math-input" class="form-control"></textarea>`, showCancelButton: true }).then((r) => { if (r.isConfirmed) { const txt = document.getElementById('swal-math-input').value; if(txt) context.invoke('editor.insertText', ` $$ ${txt}$$ `); } }); } }).render(); }; el.find('.summernote-opt').summernote({ height: 100, toolbar: [['style', ['bold', 'italic']], ['insert', ['picture', 'math']]], buttons: { math: MathButtonSm } }); };
      window.addPGKKRowTo = function(uid) { const el = $(window.genPGKKRow());$('#pgkk-tbody-'+uid).append(el); const MathButtonSm = function (context) { const ui = $.summernote.ui; return ui.button({ contents: '<i class="fas fa-square-root-alt"></i>', click: function () { window.Swal.fire({ title: 'LaTeX', html: `<textarea id="swal-math-input" class="form-control"></textarea>`, showCancelButton: true }).then((r) => { if (r.isConfirmed) { const txt = document.getElementById('swal-math-input').value; if(txt) context.invoke('editor.insertText', ` $$ ${txt}$$ `); } }); } }).render(); }; el.find('.summernote-opt').summernote({ height: 100, toolbar: [['style', ['bold', 'italic']], ['insert', ['picture', 'math']]], buttons: { math: MathButtonSm } }); };
      window.addMatchRowTo = function(uid) { const el = $(window.genMatchRow());$('#match-tbody-'+uid).append(el); const MathButtonSm = function (context) { const ui = $.summernote.ui; return ui.button({ contents: '<i class="fas fa-square-root-alt"></i>', click: function () { window.Swal.fire({ title: 'LaTeX', html: `<textarea id="swal-math-input" class="form-control"></textarea>`, showCancelButton: true }).then((r) => { if (r.isConfirmed) { const txt = document.getElementById('swal-math-input').value; if(txt) context.invoke('editor.insertText', ` $$ ${txt}$$ `); } }); } }).render(); }; el.find('.summernote-opt').summernote({ height: 100, toolbar: [['style', ['bold', 'italic']], ['insert', ['picture', 'math']]], buttons: { math: MathButtonSm } }); };
      window.removeOptRow = function(btn) { $(btn).closest('.ans-row').remove(); };
      window.saveQBlock = function(uid) {
          const form = $('#frm-q-'+uid); 
          const type = form.find('select[name="type"]').val(); 
          const text = $('#sn-'+uid).summernote('code');
          const score = form.find('input[name="score"]').val(); 
          const num = form.find('input[name="num"]').val();
          const id = form.find('input[name="id"]').val(); 
          let opts=[], keys=[], keyIndices=[];
          
          if (type === 'PGS' || type === 'PGK') { 
              $('#opts-wrap-'+uid+' .ans-row').each(function(){ 
                  const v = $(this).find('.summernote-opt').summernote('code'); 
                  if(v && v !== '<p><br></p>'){ 
                      opts.push(v); 
                      // FIX: Selector akurat untuk radio/checkbox
                      if($(this).find('input[type="radio"], input[type="checkbox"]').is(':checked')) { 
                          keys.push(v); 
                          keyIndices.push(opts.length - 1); 
                      } 
                  } 
              });
          } else if(type==='PGKK') { 
              $('#pgkk-tbody-'+uid+' tr').each(function(){ 
                  const q = $(this).find('.pgkk-q').summernote('code'); 
                  if(q){ opts.push(q); keys.push($(this).find('.pgkk-k').val()); } 
              });
          } else if(type==='Menjodohkan') { 
              $('#match-tbody-'+uid+' tr').each(function(){ 
                  const l = $(this).find('.match-l').summernote('code'); 
                  const r = $(this).find('.match-r').summernote('code'); 
                  if(l && r && l !== '<p><br></p>' && r !== '<p><br></p>'){ opts.push(l); keys.push(r); } 
              });
          } else { 
              keys = form.find('textarea[name="essay_key"]').val().split(','); 
          } 
          
          const payload = { id:id, num:num, type:type, text:text, options:opts, key:keys, keyIndices:keyIndices, score:score, userId: window.user.ID }; 
          
          const btn = form.find('button.btn-success');
          const origText = btn.html();
          btn.prop('disabled',true).html('<i class="fas fa-spinner fa-spin"></i> Menyimpan...');
          
          window.google.script.run.withSuccessHandler(res=>{
              btn.prop('disabled',false).html(origText);
              if(res.status==='success'){
                  window.toast('success','Soal Disimpan!');
                  window.toggleEditQ(uid); // Tutup form edit
                  
                  // PERBAIKAN FATAL: Render ulang seluruh list langsung dari Server / Database!
                  // Ini 100% menjamin data kunci jawaban muncul dan tidak rusak oleh cache DOM.
                  window.loadQList(); 
              } else window.Swal.fire('Error',res.msg,'error');
          }).withFailureHandler(err => { 
              btn.prop('disabled',false).html(origText); 
              window.Swal.fire('Error', err.message, 'error'); 
          }).adminSaveSingleQuestion(window.activeExamId, payload);
      };

      window.deleteQBlock = function(uid) {
          const id=$('#block-'+uid).find('input[name="id"]').val();
          if(!id){ $('#block-'+uid).remove(); return; }
          window.Swal.fire({title:'Hapus Soal?',icon:'warning',showCancelButton:true}).then(r=>{
              if(r.isConfirmed){
                  $('#block-'+uid).fadeOut();
                  window.google.script.run.withFailureHandler(err=>{ window.Swal.fire('Error', err.message, 'error')}).adminDeleteQuestion(id, window.user.ID, window.user.Role);
                  window.currentQuestionsData = window.currentQuestionsData.filter(q => String(q.QID) !== String(id));
              }
          });
      };

      window.generateQuestionExcelTemplate = function() {
          const ws_data = [
              ["Nomor", "Tipe", "Skor", "Pertanyaan", "Opsi (Pisahkan dgn |)", "Kunci (Pisahkan dgn |)"],
              [1, "PGS", 10, "Apa ibukota Indonesia?", "Jakarta|Bandung|Bali", "Jakarta"]
          ];
          const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
          const wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, "TemplateSoal");
          window.XLSX.writeFile(wb, "Template_Upload_Soal.xlsx");
      };

      window.handleUploadQuestionsExcel = function(e) {
          const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
          reader.onload = function(evt) {
              const data = evt.target.result; const workbook = window.XLSX.read(data, {type: 'binary'});
              const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const json = window.XLSX.utils.sheet_to_json(worksheet);
              let formattedData = json.map(row => {
                  let opsRaw = row['Opsi (Pisahkan dgn |)'] ? String(row['Opsi (Pisahkan dgn |)']).split('|') : [];
                  let keyRaw = row['Kunci (Pisahkan dgn |)'] ? String(row['Kunci (Pisahkan dgn |)']).split('|') : [];
                  return { num: row['Nomor'] || 1, type: row['Tipe'] || 'PGS', score: row['Skor'] || 10, text: row['Pertanyaan'] || '', options: opsRaw, key: keyRaw };
              }).filter(q => q.text !== '');
              if(formattedData.length === 0) { window.Swal.fire('Error', 'Format tidak valid.', 'error'); return; }
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(res => {
                  window.showLoad(false); if(res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadQList(); } else window.Swal.fire('Gagal', res.msg, 'error');
              }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminBatchSaveQuestions(window.activeExamId, formattedData, window.user.ID);
          };
          reader.readAsBinaryString(file);
      };

      window.previewAllQ = function() {
          const htmlContent = window.generateAllQHTML();
          if(!htmlContent) { window.Swal.fire('Kosong', 'Belum ada soal untuk dipreview.', 'info'); return; }
          if(document.getElementById('modalPreviewQ') === null) {
              const div = document.createElement('div');
              div.innerHTML = `<div class="modal fade" id="modalPreviewQ" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header bg-info text-white"><h5 class="modal-title fw-bold"><i class="fas fa-desktop me-2"></i> Preview Seluruh Soal</h5><button type="button" class="btn-close btn-close-white" onclick="window.closeModal('modalPreviewQ')"></button></div><div class="modal-body bg-light" id="preview-q-body"></div></div></div></div>`;
              document.body.appendChild(div.firstChild);
          }
          document.getElementById('preview-q-body').innerHTML = htmlContent; 
          window.openModal('modalPreviewQ');
          if(window.applyMathJax) window.applyMathJax();
      };

      window.downloadAllQ = function() {
          const htmlContent = window.generateAllQHTML();
          if(!htmlContent) { window.Swal.fire('Kosong', 'Belum ada soal untuk didownload.', 'info'); return; }
          const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Preview Soal Ujian</title><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet"><script src="https://polyfill.io/v3/polyfill.min.js?features=es6"><\/script><script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"><\/script><style>body { font-family: 'Poppins', Arial, sans-serif; background-color: #f1f5f9; padding: 40px; margin: 0; display:flex; justify-content:center; } .container { max-width: 800px; width: 100%; } img { max-width: 100%; height: auto; border-radius: 6px; margin: 5px 0; }</style></head><body><div class="container">${htmlContent}</div><script>window.onload = function() { setTimeout(window.print, 1000); }<\/script></body></html>`;
          const blob = new Blob([html], {type: "text/html;charset=utf-8"}); const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `Soal_Ujian_Lengkap.html`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      };

      window.generateAllQHTML = function() {
          let h = '';
          window.currentQuestionsData.forEach(q => { h += window.generateQHTML(q); });
          return h;
      };

      window.generateQHTML = function(q) {
          let inp = '';
          if(q.Tipe==='PGKK') {
              const opts = JSON.parse(q.Options||"[]");
              inp = `<table style="width:100%; border-collapse: collapse; margin-top:15px; background:white;" border="1"><thead><tr style="background:#f8f9fa;"><th style="padding:10px; text-align:left;">PERNYATAAN</th><th width="15%" style="padding:10px; text-align:center;">BENAR</th><th width="15%" style="padding:10px; text-align:center;">SALAH</th></tr></thead><tbody>`;
              opts.forEach((o,x)=> { inp+=`<tr><td style="padding:10px;">${o}</td><td style="padding:10px; text-align:center; vertical-align:middle;"><input type="radio" name="ans-${q.QID}-${x}" value="B" style="transform:scale(1.2);"></td><td style="padding:10px; text-align:center; vertical-align:middle;"><input type="radio" name="ans-${q.QID}-${x}" value="S" style="transform:scale(1.2);"></td></tr>`; });
              inp += `</tbody></table>`;
          } else if(q.Tipe==='Menjodohkan') {
              const lItems = JSON.parse(q.Options||"[]"); let rItems = []; try { rItems = [...JSON.parse(q.KeyAnswer||q.Key||"[]")].sort(() => Math.random() - 0.5); } catch(e){}
              inp = `<div style="display:flex; justify-content:space-between; gap:20px; margin-top:15px;"><div style="flex:1; display:flex; flex-direction:column; gap:10px;">${lItems.map((t)=>`<div style="border:2px solid #e2e8f0; padding:10px; border-radius:8px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.1);">${t}</div>`).join('')}</div><div style="flex:1; display:flex; flex-direction:column; gap:10px;">${rItems.map((t)=>`<div style="border:2px solid #e2e8f0; padding:10px; border-radius:8px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.1);">${t}</div>`).join('')}</div></div>`;
          } else if(q.Tipe.includes('PG')) {
              const opts = JSON.parse(q.Options||"[]");
              opts.forEach(o => { inp += `<label style="display:flex; align-items:center; border:1px solid #e2e8f0; padding:15px; margin-bottom:10px; border-radius:6px; background:#fff; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05);"><input type="${q.Tipe==='PGK'?'checkbox':'radio'}" name="ans-${q.QID}" style="margin-right:15px; transform:scale(1.5);"><div style="flex-grow:1; margin:0;">${o}</div></label>`; });
          } else {
              inp = `<textarea style="width:100%; padding:15px; border:1px solid #e2e8f0; border-radius:6px; font-family:inherit; resize:vertical;" rows="5" placeholder="Ketik jawaban Anda di sini..."></textarea>`;
          }
          return `<div style="font-family: 'Poppins', Arial, sans-serif; padding:25px; background:#f8fafc; border-radius:12px; color:#1e293b; border:1px solid #e2e8f0; margin-bottom:20px;"><div style="background:var(--primary); color:white; display:inline-block; padding:5px 15px; border-radius:15px; font-size:12px; font-weight:bold; margin-bottom:20px; box-shadow:0 2px 4px rgba(126,34,206,0.2);">Soal No. ${q.Nomor||''}</div><div style="margin-bottom:20px; font-size:16px; line-height:1.6; word-wrap: break-word;">${q.Pertanyaan}</div>${inp}</div>`;
      };

    };

    // =================================================================
    // 10. INISIALISASI AUTO-LOGIN & PAKSA HAPUS CACHE LAMA
    // =================================================================
    initApp();

    const checkAutoLogin = () => {
        if (!window.showLoad) {
            setTimeout(checkAutoLogin, 100);
            return;
        }

        // PERBAIKAN FINAL: Paksa browser membersihkan cache saat pertama reload (v22_final_fix)
        // Data user dipertahankan, mencegah error render komponen.
        const APP_VERSION = 'v22_final_fix';
        if(localStorage.getItem('cbt_app_version') !== APP_VERSION) {
            const savedUser = localStorage.getItem('cbt_user');
            localStorage.clear();
            sessionStorage.clear();
            if(savedUser) localStorage.setItem('cbt_user', savedUser);
            localStorage.setItem('cbt_app_version', APP_VERSION);
            window.location.reload(true);
            return;
        }

        const savedUser = localStorage.getItem('cbt_user');
        if(savedUser) {
            window.user = JSON.parse(savedUser);
            const logoEl = document.querySelector('#logo-container img');
            if (logoEl) logoEl.src = window.user.LogoUrl || window.LOGO_BARU;
            
            const authView = document.getElementById('view-auth');
            const dashView = document.getElementById('view-dashboard');
            if(authView) { authView.classList.add('hidden'); authView.style.display = 'none'; }
            if(dashView) { dashView.classList.remove('hidden'); dashView.style.display = 'flex'; }
            
            window.initDash();
            if(window.checkResumeExam) window.checkResumeExam();
        } else {
            window.showLoad(false);
            const authView = document.getElementById('view-auth');
            if(authView) { authView.classList.remove('hidden'); authView.style.display = 'flex'; }
        }
    };
    
    setTimeout(checkAutoLogin, 300);

  }, [isMounted]);

  // Layar Pemuatan Utama untuk Mengelabui Vercel Hydration
  if (!isMounted) return <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f1f5f9' }}></div>;

 return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
      <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/summernote@0.8.18/dist/summernote-lite.min.css" rel="stylesheet" />

      <Script src="https://code.jquery.com/jquery-3.6.0.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/sweetalert2@11" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/summernote@0.8.18/dist/summernote-lite.min.js" strategy="afterInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" strategy="afterInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/7.12.1/polyfill.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" strategy="lazyOnload" />

      <div dangerouslySetInnerHTML={{ __html: `
        <style>
          :root { --primary: #7e22ce; --secondary: #a855f7; --accent: #84cc16; --bg-body: #f8fafc; }
          body { font-family: 'Poppins', sans-serif; background-color: var(--bg-body); color: #1e293b; overflow-x: hidden; margin: 0; }
          body.exam-mode { overflow: hidden; user-select: none; }
          .hidden { display: none !important; }
          
          /* FIX Z-INDEX POPUP AGAR SELALU MUNCUL DI ATAS DASHBOARD */
          .modal { z-index: 10505 !important; }
          .modal-backdrop { z-index: 10500 !important; }
          .note-editor .modal { z-index: 10510 !important; }
          .swal2-container { z-index: 99999 !important; }

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

          /* LOGIN LAYOUT */
          .auth-wrapper { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(126,34,206,0.95) 0%, rgba(132,204,22,0.95) 100%); padding: 20px; position: relative; }
          .auth-card-split { display: flex; background: white; border-radius: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); max-width: 900px; width: 100%; overflow: hidden; z-index: 2; margin-bottom: 20px; min-height: 400px; }
          .auth-left { flex: 1; background: linear-gradient(135deg, rgba(126,34,206,1) 0%, rgba(132,204,22,1) 100%); color: white; padding: 40px; display: flex; flex-direction: column; justify-content: center; }
          .auth-right { flex: 1; padding: 40px; display: flex; flex-direction: column; justify-content: center; background: white; }
          .auth-footer { text-align: center; color: rgba(255,255,255,0.9); font-size: 0.875rem; z-index: 3; width: 100%; font-weight: 500; }
          @media (max-width: 768px) { .auth-card-split { flex-direction: column; } .auth-left { padding: 30px; text-align: center; } .auth-left ul li { justify-content: center; } }
          .auth-left h2 { font-weight: 700; margin-bottom: 15px; }
          .auth-left p { font-size: 14px; opacity: 0.9; margin-bottom: 20px; line-height: 1.6; }
          .auth-left ul { list-style: none; padding: 0; margin: 0; }
          .auth-left ul li { margin-bottom: 15px; font-size: 14px; display: flex; align-items: center; gap: 12px; }

          /* DASHBOARD LAYOUT */
          .wrapper { display: flex; width: 100%; align-items: stretch; position: relative; }
          #sidebar { min-width: 260px; max-width: 260px; background: #3b0764; color: #fff; min-height: 100vh; position: fixed; z-index: 1040; transition: all 0.3s; left: 0; top: 0; }
          #sidebar.active { left: -260px; }
          #content { width: 100%; margin-left: 260px; padding: 20px; transition: all 0.3s; min-height: 100vh; display: flex; flex-direction: column; }
          #sidebar ul li a { padding: 15px 25px; display: block; color: #cbd5e1; text-decoration: none; border-left: 4px solid transparent; cursor: pointer; }
          #sidebar ul li a:hover, #sidebar ul li a.active { background: rgba(255,255,255,0.05); color: #fff; border-left-color: var(--accent); }
          @media (max-width: 768px) { #sidebar { left: -260px; } #sidebar.active { left: 0; } #content { margin-left: 0; padding: 15px; } .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1030; display: none; } .overlay.active { display: block; } }
          
          /* EXAM LAYOUT */
          #view-exam { position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; z-index: 1035; background: #f8fafc; overflow: hidden; display: flex; flex-direction: column; }
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
          
          /* LOADING SPINNER */
          .loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
          .spinner { width: 50px; height: 50px; border: 5px solid #e2e8f0; border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { 100% { transform: rotate(360deg); } }
        </style>

        <div id="loader" class="loader hidden"><div class="spinner"></div></div>
        <div id="sidebar-overlay" class="overlay" onclick="window.toggleSidebar()"></div>
        
        <!-- LAYAR LOGIN SPLIT -->
        <div id="view-auth" class="auth-wrapper" style="display:none;">
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
                        <img src="https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk" class="mb-3 rounded" width="100" alt="Logo" id="logo-container">
                        <h4 class="fw-bold text-center text-primary">BELAJAR INOVASI</h4>
                        <p class="small text-muted mt-1">Aplikasi Ujian Berbasis Komputer</p>
                    </div>
                    <!-- Form Native Prevent Default -->
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

        <!-- LAYAR DASHBOARD UTAMA -->
        <div id="view-dashboard" class="hidden wrapper" style="display:none;">
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
                    <li><a onclick="window.handleResetCache()" class="nav-link text-warning mt-3 border-top pt-3" style="border-color: #581c87 !important;"><i class="fas fa-bolt me-2"></i>Reset Cache CBT</a></li>
                </ul>
                <ul class="list-unstyled components hidden" id="menu-guru">
                    <li><a onclick="window.loadPage('admin-home')" class="nav-link active"><i class="fas fa-home me-2"></i>Dashboard</a></li>
                    <li><a onclick="window.loadPage('admin-users')" class="nav-link"><i class="fas fa-users me-2"></i>Data Peserta</a></li>
                    <li><a onclick="window.loadPage('admin-ujian')" class="nav-link"><i class="fas fa-file-alt me-2"></i>Bank Soal</a></li>
                    <li><a onclick="window.loadPage('hasil-rekap')" class="nav-link"><i class="fas fa-poll me-2"></i>Hasil Nilai</a></li>
                    <li><a onclick="window.loadPage('guru-monitoring')" class="nav-link"><i class="fas fa-desktop me-2"></i>Live Monitor</a></li>
                    <li><a onclick="window.loadPage('admin-administrasi')" class="nav-link text-info"><i class="fas fa-print me-2"></i>Cetak Administrasi</a></li>
                    <li><a onclick="window.handleResetCache()" class="nav-link text-warning mt-3 border-top pt-3" style="border-color: #581c87 !important;"><i class="fas fa-bolt me-2"></i>Reset Cache CBT</a></li>
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

        <div id="view-exam" class="hidden" style="display:none;">
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

        <!-- MODAL UJIAN -->
        <div class="modal fade" id="modalExam" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white"><h5 class="modal-title">Konfigurasi Ujian</h5><button class="btn-close btn-close-white" onclick="window.closeModal('modalExam')"></button></div>
                    <div class="modal-body">
                        <form id="frm-exam" onsubmit="event.preventDefault(); window.saveExam(); return false;" action="javascript:void(0);">
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

        <!-- MODAL SOAL -->
        <div class="modal fade" id="modalQ" tabindex="-1">
            <div class="modal-dialog modal-fullscreen">
                <div class="modal-content bg-light">
                    <div class="modal-header bg-white shadow-sm">
                        <h5 class="modal-title fw-bold text-primary">Editor Soal</h5>
                        <button class="btn-close" onclick="window.closeModal('modalQ')"></button>
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

        <!-- MODAL USER -->
        <div class="modal fade" id="modalUser" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white"><h5 class="modal-title">User Editor</h5><button class="btn-close btn-close-white" onclick="window.closeModal('modalUser')"></button></div>
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

        <!-- MODAL KOREKSI -->
        <div class="modal fade" id="modalKoreksi" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-info text-white"><h5 class="modal-title fw-bold"><i class="fas fa-edit me-2"></i>Koreksi Jawaban Siswa</h5><button class="btn-close btn-close-white" onclick="window.closeModal('modalKoreksi')"></button></div>
                    <div class="modal-body bg-light" id="kor-body"></div>
                    <div class="modal-footer bg-white border-top">
                        <button class="btn btn-secondary px-4" onclick="window.closeModal('modalKoreksi')">Tutup</button>
                        <button class="btn btn-success px-4 shadow-sm" id="btn-save-kor" onclick="window.saveKoreksi()">Simpan Perubahan</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- MODAL KATROL -->
        <div class="modal fade" id="modalKatrol" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-warning"><h5 class="modal-title">Katrol Nilai Massal</h5><button class="btn-close" onclick="window.closeModal('modalKatrol')"></button></div>
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
      ` }} />
    </>
  );
}
