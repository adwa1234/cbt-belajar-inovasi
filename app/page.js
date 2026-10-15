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
      initApp._retries = (initApp._retries || 0) + 1;
      if (!window.jQuery || !window.Swal || !window.XLSX) {
        if (initApp._retries > 100) {
          console.warn("Libraries failed to load after retries. Continuing with degraded mode.");
          // Definisikan fungsi showLoad fallback jika belum ada
          window.showLoad = window.showLoad || function(show) {
            const loader = document.getElementById('loader');
            if (loader) {
              if (show) loader.classList.remove('hidden');
              else loader.classList.add('hidden');
            }
          };
          // Pastikan tampilan login muncul agar pengguna tidak melihat loading tanpa akhir
          const authView = document.getElementById('view-auth');
          const dashView = document.getElementById('view-dashboard');
          if (authView) { authView.classList.remove('hidden'); authView.style.display = 'flex'; }
          if (dashView) { dashView.classList.add('hidden'); dashView.style.display = 'none'; }
          // Selesaikan inisialisasi dalam mode degradasi
          return;
        }
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

      // FIX: Memindahkan elemen modal ke body agar tidak terjebak z-index React
      window.openModal = function(id) {
          const el = document.getElementById(id);
          if (!el) return;
          
          if (el.parentNode !== document.body) {
              document.body.appendChild(el); 
          }
          
          if (window.bootstrap) {
              const modalInstance = window.bootstrap.Modal.getOrCreateInstance(el);
              modalInstance.show();
          } else {
              $(el).modal('show');
          }
          
          // Paksa Z-Index ke Lapisan Terdepan
          setTimeout(() => {
              document.querySelectorAll('.modal-backdrop').forEach(b => { b.style.zIndex = '10400'; });
              el.style.zIndex = '10505';
          }, 100);
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
          if (window.Swal && window.Swal.mixin) {
            window.Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000}).fire({icon: icon, title: title}); 
          } else {
            console.log('TOAST:', icon, title);
            try { if (window.Notification && Notification.permission === 'granted') new Notification(title); } catch(e){}
          }
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
                      else if (window.Swal) window.Swal.fire("Koneksi Error", err.message, "error");
                      else alert('Koneksi Error: ' + err.message);
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
          
          if (!u || !p) { if(window.Swal) window.Swal.fire('Perhatian', 'Username dan Password wajib diisi!', 'warning'); else alert('Username dan Password wajib diisi!'); return; }

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
                  if(window.Swal) window.Swal.fire('Gagal Login', data.msg, 'error'); else alert('Gagal Login: ' + data.msg);
              }
          } catch (err) {
              btn.disabled = false;
              btn.innerHTML = origText;
              if(window.Swal) window.Swal.fire('Koneksi Gagal', 'Detail: ' + err.message, 'error'); else alert('Koneksi Gagal: ' + err.message);
          }
      };

      window.initDash = function() {
          if(!window.user) return;
          
          const viewAuth = document.getElementById('view-auth');
          const viewDash = document.getElementById('view-dashboard');
          if(viewAuth) { viewAuth.classList.add('hidden'); viewAuth.style.display = 'none'; }
          if(viewDash) { viewDash.classList.remove('hidden'); viewDash.style.display = 'flex'; }
          
          document.getElementById('u-name-disp').innerText = window.user.Nama;
          const role = String(window.user.Role || '').trim().toLowerCase(); 
          document.getElementById('user-role-disp').innerText = role.toUpperCase();
          
          document.querySelectorAll('.components').forEach(el => el.classList.add('hidden'));
          
          if(role === 'siswa') { document.getElementById('menu-siswa').classList.remove('hidden'); window.loadPage('siswa-home'); } 
          else if(role === 'guru') { document.getElementById('menu-guru').classList.remove('hidden'); window.loadPage('admin-home'); } 
          else if(role === 'admin') { document.getElementById('menu-admin').classList.remove('hidden'); window.loadPage('admin-home'); } 
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
              
              document.getElementById('u-login').value = ''; document.getElementById('p-login').value = ''; 
              const authView = document.getElementById('view-auth');
              if(authView) { authView.classList.remove('hidden'); authView.style.display = 'flex'; }
          };

          window.Swal.fire({ title: 'Logout?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' }).then((r) => {
              if(r.isConfirmed) executeLogout();
          });
      };

      // =================================================================
      // 5.5 FUNGSI RENDER HALAMAN TAMBAHAN (MISSING FUNCTIONS FIX)
      // =================================================================
      window.renderUsers = function(users) {
          const area = document.getElementById('content-area');
          if(!area) return;
          let h = `<div class="d-flex justify-content-between mb-3"><button class="btn btn-primary shadow-sm" onclick="window.openUserModal()">+ Tambah User Baru</button></div>`;
          h += `<div class="table-responsive bg-white rounded shadow-sm p-3"><table class="table table-hover align-middle"><thead><tr class="table-light"><th>Nama Lengkap</th><th>Username</th><th`;
          users.forEach(u => {
              // FIX: Encode dengan replace karakter ' agar onclick tidak error
              const safeU = encodeURIComponent(JSON.stringify(u)).replace(/'/g, "%27");
              h += `<tr><td class="fw-bold">${u.Nama}</td><td>${u.Username}</td><td><span class="badge bg-secondary">${u.Role}</span></td><td>${u.Kelas||'-'}</td>
              <td><button class="btn btn-sm btn-outline-primary me-1" onclick="window.openUserModal('${safeU}')"><i class="fas fa-edit"></i> Edit</button> 
              <button class="btn btn-sm btn-danger" onclick="window.delUser('${u.ID}')"><i class="fas fa-trash"></i></button></td></tr>`;
          });
          h += `</tbody></table></div>`;
          area.innerHTML = h;
      };

      window.renderRecapTable = function() {
          const area = document.getElementById('content-area');
          if(!area) return;
          window.recapDataStore = {};
          window.currentFilteredData = window.recapAllData;
          let h = `<div class="d-flex justify-content-between mb-3"><button class="btn btn-warning fw-bold shadow-sm" onclick="window.openKatrolModal()"><i class="fas fa-level-up-alt me-1"></i> K`;
          h += `<div class="table-responsive bg-white rounded shadow-sm p-3"><table class="table table-hover align-middle"><thead><tr class="table-light"><th>Nama Siswa</th><th>Ujian</th><th>Nila`;
          
          if(window.recapAllData.length === 0) {
              h += `<tr><td colspan="5" class="text-center py-4 text-muted">Belum ada data nilai masuk.</td></tr>`;
          } else {
              window.recapAllData.forEach(r => {
                  window.recapDataStore[r.ResultID] = { nama: r.nama, ujian: r.ujian, nilai: r.TotalNilai, detail: r.Detail };
                  h += `<tr><td class="fw-bold">${r.nama} <br><small class="text-muted">Kelas: ${r.kelas}</small></td><td>${r.ujian} <br><small class="badge bg-light text-dark border">${r.mapel}`;
                  h += `<td><span class="badge bg-success fs-6">${r.TotalNilai}</span></td><td>${r.WaktuSubmit}</td>
                  <td><button class="btn btn-sm btn-info text-white me-1" onclick="window.openKoreksi('${r.ResultID}')"><i class="fas fa-check-double"></i> Koreksi</button> 
                  <button class="btn btn-sm btn-danger" onclick="window.deleteResult('${r.ResultID}')"><i class="fas fa-undo"></i> Reset</button></td></tr>`;
              });
          }
          h += `</tbody></table></div>`;
          area.innerHTML = h;
      };

      window.renderMonitoring = function() {
          const area = document.getElementById('content-area');
          if(area) area.innerHTML = `<div class="alert alert-info border-0 shadow-sm"><i class="fas fa-info-circle me-2"></i>Fitur Live Monitoring sedang dalam tahap pengembangan dan sinkronisasi`;
      };

      window.renderAdministrasi = function() {
          const area = document.getElementById('content-area');
          if(area) area.innerHTML = `<div class="alert alert-info border-0 shadow-sm"><i class="fas fa-info-circle me-2"></i>Fitur Cetak Administrasi (Berita Acara, Daftar Hadir) sedang dalam per`;
      };

      window.filterAdminUjian = function() {
          const mapel = document.getElementById('filter-mapel-ujian').value.toLowerCase();
          const kelas = document.getElementById('filter-kelas-ujian').value.toLowerCase();
          document.querySelectorAll('.ujian-card').forEach(card => {
              const cMapel = (card.getAttribute('data-mapel') || '').toLowerCase();
              const cKelas = (card.getAttribute('data-kelas') || '').toLowerCase();
              const matchMapel = mapel === "" || cMapel === mapel;
              const matchKelas = kelas === "" || cKelas.includes(kelas);
              if (matchMapel && matchKelas) card.parentElement.style.display = 'block';
              else card.parentElement.style.display = 'none';
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
                  h = `<div class="row g-4"><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-primary"><h3>${tSiswa}</h3><small>Siswa di Kelas Anda</small`;
              }
              else if (page === 'admin-ujian') {
                  let exams = window.gData?.exams || [];
                  let uniqueMapel = [...new Set(exams.map(e => e.Mapel))];
                  let uniqueKelas = [...new Set(exams.map(e => String(e.TargetKelas).trim()))];
                  
                  h = `<div class="d-flex justify-content-between mb-3">
                          <button class="btn btn-primary shadow-sm" onclick="window.openExamModal()">+ Buat Jadwal Baru</button>
                          <div class="d-flex gap-2">
                            <select id="filter-mapel-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Mapel</option>${uniqueMapel.map(m=>`<opt`;
                  
                  exams.forEach(e => {
                      const isOwner = (String(window.user.Role).trim().toLowerCase() === 'admin' || String(e.PembuatID) === String(window.user.ID));
                      // FIX: Encode dengan replace karakter ' agar onclick tidak error
                      const safeE = encodeURIComponent(JSON.stringify(e)).replace(/'/g, "%27");
                      const actionButtons = isOwner ? `<button class="btn btn-sm btn-outline-dark flex-fill" onclick="window.openExamModal('${safeE}')">Edit</button> <button class="btn btn-sm btn`;
                      h += `<div class="col-md-6 col-lg-4 ujian-card" data-mapel="${e.Mapel}" data-kelas="${e.TargetKelas}"><div class="card h-100 shadow-sm border-0"><div class="card-body"><div `;
                  });
                  h += '</div>';
              }
              else if (page === 'siswa-home') {
                  let availExams = window.gData?.availableExams || [];
                  let historyData = window.gData?.history || [];
                  
                  h = `<div class="card mb-4 border-0 shadow-sm bg-primary text-white"><div class="card-body"><h5 class="fw-bold">Halo, ${window.user.Nama}</h5></div></div><h5 class="fw-bold mb-3`;
                  if(availExams.length === 0) { h += '<div class="col-12"><div class="alert alert-info text-center">Tidak ada ujian aktif saat ini.</div></div>'; } 
                  else {
                      availExams.forEach(e => {
                          let btnState = '', btnText = 'MULAI UJIAN', btnClass = 'btn-primary';
                          if (e.IsFinished) { btnState = 'disabled'; btnText = 'SUDAH DIKERJAKAN / BATAS HABIS'; btnClass = 'btn-secondary'; }
                          else if (e.IsExpired) { btnState = 'disabled'; btnText = 'WAKTU HABIS'; btnClass = 'btn-danger'; }
                          h += `<div class="col-md-6 col-lg-4"><div class="card h-100 shadow-sm border-0"><div class="card-body"><h5 class="fw-bold text-primary">${e.Judul}</h5><div class="mb-2">`;
                      });
                  }
                  h += '</div><h5 class="fw-bold mb-3 border-bottom pb-2 mt-4 text-primary"><i class="fas fa-history me-2"></i>Riwayat</h5>';
                  if(historyData.length === 0) { h += '<p class="text-muted fst-italic">Belum ada riwayat.</p>'; } 
                  else {
                      h += `<div class="table-responsive bg-white rounded shadow-sm p-3"><table class="table table-hover align-middle mb-0"><thead><tr class="table-light"><th>Tanggal</th><th>Ujia`;
                      historyData.forEach(r => { h += `<tr><td>${r.WaktuSubmit}</td><td><div class="fw-bold">${r.Judul}</div></td><td><span class="badge bg-warning text-dark">${r.Nilai}</span></t`;
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
                  htmlKelas += `<div class="form-check"><input class="form-check-input kls-cb" type="checkbox" value="${k}" id="cb-${k}" ${isChecked}><label class="form-check-label small" for="cb`;
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
                  }).withFailureHandler(err => { btn.innerHTML = origBtn; btn.disabled = false; window.Swal.fire('Error', err.message, 'error'); }).getDashboardData(window.user.Role, window.user.Kelas);
              } else { 
                  btn.innerHTML = origBtn; btn.disabled = false;
                  window.Swal.fire('Gagal', res.msg, 'error'); 
              }
          }).withFailureHandler(err => { btn.innerHTML = origBtn; btn.disabled = false; window.Swal.fire('Error', err.message, 'error'); }).adminSaveExam(d);
      };

      window.delExam = function(id){ window.Swal.fire({title:'Hapus Jadwal?', icon:'warning', showCancelButton:true}).then(r=>{if(r.isConfirmed) { window.showLoad(true); window.google.script.run`;
,