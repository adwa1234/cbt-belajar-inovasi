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

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let finalBeepOsc = null;
    let beepInterval = null;

    // =================================================================
    // 2. FUNGSI INISIALISASI (MENUNGGU SCRIPT SIAP)
    // =================================================================
    const initApp = () => {
      // Tunggu library Next.js <Script> termuat sempurna
      if (!window.jQuery || !window.Swal || !window.XLSX) {
        setTimeout(initApp, 100);
        return;
      }

      const $ = window.jQuery;

      // =================================================================
      // 3. FUNGSI NATIVE UI & KONTROL MODAL BOOTSTRAP
      // =================================================================
      window.showLoad = function(show) {
          const loader = document.getElementById('loader');
          if (loader) {
              if (show) loader.classList.remove('hidden');
              else loader.classList.add('hidden');
          }
      };

      window.openModal = function(id) {
          const el = document.getElementById(id);
          if (!el) return;
          if (window.bootstrap) {
              const modalInstance = window.bootstrap.Modal.getOrCreateInstance(el);
              modalInstance.show();
          } else {
              $(el).modal('show');
          }
          // Paksa Z-Index ke Lapisan Terdepan
          setTimeout(() => {
              document.querySelectorAll('.modal-backdrop').forEach(b => { b.style.zIndex = '10500'; });
              el.style.zIndex = '10505';
          }, 150);
      };

      window.closeModal = function(id) {
          const el = document.getElementById(id);
          if (!el) return;
          if (window.bootstrap) {
              const modalInstance = window.bootstrap.Modal.getInstance(el);
              if(modalInstance) modalInstance.hide();
          } else {
              $(el).modal('hide');
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
      // 4. PROXY API TURSO (DIJAMIN STABIL)
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
      // 5. LOGIKA HALAMAN, LOGIN & MENU (ANTI TUMPANG TINDIH)
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
    if(window.showLoad) window.showLoad(false); // Tambahkan baris ini
    if(!window.user) return;
    
          // 1. Tampilkan Dashboard & Sembunyikan Login
          const viewAuth = document.getElementById('view-auth');
          const viewDash = document.getElementById('view-dashboard');
          if(viewAuth) { viewAuth.classList.add('hidden'); viewAuth.style.display = 'none'; }
          if(viewDash) { viewDash.classList.remove('hidden'); viewDash.style.display = 'flex'; }
          
          // 2. Set Informasi User
          const elName = document.getElementById('u-name-disp');
          if(elName) elName.innerText = window.user.Nama;
          
          const role = String(window.user.Role || '').trim().toLowerCase(); 
          const elRole = document.getElementById('user-role-disp');
          if(elRole) elRole.innerText = role.toUpperCase();
          
          // 3. FIX UTAMA: Paksa sembunyikan SEMUA menu sidebar lebih dulu
          const menuAdmin = document.getElementById('menu-admin');
          const menuGuru = document.getElementById('menu-guru');
          const menuSiswa = document.getElementById('menu-siswa');
          
          if(menuAdmin) { menuAdmin.style.display = 'none'; menuAdmin.classList.add('hidden'); }
          if(menuGuru) { menuGuru.style.display = 'none'; menuGuru.classList.add('hidden'); }
          if(menuSiswa) { menuSiswa.style.display = 'none'; menuSiswa.classList.add('hidden'); }
          
          // 4. Tampilkan HANYA menu yang sesuai dengan Role dan arahkan halamannya
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
          
          // MEMBERSIHKAN LAYAR LANGSUNG AGAR TIDAK TUMPANG TINDIH
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
              
              // FIX: Sembunyikan semua menu saat logout
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
      // 6. RENDER KONTEN (PENGGANTIAN DIV NATIVE)
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
                      const safeE = encodeURIComponent(JSON.stringify(e));
                      const actionButtons = isOwner ? `<button class="btn btn-sm btn-outline-dark flex-fill" onclick="window.openExamModal('${safeE}')">Edit</button> <button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.manageQ('${e.ExamID}')"><i class="fas fa-list me-1"></i> Soal</button> <button class="btn btn-sm btn-danger" onclick="window.delExam('${e.ExamID}')"><i class="fas fa-trash"></i></button>` : `<div class="alert alert-light small m-0 p-1 text-center w-100">Read Only</div>`;
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
              area.innerHTML = h;
          } catch (err) {
              console.error("Render Content Error: ", err);
              const area = document.getElementById('content-area');
              if(area) area.innerHTML = `<div class="alert alert-danger">Error memproses data: ${err.message}.</div>`;
          }
      };

      // =================================================================
      // 7. FUNGSI PENYIMPANAN DATA (TURSO) & MODAL DATA
      // =================================================================
      window.openExamModal = function(str) {
          document.getElementById('frm-exam').reset();
          document.getElementById('ex-id').value = '';
          let d = null;
          if(str) {
              d = JSON.parse(decodeURIComponent(str));
              document.getElementById('ex-id').value = d.ExamID || '';
              document.getElementById('ex-judul').value = d.Judul || '';
              document.getElementById('ex-mapel').value = d.Mapel || '';
              document.getElementById('ex-durasi').value = d.Durasi || '';
              document.getElementById('ex-limit').value = d.LimitTries || 1;
              document.getElementById('ex-start').value = d.StartDate ? d.StartDate.replace(' ','T') : '';
              document.getElementById('ex-end').value = d.EndDate ? d.EndDate.replace(' ','T') : '';
              document.getElementById('ex-token').value = d.Token || '';
              document.getElementById('ex-randomQ').checked = d.RandomQ === 'Yes';
              document.getElementById('ex-showStats').checked = d.ShowStats === 'Yes';
              document.getElementById('ex-violations').value = d.MaxViolations || 3;
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
              if (selectedKls.length === 0) {
                  window.Swal.fire('Error', 'Pilih minimal 1 target kelas!', 'error'); return;
              }
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
              if(res.status === 'success') {
                  window.closeModal('modalExam');
                  window.google.script.run.withSuccessHandler(res2 => {
                      btn.innerHTML = origBtn; btn.disabled = false;
                      if (res2.status === 'success') { 
                          window.gData = res2.data; window.renderContent('admin-ujian'); window.toast('success', 'Jadwal Disimpan!'); 
                      } else { window.Swal.fire('Gagal', res2.msg, 'error'); }
                  }).withFailureHandler(err => { btn.innerHTML = origBtn; btn.disabled = false; window.Swal.fire('Error', err.message, 'error'); }).getDashboardData(window.user.Role, window.user.ID, window.user.Kelas);
              } else { 
                  btn.innerHTML = origBtn; btn.disabled = false;
                  window.Swal.fire('Gagal', res.msg, 'error'); 
              }
          }).withFailureHandler(err => { btn.innerHTML = origBtn; btn.disabled = false; window.Swal.fire('Error', err.message, 'error'); }).adminSaveExam(d);
      };

      window.delExam = function(id){ window.Swal.fire({title:'Hapus Jadwal?', icon:'warning', showCancelButton:true}).then(r=>{if(r.isConfirmed) { window.showLoad(true); window.google.script.run.withSuccessHandler(()=>{window.showLoad(false); window.loadPage('admin-ujian')}).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error')}).adminDeleteExam(id, window.user.ID, window.user.Role); } }) };

      // --- USER & REKAP ---
      window.openUserModal = function(str) {
          document.getElementById('frm-user').reset(); document.getElementById('mu-id').value = '';
          if(str) {
              const u = JSON.parse(decodeURIComponent(str));
              document.getElementById('mu-id').value = u.ID || '';
              document.getElementById('mu-nama').value = u.Nama || '';
              document.getElementById('mu-user').value = u.Username || '';
              document.getElementById('mu-pass').value = u.Password || '';
              document.getElementById('mu-role').value = u.Role || 'siswa';
              document.getElementById('mu-kelas').value = u.Kelas || '';
              document.getElementById('mu-sekolah').value = u.Sekolah || '';
          }
          window.openModal('modalUser');
      };

      window.saveUser = function() {
          const d = {
              id: document.getElementById('mu-id').value,
              nama: document.getElementById('mu-nama').value,
              username: document.getElementById('mu-user').value,
              password: document.getElementById('mu-pass').value,
              role: document.getElementById('mu-role').value,
              kelas: document.getElementById('mu-kelas').value,
              sekolah: document.getElementById('mu-sekolah').value
          };
          const btn = document.querySelector('#frm-user button[type="submit"]');
          const origBtn = btn.innerHTML;
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
          btn.disabled = true;

          window.google.script.run.withSuccessHandler(()=>{
              btn.innerHTML = origBtn; btn.disabled = false;
              window.closeModal('modalUser'); window.loadPage('admin-users');
          }).withFailureHandler(err => {
              btn.innerHTML = origBtn; btn.disabled = false; window.Swal.fire('Error', err.message, 'error');
          }).adminManageUser('save', d);
      };

      window.delUser = function(id){ window.Swal.fire({title:'Hapus User?', icon:'warning', showCancelButton:true, confirmButtonColor: '#d33'}).then(r=>{if(r.isConfirmed) { window.showLoad(true); window.google.script.run.withSuccessHandler(()=>{window.loadPage('admin-users');}).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error')}).adminManageUser('delete',{id:id}); } }) };

      window.openKatrolModal = function() { window.openModal('modalKatrol'); };

      window.applyKatrolMassal = function() {
          const katrolInput = document.getElementById('katrol-value');
          const addVal = katrolInput ? parseFloat(katrolInput.value) || 0 : 0;
          if(addVal === 0) { window.Swal.fire('Perhatian', 'Masukkan nilai katrol yang valid.', 'warning'); return; }
          if(!window.currentFilteredData || window.currentFilteredData.length === 0) { window.Swal.fire('Data Kosong', 'Tidak ada data di tabel untuk dikatrol.', 'info'); return; }
          
          window.Swal.fire({ title: 'Konfirmasi Katrol Nilai', text: `Anda yakin menambahkan nilai sebesar ${addVal} ke${window.currentFilteredData.length} siswa di tabel ini?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Eksekusi', }).then((result) => {
              if(result.isConfirmed) { 
                  window.showLoad(true); const rids = window.currentFilteredData.map(d => d.ResultID); 
                  window.google.script.run.withSuccessHandler(res => { 
                      window.showLoad(false); window.closeModal('modalKatrol'); 
                      if (res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('hasil-rekap'); } 
                      else { window.Swal.fire('Gagal', res.msg, 'error'); } 
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminKatrolMassal(rids, addVal); 
              }
          });
      };

      window.openKoreksi = function(rid) {
          const d = window.recapDataStore[rid]; if (!d) return;
          let detailArr = []; try { detailArr = JSON.parse(d.detail); } catch(e){}
          let html = `<input type="hidden" id="kor-rid" value="${rid}"><div class="alert alert-info border-0 shadow-sm">Siswa: <b>${d.nama}</b><br>Ujian: <b>${d.ujian}</b></div>`;
          html += `<div class="alert alert-warning mb-3">Total Nilai Saat Ini: <b class="fs-5">${d.nilai}</b><br>Anda dapat memodifikasi skor per soal di bawah ini.</div>`;
          
          detailArr.forEach((item, index) => {
              let no = item.i !== undefined ? item.i : item[0]; let score = item.s !== undefined ? item.s : item[1]; let type = item.t || 'Objektif'; let ans = item.a !== undefined ? item.a : ''; let max = item.m !== undefined ? item.m : 0;
              html += `<div class="card mb-2 border-0 shadow-sm"><div class="card-body p-3"><div class="d-flex justify-content-between align-items-center mb-2"><strong class="text-primary">Soal No. ${no} <span class="badge bg-secondary ms-1">${type}</span></strong><div class="fw-bold d-flex align-items-center">Skor: <input type="number" step="0.1" class="form-control form-control-sm d-inline w-auto kor-score ms-2" data-idx="${index}" value="${score}" style="max-width: 80px;"> <span class="ms-1 text-muted">/ ${max}</span></div></div>`;
              let displayAns = Array.isArray(ans) ? ans.join(', ') : ans;
              html += `<div class="p-2 bg-light rounded border small mt-2"><b>Jawaban Siswa:</b><br>${displayAns ? String(displayAns).replace(/\n/g, '<br>') : '<i class="text-muted">Tidak dijawab</i>'}</div></div></div>`;
          });
          document.getElementById('kor-body').innerHTML = html;
          window.openModal('modalKoreksi');
      };

      window.saveKoreksi = function() {
          const rid = document.getElementById('kor-rid').value; 
          const d = window.recapDataStore[rid]; let detailArr = JSON.parse(d.detail);
          
          document.querySelectorAll('.kor-score').forEach(input => {
              const idx = input.getAttribute('data-idx'); detailArr[idx].s = parseFloat(input.value) || 0;
          });

          let maxTotal = 0, totalScore = 0;
          detailArr.forEach(item => { maxTotal += (item.m || 0); totalScore += (item.s || 0); });
          const finalScore = maxTotal > 0 ? Number(((totalScore / maxTotal) * 100).toFixed(2)) : totalScore;
          
          const btn = document.getElementById('btn-save-kor'); 
          if(btn) { btn.disabled = true; btn.innerText = 'Menyimpan...'; }
          
          window.google.script.run.withSuccessHandler(res => {
              if(btn) { btn.disabled = false; btn.innerText = 'Simpan Perubahan'; }
              if (res.status === 'success') { window.closeModal('modalKoreksi'); window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('hasil-rekap'); } 
              else { window.Swal.fire('Gagal', res.msg, 'error'); }
          }).withFailureHandler(err => { 
              if(btn) { btn.disabled = false; btn.innerText = 'Simpan Perubahan'; }
              window.Swal.fire('Error', err.message, 'error'); 
          }).adminUpdateResult(rid, finalScore, JSON.stringify(detailArr));
      };

      window.deleteResult = function(rid) { window.Swal.fire({title:'Hapus & Reset Ujian?', text:'Data dihapus, cache/status ujian direset, dan siswa bisa ujian kembali.', icon:'warning', showCancelButton:true, confirmButtonColor:'#d33'}).then(r=>{ if(r.isConfirmed) { window.showLoad(true); window.google.script.run.withSuccessHandler(res=>{ window.showLoad(false); if(res.status==='success'){ window.Swal.fire('Berhasil',res.msg,'success'); window.loadPage('hasil-rekap'); } else window.Swal.fire('Gagal',res.msg,'error'); }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminDeleteResult(rid); } }); };

      // =================================================================
      // 8. EDITOR SOAL SUMMERNOTE (100% BEKERJA)
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
          const keys = (qData.Tipe === type) ? JSON.parse(qData.Key || "[]") : []; 
          $('#ans-area-'+uid+' .summernote-opt').each(function(){ $(this).summernote('destroy'); }); let h = '';
          
          if (type === 'PGS' || type === 'PGK') { 
              const inputType = type === 'PGS' ? 'radio' : 'checkbox';
              h = `<button type="button" class="btn btn-outline-primary btn-sm mb-2" onclick="window.addOptRow('${uid}', '${inputType}')">+ Opsi</button><div id="opts-wrap-${uid}">`; 
              if(opts.length) opts.forEach(o => h+=window.genOptRow(uid, inputType, o, keys.map(k=>k.trim()).includes(o.trim())?'checked':''));
              else h+=window.genOptRow(uid, inputType); h+='</div>'; 
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
          const form = $('#frm-q-'+uid); const type = form.find('select[name="type"]').val(); const text = $('#sn-'+uid).summernote('code');
          const score = form.find('input[name="score"]').val(); const num = form.find('input[name="num"]').val();
          const id = form.find('input[name="id"]').val(); let opts=[], keys=[], keyIndices=[];
          
          if (type === 'PGS' || type === 'PGK') { 
              $('#opts-wrap-'+uid+' .ans-row').each(function(){ 
                  const v = $(this).find('.summernote-opt').summernote('code'); 
                  if(v && v !== '<p><br></p>'){ opts.push(v); if($(this).find('.form-check-input').is(':checked')) { keys.push(v); keyIndices.push(opts.length - 1); } } }); } else if(type==='PGKK') {$('#pgkk-tbody-'+uid+' tr').each(function(){ const q = $(this).find('.pgkk-q').summernote('code'); if(q){ opts.push(q); keys.push($(this).find('.pgkk-k').val()); } });
          } else if(type==='Menjodohkan') { 
              $('#match-tbody-'+uid+' tr').each(function(){ const l = $(this).find('.match-l').summernote('code'); const r =$(this).find('.match-r').summernote('code'); if(l && r){ opts.push(l); keys.push(r); } });
          } else { keys = form.find('textarea[name="essay_key"]').val().split(','); } 
          
          const payload={id:id, num:num, type:type, text:text, options:opts, key:keys, keyIndices:keyIndices, score:score, userId: window.user.ID}; 
          const btn = form.find('button.btn-success');
          const origText = btn.html();
          btn.prop('disabled',true).html('<i class="fas fa-spinner fa-spin"></i> Menyimpan...');
          
          window.google.script.run.withSuccessHandler(res=>{
              btn.prop('disabled',false).html(origText);
              if(res.status==='success'){
                  window.toast('success','Soal Disimpan!');
                  const newData={QID:res.id, Tipe:type, Pertanyaan:text, Options:JSON.stringify(opts), Key:JSON.stringify(keys), Skor:score, Nomor:num};
                  $('#block-'+uid).attr('data-q-obj', encodeURIComponent(JSON.stringify(newData))).find('input[name="id"]').val(res.id);
                  $('#block-'+uid+' .q-preview').html('Soal Tersimpan');
                  window.toggleEditQ(uid);
                  const existingIdx = window.currentQuestionsData.findIndex(q => String(q.QID) === String(res.id));
                  if (existingIdx !== -1) window.currentQuestionsData[existingIdx] = newData;
                  else { window.currentQuestionsData.push(newData); window.currentQuestionsData.sort((a,b) => (Number(a.Nomor)||999) - (Number(b.Nomor)||999)); }
              } else window.Swal.fire('Error',res.msg,'error');
          }).withFailureHandler(err => { btn.prop('disabled',false).html(origText); window.Swal.fire('Error', err.message, 'error'); }).adminSaveSingleQuestion(window.activeExamId, payload);
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
              div.innerHTML = `<div class="modal fade" id="modalPreviewQ" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header bg-info text-white"><h5 class="modal-title fw-bold"><i class="fas fa-desktop me-2"></i> Preview Seluruh Soal</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body bg-light" id="preview-q-body"></div></div></div></div>`;
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
              const lItems = JSON.parse(q.Options||"[]"); let rItems = []; try { rItems = [...JSON.parse(q.Key||"[]")].sort(() => Math.random() - 0.5); } catch(e){}
              inp = `<div style="display:flex; justify-content:space-between; gap:20px; margin-top:15px;"><div style="flex:1; display:flex; flex-direction:column; gap:10px;">${lItems.map((t)=>`<div style="border:2px solid #e2e8f0; padding:10px; border-radius:8px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.1);">${t}</div>`).join('')}</div><div style="flex:1; display:flex; flex-direction:column; gap:10px;">${rItems.map((t)=>`<div style="border:2px solid #e2e8f0; padding:10px; border-radius:8px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.1);">${t}</div>`).join('')}</div></div>`;
          } else if(q.Tipe.includes('PG')) {
              const opts = JSON.parse(q.Options||"[]");
              opts.forEach(o => { inp += `<label style="display:flex; align-items:center; border:1px solid #e2e8f0; padding:15px; margin-bottom:10px; border-radius:6px; background:#fff; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05);"><input type="${q.Tipe==='PGK'?'checkbox':'radio'}" name="ans-${q.QID}" style="margin-right:15px; transform:scale(1.5);"><div style="flex-grow:1; margin:0;">${o}</div></label>`; });
          } else {
              inp = `<textarea style="width:100%; padding:15px; border:1px solid #e2e8f0; border-radius:6px; font-family:inherit; resize:vertical;" rows="5" placeholder="Ketik jawaban Anda di sini..."></textarea>`;
          }
          return `<div style="font-family: 'Poppins', Arial, sans-serif; padding:25px; background:#f8fafc; border-radius:12px; color:#1e293b; border:1px solid #e2e8f0; margin-bottom:20px;"><div style="background:var(--primary); color:white; display:inline-block; padding:5px 15px; border-radius:15px; font-size:12px; font-weight:bold; margin-bottom:20px; box-shadow:0 2px 4px rgba(126,34,206,0.2);">Soal No. ${q.Nomor||''}</div><div style="margin-bottom:20px; font-size:16px; line-height:1.6; word-wrap: break-word;">${q.Pertanyaan}</div>${inp}</div>`;
      };

      window.filterTable = function(tid, q) { const f=q.toLowerCase(); $(`#${tid} tbody tr`).each(function(){ const t=$(this).text().toLowerCase();$(this).toggle(t.indexOf(f)>-1); }); };

    };

    // =================================================================
    // 9. INISIALISASI AUTO-LOGIN (MENUNGGU LIBRARY)
    // =================================================================
    initApp();

    const checkAutoLogin = () => {
    // Tunggu sampai fungsi UI native siap
    if (!window.showLoad) {
        setTimeout(checkAutoLogin, 100);
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

        <!-- MODAL UJIAN (PASTIKAN PANGGIL closeModal YANG BENAR) -->
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
