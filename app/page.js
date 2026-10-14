"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export default function Page() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true); // Cegah error crash "Page couldn't load" di Vercel

    if (typeof window === "undefined" || window.appInitialized) return;
    window.appInitialized = true;

    const initApp = () => {
      if (!window.jQuery || !window.Swal) {
        setTimeout(initApp, 100);
        return;
      }

      const $ = window.jQuery;

      // ==========================================
      // PROXY API: PENGGANTI GOOGLE.SCRIPT.RUN
      // ==========================================
      window.google = {
        script: {
          run: new Proxy({}, {
            get: function (target, prop) {
              if (prop === "withSuccessHandler") {
                return function (fn) { target.successFn = fn; return new Proxy(target, this); }.bind(this);
              }
              if (prop === "withFailureHandler") {
                return function (fn) { target.failureFn = fn; return new Proxy(target, this); }.bind(this);
              }
              return function (...args) {
                fetch("/api/cbt", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: prop, args: args }),
                })
                  .then((r) => r.json())
                  .then((res) => { if (target.successFn) target.successFn(res); })
                  .catch((err) => { if (target.failureFn) target.failureFn(err); });
              };
            },
          }),
        },
      };

      // ==========================================
      // ORIGINAL JAVASCRIPT LOGIC
      // ==========================================
      let examSubmitting = false;
      let user = null;
      let gData = {};
      let gAdminData = { exams: [], users: [] };
      let activeExamId = null;
      let activeExamViolations = 3;
      let timerInt, monitorInterval, autosaveInterval;
      let totalQ = 0;
      let currentQuestionsData = [];
      let currentQIdx = 0;
      let recapAllData = [];
      let recapDataStore = {};
      let violationCount = 0;
      let isExamFinished = false;
      let violationLock = false;
      
      const LOGO_BARU = "https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk";
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      let finalBeepOsc = null;
      let beepInterval = null;

      function playBeep(times, continuous = false) {
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
      }

      function stopContinuousBeep() {
          if (finalBeepOsc) { try { finalBeepOsc.stop(); finalBeepOsc.disconnect(); } catch(e){} finalBeepOsc = null; }
          if (beepInterval) { clearTimeout(beepInterval); beepInterval = null; }
      }

      const MathButton = function (context) {
          const ui = $.summernote.ui;
          const button = ui.button({
              contents: '<i class="fas fa-square-root-alt"></i> Rumus',
              tooltip: 'Tambahkan Rumus Matematika (LaTeX)',
              click: function () {
                  window.Swal.fire({
                      title: 'Editor Rumus (LaTeX)',
                      html: `<div class="text-start small mb-2 text-muted">Pilih template cepat atau ketik format LaTeX secara manual:</div>
                             <div class="d-flex flex-wrap gap-1 mb-3">
                               <button class="btn btn-sm btn-outline-secondary" onclick="$('#swal-math-input').val($('#swal-math-input').val() + '\\\\frac{a}{b}')">Pecahan (a/b)</button>
                               <button class="btn btn-sm btn-outline-secondary" onclick="$('#swal-math-input').val($('#swal-math-input').val() + 'x^{2}')">Pangkat</button>
                               <button class="btn btn-sm btn-outline-secondary" onclick="$('#swal-math-input').val($('#swal-math-input').val() + '\\\\sqrt{x}')">Akar</button>
                               <button class="btn btn-sm btn-outline-secondary" onclick="$('#swal-math-input').val($('#swal-math-input').val() + '\\\\sum')">Sigma</button>
                             </div>
                             <textarea id="swal-math-input" class="form-control font-monospace" rows="3" placeholder="Ketik rumus LaTeX di sini..."></textarea>`,
                      showCancelButton: true,
                      confirmButtonText: 'Sisipkan Rumus',
                      cancelButtonText: 'Batal'
                  }).then((result) => {
                      if (result.isConfirmed) {
                          const mathText = $('#swal-math-input').val();
                          if(mathText) context.invoke('editor.insertText', ` $$ ${mathText} $$ `);
                      }
                  });
              }
          });
          return button.render();
      }

      const snConfig = { 
          height: 180, 
          toolbar: [['style', ['bold', 'italic', 'underline', 'clear']], ['para', ['ul', 'ol']], ['insert', ['picture', 'table', 'link', 'math']]],
          buttons: { math: MathButton }
      };

      function applyMathJax() { if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise().catch(()=>{}); }

      function checkResumeExam() {
          const savedExam = localStorage.getItem('cbt_active_exam');
          if(savedExam) {
              try {
                  const examState = JSON.parse(savedExam);
                  if(examState && examState.id) {
                      window.Swal.fire({ title: 'Lanjutkan Ujian?', text: 'Terdeteksi sesi ujian yang belum selesai.', icon: 'info', confirmButtonText: 'Lanjutkan', allowOutsideClick: false }).then(() => {
                          activeExamId = examState.id; totalQ = examState.qs.length; activeExamViolations = examState.maxV || 3;
                          $('#do-exam-title').html(`${examState.judul} <span class="mx-2">|</span> ${user.Nama}`);
                          if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen().catch(()=>{}); }
                          window.runExam(examState.qs, examState.dur, true);
                      });
                  }
              } catch(e) { localStorage.removeItem('cbt_active_exam'); }
          }
      }

      function toggleSidebar() { $('#sidebar').toggleClass('active'); $('#sidebar-overlay').toggleClass('active'); }
      function showLoad(s) { s ? $('#loader').removeClass('hidden') : $('#loader').addClass('hidden'); }
      function toast(icon, title) { window.Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000}).fire({icon: icon, title: title}); }

      function handleLogin() {
          window.showLoad(true);
          window.google.script.run.withSuccessHandler(res => {
              window.showLoad(false);
              if(res.status === 'success') {
                  user = res.data; user.LogoUrl = LOGO_BARU; 
                  localStorage.setItem('cbt_user', JSON.stringify(user));
                  $('#logo-container img').attr('src', LOGO_BARU);
                  window.initDash();
              } else window.Swal.fire('Gagal', res.msg, 'error');
          }).withFailureHandler(err => {
              window.showLoad(false); window.Swal.fire('Error', 'Koneksi ke server gagal. ' + err.message, 'error');
          }).loginUser($('#u-login').val(), $('#p-login').val());
      }

      function handleLogout() {
          window.Swal.fire({ title: 'Logout?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' }).then((r) => {
              if(r.isConfirmed) {
                  window.stopContinuousBeep();
                  localStorage.removeItem('cbt_user'); localStorage.removeItem('cbt_active_exam'); user = null;
                  clearInterval(timerInt); clearInterval(monitorInterval); clearInterval(autosaveInterval); activeExamId = null;
                  $('#view-dashboard').addClass('hidden'); $('#view-exam').addClass('hidden'); $('body').removeClass('exam-mode');
                  $('#u-login').val(''); $('#p-login').val(''); $('#view-auth').show(); 
                  $('#sidebar').removeClass('active'); $('#sidebar-overlay').removeClass('active');
              }
          });
      }

      function initDash() {
          $('#view-auth').hide(); $('#view-dashboard').removeClass('hidden'); $('#u-name-disp').text(user.Nama);
          const role = String(user.Role || '').trim().toLowerCase(); $('#user-role-disp').text(role.toUpperCase());
          $('.components').addClass('hidden');
          
          if(role === 'siswa') { $('#menu-siswa').removeClass('hidden'); window.loadPage('siswa-home'); } 
          else if(role === 'guru') { $('#menu-guru').removeClass('hidden'); window.loadPage('admin-home'); } 
          else if(role === 'admin') { $('#menu-admin').removeClass('hidden'); window.loadPage('admin-home'); } 
          else { window.Swal.fire('Akses Ditolak', 'Role akun Anda tidak dikenali sistem.', 'error'); }
      }

      function appRefresh() {
          const activeLink = $('.nav-link.active');
          if (activeLink.length > 0) {
              const onclickAttr = activeLink.attr('onclick');
              if(onclickAttr) { 
                  const match = onclickAttr.match(/'([^']+)'/); 
                  if(match && match[1]) window.loadPage(match[1]); 
              }
          } else {
              window.loadPage('admin-home');
          }
      }

      function loadPage(page) {
          clearInterval(timerInt); clearInterval(monitorInterval); clearInterval(autosaveInterval); window.disableSecurity(); window.stopContinuousBeep();
          $('#view-exam').addClass('hidden'); $('#view-dashboard').removeClass('hidden'); $('body').removeClass('exam-mode');
          $('#page-title').text(page.replace('-', ' ').toUpperCase());
          $('.nav-link').removeClass('active'); $(`a[onclick="window.loadPage('${page}')"]`).addClass('active');
          if(window.innerWidth <= 768) { $('#sidebar').removeClass('active'); $('#sidebar-overlay').removeClass('active'); }
          
          if(page === 'admin-users') {
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(r => {
                  window.showLoad(false);
                  if(r.status === 'success') { window.renderUsers(r.data); } else { window.Swal.fire('Error', r.msg, 'error'); }
              }).withFailureHandler(e => { window.showLoad(false); window.Swal.fire('Error', e.message, 'error'); }).getUserList(user.Role, user.ID, user.Kelas);
              return;
          }
          if(page === 'hasil-rekap') {
              $('#content-area').html('<div class="text-center p-5"><div class="spinner"></div></div>');
              window.google.script.run.withSuccessHandler(r => {
                  if(r.status === 'success') { recapAllData = r.data; window.renderRecapTable(); }
                  else { $('#content-area').html(`<div class="alert alert-danger">${r.msg}</div>`); window.Swal.fire('Error', r.msg, 'error'); }
              }).withFailureHandler(e => { window.Swal.fire('Error', e.message, 'error'); }).getRecapList(user.Role, user.ID, user.Kelas);
              return;
          }
          if(page === 'guru-monitoring') { window.renderMonitoring(); return; }
          if(page === 'admin-administrasi') {
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(r => {
                  window.showLoad(false);
                  if(r.status === 'success') { gAdminData = r; window.renderAdministrasi(); } 
                  else { window.Swal.fire('Error', r.msg, 'error'); }
              }).withFailureHandler(e => { window.showLoad(false); window.Swal.fire('Error', e.message, 'error'); }).getAdminData(user.Role, user.ID, user.Kelas);
              return;
          }
          
          window.showLoad(true);
          window.google.script.run.withSuccessHandler(res => {
              window.showLoad(false);
              if (res.status === 'success') { gData = res.data; window.renderContent(page); window.applyMathJax(); } 
              else { window.Swal.fire('Error', res.msg, 'error'); }
          }).withFailureHandler(e => { window.showLoad(false); window.Swal.fire('Error', e.message || 'Gagal memuat dashboard', 'error'); }).getDashboardData(user.Role, user.ID, user.Kelas);
      }

      function exportToExcel(tableId, filename) {
          const table = document.getElementById(tableId);
          const wb = window.XLSX.utils.table_to_book(table, {sheet: "Rekap Nilai"});
          window.XLSX.writeFile(wb, filename + '.xlsx');
      }

      function generateUserExcelTemplate() {
          const ws_data = [
              ["Nama", "Username", "Password", "Role", "Sekolah", "Kelas"],
              ["Siswa Teladan", "siswa01", "12345", "Siswa", "BELAJAR INOVASI", "10A"],
              ["Guru Budi", "guru01", "guru123", "Guru", "BELAJAR INOVASI", "10A,10B"]
          ];
          const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
          const wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, "TemplateUser");
          window.XLSX.writeFile(wb, "Template_Upload_User.xlsx");
      }

      function handleUploadUsersExcel(e) {
          const file = e.target.files[0]; if(!file) return;
          const reader = new FileReader();
          reader.onload = function(evt) {
              const data = evt.target.result; const workbook = window.XLSX.read(data, {type: 'binary'});
              const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const json = window.XLSX.utils.sheet_to_json(worksheet);
              let formattedData = json.map(row => ({
                  nama: row['Nama'] || '', username: row['Username'] || '', password: String(row['Password'] || ''),
                  role: row['Role'] || 'Siswa', sekolah: row['Sekolah'] || '-', kelas: String(row['Kelas'] || '-')
              })).filter(u => u.nama && u.username);
              if(formattedData.length === 0) return window.Swal.fire('Error', 'Data kosong atau format salah.', 'error');
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(res => {
                  window.showLoad(false);
                  if(res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('admin-users'); } 
                  else window.Swal.fire('Gagal', res.msg, 'error');
              }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminBatchSaveUsers(formattedData);
          };
          reader.readAsBinaryString(file);
      }

      function toggleAllCb(type) { const isChecked = $(`#cb-all-${type}`).is(':checked'); $(`.cb-${type}`).prop('checked', isChecked); window.checkBulkDelete(type); }
      function checkBulkDelete(type) { const count = $(`.cb-${type}:checked`).length; if(count > 0) $(`#btn-bulk-del-${type}`).removeClass('hidden'); else $(`#btn-bulk-del-${type}`).addClass('hidden'); }

      function bulkDeleteUsers() {
          const ids = []; $('.cb-user:checked').each(function(){ ids.push($(this).val()); });
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
      }

      function bulkDeleteRekap() {
          const rids = []; $('.cb-rekap:checked').each(function(){ rids.push($(this).val()); });
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
      }

      function renderUsers(users) {
          const cleanRole = String(user.Role).trim().toLowerCase(); const isAdmin = cleanRole === 'admin';
          let h = `<div class="d-flex justify-content-between mb-3 flex-wrap gap-2">
              <div>
                  ${isAdmin ? `<button class="btn btn-success shadow-sm me-2" onclick="$('#modalUser').modal('show');$('#modalUser form')[0].reset();$('#mu-id').val('');">+ Tambah User</button>
                  <button class="btn btn-outline-info shadow-sm me-2" onclick="window.generateUserExcelTemplate()"><i class="fas fa-download"></i> Template Excel</button>
                  <label class="btn btn-primary shadow-sm m-0 me-2"><i class="fas fa-upload"></i> Upload Excel <input type="file" hidden accept=".xlsx,.xls" onchange="window.handleUploadUsersExcel(event)"></label>
                  <button id="btn-bulk-del-users" class="btn btn-danger hidden shadow-sm me-2" onclick="window.bulkDeleteUsers()"><i class="fas fa-trash"></i> Hapus Terpilih</button>` : `<h5 class="fw-bold text-primary mb-0"><i class="fas fa-users me-2"></i>Data Siswa Kelas Anda</h5>`}
              </div>
              <input type="text" id="user-search" class="form-control" style="width:250px" placeholder="Cari Siswa..." onkeyup="window.filterTable('tbl-users', this.value)">
          </div>
          <div class="card border-0 shadow-sm"><div class="card-body p-0"><div class="table-responsive">
          <table class="table table-hover align-middle mb-0" id="tbl-users"><thead class="table-light"><tr>${isAdmin ? `<th width="5%"><input type="checkbox" id="cb-all-users" class="form-check-input" onchange="window.toggleAllCb('users')"></th>` : ''}<th>Nama</th><th>Username</th><th>Role</th><th>Kelas</th>${isAdmin ? '<th>Aksi</th>' : ''}</tr></thead><tbody>`;
          
          users.forEach(u => {
              const safeData = encodeURIComponent(JSON.stringify(u));
              h += `<tr>${isAdmin ? `<td><input type="checkbox" class="cb-user form-check-input" value="${u.ID}" onchange="window.checkBulkDelete('users')"></td>` : ''}<td class="fw-bold">${u.Nama}</td><td>${u.Username}</td><td><span class="badge bg-${String(u.Role).trim().toLowerCase()==='admin'?'danger':(String(u.Role).trim().toLowerCase()==='guru'?'warning':'primary')}">${u.Role}</span></td><td>${u.Kelas || '-'}</td>${isAdmin ? `<td><button class="btn btn-sm btn-outline-dark me-1" onclick="window.editUser('${safeData}')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.delUser('${u.ID}')"><i class="fas fa-trash"></i></button></td>` : ''}</tr>`;
          });
          h += `</tbody></table></div></div></div>`;
          $('#content-area').html(h);
      }

      function renderRecapTable() {
          const uniqueKelas = [...new Set(recapAllData.map(item => item.KelasSiswa))].sort();
          const uniqueUjian = [...new Set(recapAllData.map(item => item.JudulUjian))].sort();
          let h = `
          <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0 text-primary"><i class="fas fa-chart-bar me-2"></i>Rekapitulasi Nilai</h5>
              <div>
                  <button id="btn-bulk-del-rekap" class="btn btn-danger hidden shadow-sm me-2" onclick="window.bulkDeleteRekap()"><i class="fas fa-trash"></i> Hapus Terpilih</button>
                  <button class="btn btn-warning shadow-sm me-2" onclick="$('#modalKatrol').modal('show')"><i class="fas fa-sort-amount-up me-1"></i> Katrol Nilai</button>
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
          <table class="table table-hover align-middle mb-0" id="tbl-rekap"><thead class="table-light"><tr><th width="5%"><input type="checkbox" id="cb-all-rekap" class="form-check-input" onchange="window.toggleAllCb('rekap')"></th><th>Waktu</th><th>Nama Siswa</th><th>Kelas</th><th>Mata Pelajaran</th><th>Nilai Akhir</th><th>Aksi</th></tr></thead><tbody id="tbl-rekap-body"></tbody></table></div></div></div>`;
          $('#content-area').html(h); window.applyFilter();
      }

      function applyFilter() {
        const fUjian = $('#filter-ujian').val(); const fKelas = $('#filter-kelas').val(); const fSearch = $('#filter-search').val().toLowerCase();
        const tbody = $('#tbl-rekap-body'); tbody.empty(); recapDataStore = {};
        const filtered = recapAllData.filter(item => { if(fUjian && item.JudulUjian !== fUjian) return false; if(fKelas && item.KelasSiswa !== fKelas) return false; if(fSearch && !item.NamaSiswa.toLowerCase().includes(fSearch)) return false; return true; });
        window.currentFilteredData = filtered;
        $('#cb-all-rekap').prop('checked', false); $('#btn-bulk-del-rekap').addClass('hidden');

        if(filtered.length === 0) { tbody.html('<tr><td colspan="7" class="text-center p-3">Tidak ada data ditemukan.</td></tr>'); return; }
        filtered.forEach(r => {
          recapDataStore[r.ResultID] = { detail: r.Detail, nama: r.NamaSiswa, ujian: r.JudulUjian, nilai: r.TotalNilai, pembuat: r.PembuatNama };
          tbody.append(`<tr><td><input type="checkbox" class="cb-rekap form-check-input" value="${r.ResultID}" onchange="window.checkBulkDelete('rekap')"></td><td class="small text-muted">${r.WaktuSubmit}</td><td><div class="fw-bold">${r.NamaSiswa}</div></td><td>${r.KelasSiswa}</td><td>${r.Mapel} <br><small class="text-muted">${r.JudulUjian}</small></td><td><span class="badge bg-primary fs-6">${r.TotalNilai}</span></td><td><button class="btn btn-sm btn-outline-info me-1" onclick="window.openKoreksi('${r.ResultID}')" title="Koreksi & Input Nilai Personal"><i class="fas fa-edit"></i> Edit Nilai</button><button class="btn btn-sm btn-outline-success me-1" onclick="window.printRecap('${r.ResultID}')" title="Cetak"><i class="fas fa-print"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.deleteResult('${r.ResultID}')" title="Hapus"><i class="fas fa-trash"></i></button></td></tr>`);
        });
      }

      function applyKatrolMassal() {
          const addVal = parseFloat($('#katrol-value').val()) || 0;
          if(addVal === 0) return window.Swal.fire('Perhatian', 'Masukkan nilai katrol yang valid.', 'warning');
          if(!window.currentFilteredData || window.currentFilteredData.length === 0) return window.Swal.fire('Data Kosong', 'Tidak ada data di tabel untuk dikatrol.', 'info');
          
          window.Swal.fire({
              title: 'Konfirmasi Katrol Nilai', text: `Anda yakin menambahkan nilai sebesar ${addVal} ke ${window.currentFilteredData.length} siswa di tabel ini?`,
              icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Eksekusi',
          }).then((result) => {
              if(result.isConfirmed) {
                  window.showLoad(true); const rids = window.currentFilteredData.map(d => d.ResultID);
                  window.google.script.run.withSuccessHandler(res => {
                      window.showLoad(false); $('#modalKatrol').modal('hide');
                      if (res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('hasil-rekap'); } 
                      else { window.Swal.fire('Gagal', res.msg, 'error'); }
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminKatrolMassal(rids, addVal);
              }
          });
      }

      function renderAdministrasi() {
          const uniqueKelas = [...new Set(gAdminData.users.map(u => String(u.Kelas).trim()))].filter(k => k).sort();
          let optKelas = `<option value="ALL">Semua Kelas</option>` + uniqueKelas.map(k => `<option value="${k}">${k}</option>`).join('');
          let optUjian = `<option value="">-- Pilih Ujian --</option>` + gAdminData.exams.map(e => `<option value="${e.ExamID}">${e.Judul} (${e.Mapel})</option>`).join('');
          
          let h = `
          <div class="row g-4">
              <div class="col-md-4"><div class="card shadow-sm border-0 h-100"><div class="card-body"><h5 class="fw-bold text-primary"><i class="fas fa-id-card me-2"></i>Cetak Kartu Login</h5><p class="small text-muted">Cetak kartu akun siswa untuk login aplikasi CBT.</p><label class="small fw-bold">Filter Kelas</label><select id="adm-kls-kartu" class="form-select mb-3">${optKelas}</select><button class="btn btn-primary w-100" onclick="window.printKartuLogin()"><i class="fas fa-print me-1"></i> Cetak Kartu</button></div></div></div>
              <div class="col-md-4"><div class="card shadow-sm border-0 h-100"><div class="card-body"><h5 class="fw-bold text-info"><i class="fas fa-clipboard-list me-2"></i>Cetak Daftar Hadir</h5><p class="small text-muted">Format absensi siswa saat pelaksanaan ujian.</p><label class="small fw-bold">Pilih Ujian</label><select id="adm-exam-hadir" class="form-select mb-2">${optUjian}</select><label class="small fw-bold">Filter Kelas</label><select id="adm-kls-hadir" class="form-select mb-3">${optKelas}</select><button class="btn btn-info text-white w-100" onclick="window.printDaftarHadir()"><i class="fas fa-print me-1"></i> Cetak Daftar Hadir</button></div></div></div>
              <div class="col-md-4"><div class="card shadow-sm border-0 h-100"><div class="card-body"><h5 class="fw-bold text-success"><i class="fas fa-file-signature me-2"></i>Cetak Berita Acara</h5><p class="small text-muted">Format laporan pelaksanaan ujian untuk pengawas.</p><label class="small fw-bold">Pilih Ujian</label><select id="adm-exam-ba" class="form-select mb-2">${optUjian}</select><label class="small fw-bold">Filter Kelas</label><select id="adm-kls-ba" class="form-select mb-3">${optKelas}</select><button class="btn btn-success w-100" onclick="window.printBeritaAcara()"><i class="fas fa-print me-1"></i> Cetak Berita Acara</button></div></div></div>
          </div>`;
          $('#content-area').html(h);
      }

      function printKartuLogin() {
          const kls = $('#adm-kls-kartu').val(); let usersToPrint = gAdminData.users;
          if (kls !== 'ALL') usersToPrint = usersToPrint.filter(u => u.Kelas === kls);
          if (usersToPrint.length === 0) return window.Swal.fire('Kosong', 'Tidak ada data siswa untuk kelas tersebut.', 'info');
          let html = `<html><head><title>Cetak Kartu Login</title><style>body { font-family: 'Times New Roman', Times, serif; } .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; padding: 15px; } .card { border: 2px dashed #333; padding: 15px; border-radius: 8px; page-break-inside: avoid; } .kop { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; } .kop img { width: 50px; height: 50px; margin-right: 15px; } .kop h3 { margin: 0; font-size: 15px; text-transform: uppercase; } .kop p { margin: 0; font-size: 11px; } table { width: 100%; font-size: 14px; } td { padding: 4px 0; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#7e22ce; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div><div class="grid">`;
          usersToPrint.forEach(u => { html += `<div class="card"><div class="kop"><img src="${LOGO_BARU}" alt="Logo"><div><h3>KARTU LOGIN UJIAN CBT</h3><p>BELAJAR INOVASI</p></div></div><table><tr><td width="30%"><strong>Nama</strong></td><td width="5%">:</td><td>${u.Nama}</td></tr><tr><td><strong>Kelas</strong></td><td>:</td><td>${u.Kelas}</td></tr><tr><td><strong>Username</strong></td><td>:</td><td><strong>${u.Username}</strong></td></tr><tr><td><strong>Password</strong></td><td>:</td><td><strong>${u.Password}</strong></td></tr></table></div>`; });
          html += `</div><script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      }

      function printDaftarHadir() {
          const examId = $('#adm-exam-hadir').val(); const kls = $('#adm-kls-hadir').val();
          if(!examId) return window.Swal.fire('Perhatian', 'Pilih Ujian terlebih dahulu.', 'warning');
          const exam = gAdminData.exams.find(e => String(e.ExamID) === String(examId)); let usersToPrint = gAdminData.users;
          if (kls !== 'ALL') usersToPrint = usersToPrint.filter(u => u.Kelas === kls);
          if (usersToPrint.length === 0) return window.Swal.fire('Kosong', 'Tidak ada data siswa untuk kelas tersebut.', 'info');
          let html = `<html><head><title>Daftar Hadir Ujian</title><style>body { font-family: 'Times New Roman', Times, serif; padding: 30px; } .kop { display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 20px; text-align: center; } .kop img { width: 70px; height: 70px; margin-right: 20px; position: absolute; left: 40px; } .kop h2 { margin: 0; font-size: 20px; text-transform: uppercase; } .kop p { margin: 5px 0 0; font-size: 14px; } h3 { text-align: center; text-decoration: underline; margin-bottom: 20px; } .info-table { width: 100%; margin-bottom: 20px; font-size: 14px; } .info-table td { padding: 4px; } .data-table { width: 100%; border-collapse: collapse; font-size: 14px; } .data-table th, .data-table td { border: 1px solid #000; padding: 8px; } .data-table th { background: #f0f0f0; text-align: center; } .ttd-box { height: 35px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#84cc16; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div><div class="kop"><img src="${LOGO_BARU}" alt="Logo"><div><h2>DAFTAR HADIR PESERTA UJIAN</h2><p>Aplikasi CBT BELAJAR INOVASI</p></div></div><h3>DAFTAR HADIR PESERTA</h3><table class="info-table"><tr><td width="15%"><strong>Mata Pelajaran</strong></td><td width="2%">:</td><td width="33%">${exam.Mapel} - ${exam.Judul}</td><td width="15%"><strong>Hari, Tanggal</strong></td><td width="2%">:</td><td>......................................</td></tr><tr><td><strong>Kelas</strong></td><td>:</td><td>${kls === 'ALL' ? 'Semua Kelas' : kls}</td><td><strong>Waktu</strong></td><td>:</td><td>......................................</td></tr></table><table class="data-table"><thead><tr><th width="5%">No</th><th width="15%">Username</th><th width="40%">Nama Peserta</th><th width="25%" colspan="2">Tanda Tangan</th><th width="15%">Ket</th></tr></thead><tbody>`;
          usersToPrint.forEach((u, i) => { let ttdCol1 = (i % 2 === 0) ? `${i+1}.` : ''; let ttdCol2 = (i % 2 !== 0) ? `${i+1}.` : ''; html += `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:center">${u.Username}</td><td>${u.Nama}</td><td class="ttd-box">${ttdCol1}</td><td class="ttd-box">${ttdCol2}</td><td></td></tr>`; });
          html += `</tbody></table><div style="margin-top: 50px; text-align: right; padding-right: 50px;"><p>..................................</p><p style="margin-bottom: 70px;">Pengawas Ujian,</p><p><strong>( ......................................... )</strong></p></div><script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      }

      function printBeritaAcara() {
          const examId = $('#adm-exam-ba').val(); const kls = $('#adm-kls-ba').val();
          if(!examId) return window.Swal.fire('Perhatian', 'Pilih Ujian terlebih dahulu.', 'warning');
          const exam = gAdminData.exams.find(e => String(e.ExamID) === String(examId));
          let html = `<html><head><title>Berita Acara Ujian</title><style>body { font-family: 'Times New Roman', Times, serif; padding: 40px; line-height: 1.6; } .kop { display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 30px; text-align: center; } .kop img { width: 80px; height: 80px; margin-right: 20px; position: absolute; left: 40px; } .kop h2 { margin: 0; font-size: 22px; text-transform: uppercase; } .kop p { margin: 5px 0 0; font-size: 14px; } h3 { text-align: center; text-decoration: underline; margin-bottom: 30px; } .content { font-size: 15px; text-align: justify; } .content p { margin-bottom: 15px; } .ttd-section { margin-top: 60px; width: 100%; } .ttd-section table { width: 100%; text-align: center; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#198754; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div><div class="kop"><img src="${LOGO_BARU}" alt="Logo"><div><h2>PANITIA PELAKSANAAN UJIAN CBT</h2><p>Aplikasi BELAJAR INOVASI</p></div></div><h3>BERITA ACARA PELAKSANAAN UJIAN</h3><div class="content"><p>Pada hari ini .................................. tanggal ........... bulan .............................. tahun .........................., telah diselenggarakan Ujian Berbasis Komputer (CBT) dengan rincian sebagai berikut:</p><table style="width: 100%; margin-left: 20px; margin-bottom: 15px;"><tr><td width="25%">Mata Pelajaran</td><td width="5%">:</td><td><strong>${exam.Mapel} - ${exam.Judul}</strong></td></tr><tr><td>Kelas / Ruang</td><td>:</td><td><strong>${kls === 'ALL' ? 'Semua Kelas' : kls}</strong></td></tr><tr><td>Waktu Pelaksanaan</td><td>:</td><td>Pukul ..................... s.d .....................</td></tr></table><p>Dengan jumlah peserta ujian sebagai berikut:</p><table style="width: 100%; margin-left: 20px; margin-bottom: 20px;"><tr><td width="25%">1. Jumlah Peserta Seharusnya</td><td width="5%">:</td><td>........... Orang</td></tr><tr><td>2. Jumlah Peserta Hadir</td><td>:</td><td>........... Orang</td></tr><tr><td>3. Jumlah Peserta Tidak Hadir</td><td>:</td><td>........... Orang</td></tr><tr><td valign="top">4. Catatan Selama Ujian</td><td valign="top">:</td><td style="border-bottom: 1px dotted #000; height: 30px;"></td></tr><tr><td></td><td></td><td style="border-bottom: 1px dotted #000; height: 30px;"></td></tr></table><p>Demikian Berita Acara ini dibuat dengan sesungguhnya untuk dapat dipergunakan sebagaimana mestinya.</p></div><div class="ttd-section"><table><tr><td width="50%"></td><td width="50%">....................................<br>Pengawas Ujian,</td></tr><tr><td height="80"></td><td></td></tr><tr><td></td><td><strong>( .................................................. )</strong></td></tr></table></div><script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      }

      function printFilteredRecap() {
        if(!window.currentFilteredData || window.currentFilteredData.length === 0) { window.Swal.fire('Data Kosong', 'Tidak ada data nilai yang tampil untuk dicetak.', 'info'); return; }
        const fUjian = $('#filter-ujian').val() || 'Semua Ujian'; const fKelas = $('#filter-kelas').val() || 'Semua Kelas';
        let namaPengawas = window.currentFilteredData.length > 0 ? window.currentFilteredData[0].PembuatNama : user.Nama;
        let html = `<html><head><title>Cetak Rekap Nilai</title><style>body { font-family: 'Times New Roman', Times, serif; padding: 30px;} h2, h4 { text-align: center; margin: 5px 0; } table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;} th, td { border: 1px solid black; padding: 8px; text-align: left; } th { background-color: #f2f2f2; text-align: center;font-weight: bold; } .text-center { text-align: center; } .signature { margin-top: 50px; width: 100%; text-align: right;} .signature div { display: inline-block; text-align: center; width: 250px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer; background:#198754; color:white; border:none; border-radius:5px;">Cetak Rekap</button></div><h4><div id="logo-container"><img src="${LOGO_BARU}" class="mb-3 rounded" width="100" alt="Logo"></div></h4><hr style="border:1px solid #000; margin-bottom: 20px;"><div><h2>REKAPITULASI HASIL UJIAN</h2><p><strong>Ujian / Materi :</strong> ${fUjian}</p><p><strong>Kelas :</strong> ${fKelas}</p><p><strong>Waktu Cetak :</strong> ${new Date().toLocaleString('id-ID')}</p></div><table><thead><tr><th width="5%">No</th><th width="15%">Waktu Submit</th><th width="25%">Nama Siswa</th><th width="10%">Kelas</th><th width="35%">Mata Pelajaran / Judul</th><th width="10%">Nilai Akhir</th></tr></thead><tbody>`;
        window.currentFilteredData.forEach((r, i) => { html += `<tr><td class="text-center">${i + 1}</td><td class="text-center">${r.WaktuSubmit}</td><td>${r.NamaSiswa}</td><td class="text-center">${r.KelasSiswa}</td><td>${r.Mapel} - ${r.JudulUjian}</td><td class="text-center" style="font-weight: bold;">${r.TotalNilai}</td></tr>`; });
        html += `</tbody></table><div class="signature"><div><p>${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p><p style="margin-bottom: 70px;">Guru Pengampu / Pengawas</p><p><strong>${namaPengawas}</strong></p></div></div><script>window.onload = function() { window.print();}<\/script></body></html>`;
        const printWin = window.open('', '', 'width=900,height=700'); printWin.document.write(html); printWin.document.close();
      }

      function printRecap(rid) {
        const d = recapDataStore[rid]; if(!d) return;
        let namaPengawas = d.pembuat || user.Nama;
        let detailArr = []; try { detailArr = JSON.parse(d.detail); } catch(e) {}
        let detailHtml = '<table class="data-table"><thead><tr><th width="10%">No</th><th width="20%">Tipe Soal</th><th width="50%">Jawaban Siswa</th><th width="20%">Skor</th></tr></thead><tbody>';
        detailArr.forEach(item => { let n = item.i !== undefined ? item.i : item[0]; let s = item.s !== undefined ? item.s : item[1]; let t = item.t || 'Objektif'; let a = item.a !== undefined ? item.a : ''; let displayAns = Array.isArray(a) ? a.join(', ') : a; displayAns = displayAns ? String(displayAns).replace(/\n/g, '<br>') : '<i style="color:#999;">Tidak dijawab</i>'; detailHtml += `<tr><td style="text-align:center">${n}</td><td style="text-align:center">${t}</td><td>${displayAns}</td><td style="text-align:center">${s}</td></tr>`; });
        detailHtml += '</tbody></table>';
        const printWindow = window.open('', '', 'width=800,height=600');
        printWindow.document.write(`<html><head><title>Cetak Hasil - ${d.nama}</title><style>body{ font-family: 'Times New Roman', Times, serif; padding: 40px; color: #333; } .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 20px; } .score-box { border: 2px solid #000; padding: 15px; text-align: center; margin-bottom: 20px; width: 200px; float: right; } .score { font-size: 38px; font-weight: bold; margin-top: 5px; } .data-table { width: 100%; border-collapse: collapse; margin-top: 15px; } .data-table th, .data-table td { border: 1px solid #000; padding: 8px; } .data-table th { background: #f0f0f0; text-align: center; } .clearfix::after { content: ""; clear: both; display: table; } .footer { margin-top: 50px; text-align: right; } .footer div { display: inline-block; text-align: center; width: 250px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="text-align: right; margin-bottom: 20px;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer; background:#7e22ce; color:white; border:none; border-radius:5px;">Cetak Dokumen</button></div><div class="header"><h2>HASIL UJIAN BERBASIS KOMPUTER</h2><h4>AGIS CBT SYSTEM</h4></div><div class="clearfix"><div class="score-box"><h3>NILAI AKHIR</h3><div class="score">${d.nilai}</div></div><table class="student-info"><tr><td width="150"><strong>Nama Peserta</strong></td><td width="10">:</td><td>${d.nama}</td></tr><tr><td><strong>Mata Pelajaran</strong></td><td>:</td><td>${d.ujian}</td></tr><tr><td><strong>Waktu Cetak</strong></td><td>:</td><td>${new Date().toLocaleString('id-ID')}</td></tr></table></div><h4 style="margin-top:20px; border-bottom:1px solid #ccc; padding-bottom:5px;">Rincian Jawaban & Skor Tiap Soal</h4>${detailHtml}<div class="footer"><div><p>${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p><p style="margin-bottom: 70px;">Guru Pengampu / Pengawas</p><p><strong>${namaPengawas}</strong></p></div></div><script>window.onload = function() { window.print(); }<\/script></body></html>`);
        printWindow.document.close();
      }

      function openKoreksi(rid) {
          const d = recapDataStore[rid]; if (!d) return;
          let detailArr = []; try { detailArr = JSON.parse(d.detail); } catch(e){}
          let html = `<input type="hidden" id="kor-rid" value="${rid}"><div class="alert alert-info border-0 shadow-sm">Siswa: <b>${d.nama}</b><br>Ujian: <b>${d.ujian}</b></div>`;
          html += `<div class="alert alert-warning mb-3">Total Nilai Saat Ini: <b class="fs-5">${d.nilai}</b><br>Anda dapat memodifikasi skor per soal di bawah ini, atau jika ingin memberikan tambahan/katrol nilai massal, silakan gunakan menu <b>Katrol Nilai</b> massal di luar.</div>`;
          
          detailArr.forEach((item, index) => {
              let no = item.i !== undefined ? item.i : item[0]; let score = item.s !== undefined ? item.s : item[1]; let type = item.t || 'Objektif'; let ans = item.a !== undefined ? item.a : ''; let max = item.m !== undefined ? item.m : 0;
              html += `<div class="card mb-2 border-0 shadow-sm"><div class="card-body p-3"><div class="d-flex justify-content-between align-items-center mb-2"><strong class="text-primary">Soal No. ${no} <span class="badge bg-secondary ms-1">${type}</span></strong><div class="fw-bold d-flex align-items-center">Skor: <input type="number" step="0.1" class="form-control form-control-sm d-inline w-auto kor-score ms-2" data-idx="${index}" value="${score}" style="max-width: 80px;"> <span class="ms-1 text-muted">/ ${max}</span></div></div>`;
              let displayAns = Array.isArray(ans) ? ans.join(', ') : ans;
              html += `<div class="p-2 bg-light rounded border small mt-2"><b>Jawaban Siswa:</b><br>${displayAns ? String(displayAns).replace(/\n/g, '<br>') : '<i class="text-muted">Tidak dijawab</i>'}</div></div></div>`;
          });
          $('#kor-body').html(html); $('#modalKoreksi').modal('show');
      }

      function saveKoreksi() {
          const rid = $('#kor-rid').val(); const d = recapDataStore[rid]; let detailArr = JSON.parse(d.detail);
          $('.kor-score').each(function() { detailArr[$(this).data('idx')].s = parseFloat($(this).val()) || 0; });
          let maxTotal = 0, totalScore = 0;
          detailArr.forEach(item => { maxTotal += (item.m || 0); totalScore += (item.s || 0); });
          const finalScore = maxTotal > 0 ? Number(((totalScore / maxTotal) * 100).toFixed(2)) : totalScore;
          
          const btn = $('#btn-save-kor'); btn.prop('disabled', true).text('Menyimpan...');
          window.google.script.run.withSuccessHandler(res => {
              btn.prop('disabled', false).text('Simpan Perubahan');
              if (res.status === 'success') { $('#modalKoreksi').modal('hide'); window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('hasil-rekap'); } 
              else { window.Swal.fire('Gagal', res.msg, 'error'); }
          }).withFailureHandler(err => { btn.prop('disabled', false).text('Simpan Perubahan'); window.Swal.fire('Error', err.message, 'error'); }).adminUpdateResult(rid, finalScore, JSON.stringify(detailArr));
      }

      function renderContent(page) {
          const area = $('#content-area'); let h = '';
          if (page === 'admin-home') {
              h = `<div class="row g-4"><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-primary"><h3>${gData.stats.totalSiswa}</h3><small>Siswa di Kelas Anda</small></div></div><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-success"><h3>${gData.stats.totalUjian}</h3><small>Total Ujian</small></div></div></div>`;
          }
          else if (page === 'admin-ujian') {
              let uniqueMapel = [...new Set(gData.exams.map(e => e.Mapel))];
              let uniqueKelas = [...new Set(gData.exams.map(e => String(e.TargetKelas).trim()))];
              h = `<div class="d-flex justify-content-between mb-3"><button class="btn btn-primary shadow-sm" onclick="window.openExamModal()">+ Buat Jadwal Baru</button>
                   <div class="d-flex gap-2">
                      <select id="filter-mapel-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Mapel</option>${uniqueMapel.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
                      <select id="filter-kelas-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Kelas</option>${uniqueKelas.map(k=>`<option value="${k}">${k}</option>`).join('')}</select>
                   </div></div><div class="row g-4" id="admin-ujian-list">`;
              gData.exams.forEach(e => {
                  const isOwner = (String(user.Role).trim().toLowerCase() === 'admin' || String(e.PembuatID) === String(user.ID));
                  const actionButtons = isOwner ? `<button class="btn btn-sm btn-outline-dark flex-fill" onclick="window.openExamModal('${encodeURIComponent(JSON.stringify(e))}')">Edit</button> <button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.manageQ('${e.ExamID}')"><i class="fas fa-list me-1"></i> Soal</button> <button class="btn btn-sm btn-danger" onclick="window.delExam('${e.ExamID}')"><i class="fas fa-trash"></i></button>` : `<div class="alert alert-light small m-0 p-1 text-center w-100">Read Only</div>`;
                  h += `<div class="col-md-6 col-lg-4 ujian-card" data-mapel="${e.Mapel}" data-kelas="${e.TargetKelas}"><div class="card h-100 shadow-sm border-0"><div class="card-body"><div class="d-flex justify-content-between mb-2"><span class="badge bg-primary">${e.Mapel}</span><span class="badge bg-light text-dark border">${e.TargetKelas}</span></div><h5 class="fw-bold text-dark">${e.Judul}</h5><div class="d-flex gap-2">${actionButtons}</div></div></div></div>`;
              });
              h += '</div>';
          }
          else if (page === 'siswa-home') {
              h = `<div class="card mb-4 border-0 shadow-sm bg-primary text-white"><div class="card-body"><h5 class="fw-bold">Halo, ${user.Nama}</h5></div></div><h5 class="fw-bold mb-3 border-bottom pb-2 text-primary">Ujian Aktif</h5><div class="row g-4 mb-5">`;
              if(!gData.availableExams || gData.availableExams.length === 0) { h += '<div class="col-12"><div class="alert alert-info text-center">Tidak ada ujian aktif saat ini.</div></div>'; } 
              else {
                  gData.availableExams.forEach(e => {
                      let btnState = '', btnText = 'MULAI UJIAN', btnClass = 'btn-primary';
                      if (e.IsFinished) { btnState = 'disabled'; btnText = 'SUDAH DIKERJAKAN / BATAS HABIS'; btnClass = 'btn-secondary'; }
                      else if (e.IsExpired) { btnState = 'disabled'; btnText = 'WAKTU HABIS'; btnClass = 'btn-danger'; }
                      h += `<div class="col-md-6 col-lg-4"><div class="card h-100 shadow-sm border-0"><div class="card-body"><h5 class="fw-bold text-primary">${e.Judul}</h5><div class="mb-2"><span class="badge bg-primary">${e.Mapel}</span> <span class="badge bg-light text-dark border">${e.Durasi} Menit</span></div><button class="btn ${btnClass} w-100 fw-bold shadow-sm" onclick="window.startExam('${e.ExamID}')" ${btnState}>${btnText}</button></div></div></div>`;
                  });
              }
              h += '</div><h5 class="fw-bold mb-3 border-bottom pb-2 mt-4 text-primary"><i class="fas fa-history me-2"></i>Riwayat</h5>';
              if(!gData.history || gData.history.length === 0) { h += '<p class="text-muted fst-italic">Belum ada riwayat.</p>'; } 
              else {
                  h += `<div class="table-responsive bg-white rounded shadow-sm p-3"><table class="table table-hover align-middle mb-0"><thead><tr class="table-light"><th>Tanggal</th><th>Ujian</th><th>Nilai</th><th>Status</th></tr></thead><tbody>`;
                  gData.history.forEach(r => { h += `<tr><td>${r.WaktuSubmit}</td><td><div class="fw-bold">${r.Judul}</div></td><td><span class="badge bg-warning text-dark">${r.Nilai}</span></td><td><span class="badge bg-success">Selesai</span></td></tr>`; });
                  h += `</tbody></table></div>`;
              }
          }
          area.html(h);
      }

      function filterAdminUjian() {
          const m = $('#filter-mapel-ujian').val(); const k = $('#filter-kelas-ujian').val();
          $('.ujian-card').each(function() {
              const matchMapel = m === '' || $(this).data('mapel') === m;
              const matchKelas = k === '' || $(this).data('kelas') === k;
              $(this).toggle(matchMapel && matchKelas);
          });
      }

      function openExamModal(str) {
        $('#modalExam').modal('show');
        let d = null;
        if(str) {
          d = JSON.parse(decodeURIComponent(str));
          $('#ex-id').val(d.ExamID); $('#ex-judul').val(d.Judul); $('#ex-mapel').val(d.Mapel); $('#ex-durasi').val(d.Durasi);
          $('#ex-limit').val(d.LimitTries || 1); $('#ex-start').val(d.StartDate.replace(' ','T')); $('#ex-end').val(d.EndDate.replace(' ','T'));
          $('#ex-token').val(d.Token || ''); $('#ex-randomQ').prop('checked', d.RandomQ === 'Yes'); $('#ex-showStats').prop('checked', d.ShowStats === 'Yes');
          $('#ex-violations').val(d.MaxViolations || 3);
        } else {
          $('#modalExam form')[0].reset(); $('#ex-id').val(''); $('#ex-token').val('');
          $('#ex-violations').val(3); $('#ex-limit').val(1);
        }

        const role = String(user.Role).trim().toLowerCase();
        const container = $('#kelas-container');

        if (role === 'guru') {
          const kelasArr = String(user.Kelas).split(',').map(k => k.trim()).filter(k => k);
          let selectedKelas = d ? String(d.TargetKelas).split(',').map(k => k.trim()) : kelasArr;

          let htmlKelas = `<div class="d-flex flex-wrap gap-2 mt-2">`;
          kelasArr.forEach(k => {
            const isChecked = selectedKelas.includes(k) ? 'checked' : '';
            htmlKelas += `<div class="form-check"><input class="form-check-input kls-cb" type="checkbox" value="${k}" id="cb-${k}" ${isChecked}><label class="form-check-label small" for="cb-${k}">${k}</label></div>`;
          });
          htmlKelas += `</div><input type="hidden" name="targetKelas" id="ex-kelas-hidden">`;
          
          container.html(htmlKelas);
        } else {
          let valKelas = d ? d.TargetKelas : '';
          container.html(`<input type="text" name="targetKelas" id="ex-kelas" class="form-control" placeholder="Contoh: 7A, 7B" value="${valKelas}" required>`);
        }
      }

      function saveExam() {
        const formEl = document.getElementById('frm-exam'); 
        const fd = new FormData(formEl); 
        const d = Object.fromEntries(fd.entries());

        if (String(user.Role).trim().toLowerCase() === 'guru') {
          let selectedKls = [];
          $('.kls-cb:checked').each(function() { selectedKls.push($(this).val()); });
          if (selectedKls.length === 0) return window.Swal.fire('Error', 'Pilih minimal 1 target kelas!', 'error');
          d.targetKelas = selectedKls.join(', ');
        }

        d.showStats = $('#ex-showStats').is(':checked') ? 'Yes' : 'No'; 
        d.randomQ = $('#ex-randomQ').is(':checked') ? 'Yes' : 'No'; 
        d.userRole = user.Role; 
        d.userClass = user.Kelas;
        d.userId = user.ID;
        
        if (!d.judul || !d.mapel || !d.start || !d.end || !d.targetKelas) {
          return window.Swal.fire('Error', 'Lengkapi data!', 'error');
        }
        
        window.showLoad(true);
        window.google.script.run.withSuccessHandler((res) => {
          if(res.status === 'success') {
            $('#modalExam').modal('hide');
            window.google.script.run.withSuccessHandler(res2 => {
              window.showLoad(false);
              if (res2.status === 'success') { 
                gData = res2.data; 
                window.renderContent('admin-ujian'); 
                window.toast('success', 'Jadwal Disimpan!'); 
              } else {
                window.Swal.fire('Gagal', res2.msg, 'error');
              }
            }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).getDashboardData(user.Role, user.ID, user.Kelas);
          } else { 
            window.showLoad(false); 
            window.Swal.fire('Gagal', res.msg, 'error'); 
          }
        }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminSaveExam(d);
      }

      function delExam(id){ window.Swal.fire({title:'Hapus Jadwal?', icon:'warning', showCancelButton:true}).then(r=>{if(r.isConfirmed) { window.showLoad(true); window.google.script.run.withSuccessHandler(()=>{window.showLoad(false); window.loadPage('admin-ujian')}).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error')}).adminDeleteExam(id, user.ID, user.Role); } }) }

      function manageQ(id) { activeExamId = id; $('#modalQ').modal('show'); window.loadQList(); }

      function generateQuestionExcelTemplate() {
          const ws_data = [
              ["Nomor", "Tipe", "Skor", "Pertanyaan", "Opsi (Pisahkan dgn |)", "Kunci (Pisahkan dgn |)"],
              [1, "PGS", 10, "Apa ibukota Indonesia?", "Jakarta|Bandung|Bali", "Jakarta"]
          ];
          const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
          const wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, "TemplateSoal");
          window.XLSX.writeFile(wb, "Template_Upload_Soal.xlsx");
      }

      function handleUploadQuestionsExcel(e) {
          const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
          reader.onload = function(evt) {
              const data = evt.target.result; const workbook = window.XLSX.read(data, {type: 'binary'});
              const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const json = window.XLSX.utils.sheet_to_json(worksheet);
              let formattedData = json.map(row => {
                  let opsRaw = row['Opsi (Pisahkan dgn |)'] ? String(row['Opsi (Pisahkan dgn |)']).split('|') : [];
                  let keyRaw = row['Kunci (Pisahkan dgn |)'] ? String(row['Kunci (Pisahkan dgn |)']).split('|') : [];
                  return { num: row['Nomor'] || 1, type: row['Tipe'] || 'PGS', score: row['Skor'] || 10, text: row['Pertanyaan'] || '', options: opsRaw, key: keyRaw };
              }).filter(q => q.text !== '');
              if(formattedData.length === 0) return window.Swal.fire('Error', 'Format tidak valid.', 'error');
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(res => {
                  window.showLoad(false); if(res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadQList(); } else window.Swal.fire('Gagal', res.msg, 'error');
              }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminBatchSaveQuestions(activeExamId, formattedData, user.ID);
          };
          reader.readAsBinaryString(file);
      }

      function loadQList() {
          $('#q-list-container').html('<div class="text-center p-5"><div class="spinner"></div></div>');
          window.google.script.run.withSuccessHandler(qs => {
              let html = ''; lastQuestionNum = 0; currentQuestionsData = qs || [];
              let topActions = `
              <div class="d-flex justify-content-end mb-3 gap-2 flex-wrap">
                  <button class="btn btn-outline-info shadow-sm" onclick="window.generateQuestionExcelTemplate()"><i class="fas fa-download"></i> Template Excel</button>
                  <label class="btn btn-primary shadow-sm m-0"><i class="fas fa-upload"></i> Upload Excel <input type="file" hidden accept=".xlsx,.xls" onchange="window.handleUploadQuestionsExcel(event)"></label>
                  <button class="btn btn-info text-white shadow-sm" onclick="window.previewAllQ()"><i class="fas fa-eye me-1"></i> Preview Semua</button>
                  <button class="btn btn-primary shadow-sm" onclick="window.downloadAllQ()"><i class="fas fa-download me-1"></i> Download Ujian</button>
              </div>`;
              if (qs && qs.length > 0) {
                  lastQuestionNum = Math.max(...qs.map(q => Number(q.Nomor) || 0));
                  qs.forEach((q, idx) => { html += window.renderQuestionBlock(q, idx); });
                  $('#q-list-container').html(topActions + html); window.applyMathJax();
              } else { $('#q-list-container').html(topActions + '<div class="alert alert-info text-center">Belum ada soal. Klik Tambah Soal atau Upload Excel.</div>'); }
          }).withFailureHandler(err => window.Swal.fire('Error', err.message, 'error')).getExamQuestions(activeExamId);
      }

      function addNewQuestionBlock() {
          lastQuestionNum++; const newBlock = window.renderQuestionBlock({ Nomor: lastQuestionNum }, lastQuestionNum - 1);
          $('#q-list-container').append(newBlock); const uid = $(newBlock).attr('data-id');
          window.toggleEditQ(uid); $('.modal-body').animate({ scrollTop: $('.modal-body')[0].scrollHeight }, 500);
      }

      function generateQHTML(q) {
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
      }

      function previewAllQ() {
          const htmlContent = window.generateAllQHTML();
          if(!htmlContent) return window.Swal.fire('Kosong', 'Belum ada soal untuk dipreview.', 'info');
          if($('#modalPreviewQ').length === 0) {
              $('body').append(`<div class="modal fade" id="modalPreviewQ" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header bg-info text-white"><h5 class="modal-title fw-bold"><i class="fas fa-desktop me-2"></i> Preview Seluruh Soal</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body bg-light" id="preview-q-body"></div></div></div></div>`);
          }
          $('#preview-q-body').html(htmlContent); $('#modalPreviewQ').modal('show'); window.applyMathJax();
      }

      function downloadAllQ() {
          const htmlContent = window.generateAllQHTML();
          if(!htmlContent) return window.Swal.fire('Kosong', 'Belum ada soal untuk didownload.', 'info');
          const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Preview Soal Ujian</title><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet"><script src="https://polyfill.io/v3/polyfill.min.js?features=es6"><\/script><script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"><\/script><style>body { font-family: 'Poppins', Arial, sans-serif; background-color: #f1f5f9; padding: 40px; margin: 0; display:flex; justify-content:center; } .container { max-width: 800px; width: 100%; } img { max-width: 100%; height: auto; border-radius: 6px; margin: 5px 0; }</style></head><body><div class="container">${htmlContent}</div><script>window.onload = function() { setTimeout(window.print, 1000); }<\/script></body></html>`;
          const blob = new Blob([html], {type: "text/html;charset=utf-8"}); const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `Soal_Ujian_Lengkap.html`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      }

      function renderQuestionBlock(q, idx) {
          const uid = q.QID ? q.QID : 'NEW_' + Math.random().toString(36).substr(2, 9);
          const nomor = q.Nomor || (idx + 1); const cleanPrev = (q.Pertanyaan || 'Soal Baru').replace(/<[^>]+>/g, '').substring(0, 80) + '...';
          const safeJson = encodeURIComponent(JSON.stringify(q)); 
          return `<div class="card mb-4 border-0 shadow-sm q-block" id="block-${uid}" data-id="${uid}" data-q-obj="${safeJson}"><div class="card-header bg-white d-flex justify-content-between align-items-center py-3"><span class="badge bg-primary rounded-pill px-3">No. ${nomor}</span><div><button class="btn btn-sm btn-outline-secondary me-2" onclick="window.toggleEditQ('${uid}')"><i class="fas fa-edit"></i> Edit</button><button class="btn btn-sm btn-outline-danger" onclick="window.deleteQBlock('${uid}')"><i class="fas fa-trash"></i></button></div></div><div class="card-body"><div class="q-preview mb-2 fw-bold text-muted">${cleanPrev}</div><div class="q-form hidden" id="form-${uid}"><form id="frm-q-${uid}" onsubmit="event.preventDefault(); window.saveQBlock('${uid}'); return false;"><input type="hidden" name="id" value="${q.QID || ''}"><div class="row g-2 mb-3"><div class="col-md-2"><label class="small fw-bold">No</label><input type="number" name="num" class="form-control" value="${nomor}"></div><div class="col-md-4"><label class="small fw-bold">Tipe</label><select name="type" class="form-select q-type-sel" onchange="window.renderAnsFields('${uid}', this.value)" id="type-${uid}"><option value="PGS" ${q.Tipe=='PGS'?'selected':''}>Pilihan Ganda</option><option value="PGK" ${q.Tipe=='PGK'?'selected':''}>PG Kompleks</option><option value="PGKK" ${q.Tipe=='PGKK'?'selected':''}>Benar Salah</option><option value="Menjodohkan" ${q.Tipe=='Menjodohkan'?'selected':''}>Menjodohkan</option><option value="Uraian" ${q.Tipe=='Uraian'?'selected':''}>Uraian</option></select></div><div class="col-md-2"><label class="small fw-bold">Skor</label><input type="number" step="0.1" name="score" class="form-control" value="${q.Skor || 10}"></div></div><label class="small fw-bold mb-1">Pertanyaan</label><textarea id="sn-${uid}" name="text">${q.Pertanyaan || ''}</textarea><div class="card mt-3 bg-light"><div class="card-body"><label class="small fw-bold mb-2">Jawaban & Kunci</label><div id="ans-area-${uid}"></div></div></div><div class="text-end mt-3"><button type="button" class="btn btn-secondary me-1" onclick="window.toggleEditQ('${uid}')">Tutup</button><button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Simpan</button></div></form></div></div></div>`;
      }

      function toggleEditQ(uid) { 
          const form = $(`#form-${uid}`); 
          if (form.hasClass('hidden')) { 
              activeUid = uid; form.removeClass('hidden'); $(`#block-${uid}`).addClass('border-primary'); 
              $(`#sn-${uid}`).summernote(snConfig); window.renderAnsFields(uid, $(`#type-${uid}`).val());
          } else { 
              form.addClass('hidden'); $(`#block-${uid}`).removeClass('border-primary'); 
              $(`#sn-${uid}`).summernote('destroy'); $(`#ans-area-${uid} .summernote-opt`).each(function(){ $(this).summernote('destroy'); }); 
          } 
      }

      function renderAnsFields(uid, type) { 
          const block = $(`#block-${uid}`); let qData = {}; 
          try { qData = JSON.parse(decodeURIComponent(block.attr('data-q-obj'))); } catch(e){} 
          const opts = (qData.Tipe === type) ? JSON.parse(qData.Options || "[]") : [];
          const keys = (qData.Tipe === type) ? JSON.parse(qData.Key || "[]") : []; 
          $(`#ans-area-${uid} .summernote-opt`).each(function(){ $(this).summernote('destroy'); }); let h = '';
          
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
          $(`#ans-area-${uid}`).html(h); $(`#ans-area-${uid} .summernote-opt`).summernote(snConfig); 
      }

      function genOptRow(uid, type, val='', checked='') { return `<div class="d-flex align-items-start mb-2 ans-row gap-2"><div class="mt-2"><input type="${type}" name="k_${uid}" class="form-check-input" ${checked}></div><div class="flex-grow-1"><textarea class="summernote-opt">${val}</textarea></div><button type="button" class="btn btn-outline-danger mt-1" onclick="window.removeOptRow(this)">X</button></div>`; }
      function genPGKKRow(q='', k='B') { return `<tr><td><textarea class="summernote-opt pgkk-q">${q}</textarea></td><td><select class="form-select pgkk-k"><option value="B" ${k=='B'?'selected':''}>Benar</option><option value="S" ${k=='S'?'selected':''}>Salah</option></select></td><td><button type="button" class="btn btn-danger btn-sm" onclick="$(this).closest('tr').remove()">X</button></td></tr>`; }
      function genMatchRow(l='', r='') { return `<tr><td><textarea class="summernote-opt match-l">${l}</textarea></td><td><textarea class="summernote-opt match-r">${r}</textarea></td><td><button type="button" class="btn btn-danger btn-sm" onclick="$(this).closest('tr').remove()">X</button></td></tr>`; }

      function addOptRow(uid, t) { const el = $(window.genOptRow(uid, t)); $(`#opts-wrap-${uid}`).append(el); el.find('.summernote-opt').summernote(snConfig); }
      function addPGKKRowTo(uid) { const el = $(window.genPGKKRow()); $(`#pgkk-tbody-${uid}`).append(el); el.find('.summernote-opt').summernote(snConfig); }
      function addMatchRowTo(uid) { const el = $(window.genMatchRow()); $(`#match-tbody-${uid}`).append(el); el.find('.summernote-opt').summernote(snConfig); }
      function removeOptRow(btn) { $(btn).closest('.ans-row').remove(); }

      function saveQBlock(uid) {
          const form = $(`#frm-q-${uid}`); const type = form.find('select[name="type"]').val(); const text = $(`#sn-${uid}`).summernote('code');
          const score = form.find('input[name="score"]').val(); const num = form.find('input[name="num"]').val();
          const id = form.find('input[name="id"]').val(); let opts=[], keys=[], keyIndices=[];
          
          if (type === 'PGS' || type === 'PGK') { 
              $(`#opts-wrap-${uid} .ans-row`).each(function(){ 
                  const v = $(this).find('.summernote-opt').summernote('code'); 
                  if(v && v !== '<p><br></p>'){ opts.push(v); if($(this).find('.form-check-input').is(':checked')) { keys.push(v); keyIndices.push(opts.length - 1); } } 
              });
          } else if(type==='PGKK') { 
              $(`#pgkk-tbody-${uid} tr`).each(function(){ const q = $(this).find('.pgkk-q').summernote('code'); if(q){ opts.push(q); keys.push($(this).find('.pgkk-k').val()); } });
          } else if(type==='Menjodohkan') { 
              $(`#match-tbody-${uid} tr`).each(function(){ const l = $(this).find('.match-l').summernote('code'); const r = $(this).find('.match-r').summernote('code'); if(l && r){ opts.push(l); keys.push(r); } });
          } else { keys = form.find('textarea[name="essay_key"]').val().split(','); } 
          
          const payload={id:id, num:num, type:type, text:text, options:opts, key:keys, keyIndices:keyIndices, score:score, userId: user.ID}; 
          const btn=form.find('button[type="submit"]'); btn.prop('disabled',true).text('Menyimpan...');
          window.google.script.run.withSuccessHandler(res=>{
              btn.prop('disabled',false).text('Simpan');
              if(res.status==='success'){
                  window.toast('success','Soal Disimpan!');
                  const newData={QID:res.id, Tipe:type, Pertanyaan:text, Options:JSON.stringify(opts), Key:JSON.stringify(keys), Skor:score, Nomor:num};
                  $(`#block-${uid}`).attr('data-q-obj', encodeURIComponent(JSON.stringify(newData))).find('input[name="id"]').val(res.id);
                  $(`#block-${uid} .q-preview`).html('Soal Tersimpan');
                  window.toggleEditQ(uid);
                  const existingIdx = currentQuestionsData.findIndex(q => String(q.QID) === String(res.id));
                  if (existingIdx !== -1) currentQuestionsData[existingIdx] = newData;
                  else { currentQuestionsData.push(newData); currentQuestionsData.sort((a,b) => (Number(a.Nomor)||999) - (Number(b.Nomor)||999)); }
              } else window.Swal.fire('Error',res.msg,'error');
          }).withFailureHandler(err => { btn.prop('disabled',false).text('Simpan'); window.Swal.fire('Error', err.message, 'error'); }).adminSaveSingleQuestion(activeExamId, payload);
      }

      function deleteQBlock(uid) {
          const id=$(`#block-${uid}`).find('input[name="id"]').val();
          if(!id){ $(`#block-${uid}`).remove(); return; }
          window.Swal.fire({title:'Hapus Soal?',icon:'warning',showCancelButton:true}).then(r=>{
              if(r.isConfirmed){
                  $(`#block-${uid}`).fadeOut();
                  window.google.script.run.withFailureHandler(err=>window.Swal.fire('Error', err.message, 'error')).adminDeleteQuestion(id, user.ID, user.Role);
                  currentQuestionsData = currentQuestionsData.filter(q => String(q.QID) !== String(id));
              }
          });
      }

      function startExam(eid) {
          try { if (screen.orientation && screen.orientation.unlock) { screen.orientation.unlock(); } } catch (e) {}
          const rules = `<div class="text-start small"><b>TATA CARA & ATURAN UJIAN:</b><br><br>1. Ujian ini menggunakan <b>Layar Penuh (Fullscreen)</b>.<br>2. Jangan keluar dari mode layar penuh selama ujian berlangsung.<br>3. Jangan membuka aplikasi, tab baru, atau split layar.<br>4. Sistem akan mendeteksi pelanggaran. Jika Anda melanggar terus menerus, maka jawaban akan <b>otomatis terkirim</b>.<br>5. Kerjakan dengan jujur dan fokus.</div>`;
          window.Swal.fire({ title: 'Peraturan Ujian', html: rules, icon: 'warning', showCancelButton: true, confirmButtonText: 'SETUJU & MULAI', confirmButtonColor: '#7e22ce' }).then(r => {
              if(r.isConfirmed) {
                  if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen().catch(()=>{}); }
                  window.showLoad(true);
                  window.google.script.run.withSuccessHandler(res => {
                      window.showLoad(false);
                      if(res.status === 'success') {
                          localStorage.removeItem(`ANS_${user.ID}_${eid}`); activeExamId = eid; totalQ = res.data.length; activeExamViolations = res.maxViolations || 3;
                          $('#do-exam-title').html(`${res.judul} <span class="mx-2">|</span> ${user.Nama}`);
                          try { localStorage.setItem('cbt_active_exam', JSON.stringify({ id: eid, qs: res.data, dur: res.duration, maxV: activeExamViolations, start: Date.now(), judul: res.judul, token: res.token })); } catch(e) {}
                          violationCount = 0; $('#viol-disp').text(violationCount); window.enableSecurity(); window.runExam(res.data, res.duration, false);
                      } else window.Swal.fire('Gagal', res.msg, 'error');
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).getExamPack(eid, user.ID);
              }
          });
      }

      function refreshUjianSiswa() {
          window.Swal.fire({ title: 'Refresh Data Ujian?', text: 'Ini akan menyegarkan data soal tanpa menghilangkan jawaban Anda yang sudah tersimpan di sistem.', icon: 'info',Baik, ini adalah **Tahap 3** untuk menyempurnakan halaman muka (Login) sesuai dengan permintaan Anda. 

Pada pembaruan ini, saya merombak kembali tata letak login menjadi model *Split Screen* (Terbelah Dua):
1. **Sisi Kiri:** Terdapat penjelasan menarik tentang keunggulan CBT (Performa Cepat, Anti-Kecurangan, dll) dengan desain kotak tembus pandang yang elegan berlatar belakang gradasi ungu-hijau.
2. **Sisi Kanan:** Form login yang bersih dan modern.
3. **Footer:** Ditempatkan di tengah bawah, tepat di bawah kotak login utama (bukan di samping).

Silakan **timpa seluruh isi file `app/page.js`** Anda dengan kode lengkap berikut:

```javascript
"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export default function Page() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true); // Cegah error crash "Page couldn't load" di Vercel

    if (typeof window === "undefined" || window.appInitialized) return;
    window.appInitialized = true;

    const initApp = () => {
      if (!window.jQuery || !window.Swal) {
        setTimeout(initApp, 100);
        return;
      }

      const $ = window.jQuery;

      // ==========================================
      // PROXY API: PENGGANTI GOOGLE.SCRIPT.RUN
      // ==========================================
      window.google = {
        script: {
          run: new Proxy({}, {
            get: function (target, prop) {
              if (prop === "withSuccessHandler") {
                return function (fn) { target.successFn = fn; return new Proxy(target, this); }.bind(this);
              }
              if (prop === "withFailureHandler") {
                return function (fn) { target.failureFn = fn; return new Proxy(target, this); }.bind(this);
              }
              return function (...args) {
                fetch("/api/cbt", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: prop, args: args }),
                })
                  .then((r) => r.json())
                  .then((res) => { if (target.successFn) target.successFn(res); })
                  .catch((err) => { if (target.failureFn) target.failureFn(err); });
              };
            },
          }),
        },
      };

      // ==========================================
      // ORIGINAL JAVASCRIPT LOGIC
      // ==========================================
      let examSubmitting = false;
      let user = null;
      let gData = {};
      let gAdminData = { exams: [], users: [] };
      let activeExamId = null;
      let activeExamViolations = 3;
      let timerInt, monitorInterval, autosaveInterval;
      let totalQ = 0;
      let currentQuestionsData = [];
      let currentQIdx = 0;
      let activeUid = '';
      let recapAllData = [];
      let recapDataStore = {};
      let violationCount = 0;
      let isExamFinished = false;
      let violationLock = false;

      const LOGO_BARU = "[https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk](https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk)";
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      let finalBeepOsc = null;
      let beepInterval = null;

      function playBeep(times, continuous = false) {
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
      }

      function stopContinuousBeep() {
          if (finalBeepOsc) { try { finalBeepOsc.stop(); finalBeepOsc.disconnect(); } catch(e){} finalBeepOsc = null; }
          if (beepInterval) { clearTimeout(beepInterval); beepInterval = null; }
      }

      const MathButton = function (context) {
          const ui = $.summernote.ui;
          const button = ui.button({
              contents: '<i class="fas fa-square-root-alt"></i> Rumus',
              tooltip: 'Tambahkan Rumus Matematika (LaTeX)',
              click: function () {
                  window.Swal.fire({
                      title: 'Editor Rumus (LaTeX)',
                      html: `<div class="text-start small mb-2 text-muted">Pilih template cepat atau ketik format LaTeX secara manual:</div>
                             <div class="d-flex flex-wrap gap-1 mb-3">
                               <button class="btn btn-sm btn-outline-secondary" onclick="$('#swal-math-input').val($('#swal-math-input').val() + '\\\\frac{a}{b}')">Pecahan (a/b)</button>
                               <button class="btn btn-sm btn-outline-secondary" onclick="$('#swal-math-input').val($('#swal-math-input').val() + 'x^{2}')">Pangkat</button>
                               <button class="btn btn-sm btn-outline-secondary" onclick="$('#swal-math-input').val($('#swal-math-input').val() + '\\\\sqrt{x}')">Akar</button>
                               <button class="btn btn-sm btn-outline-secondary" onclick="$('#swal-math-input').val($('#swal-math-input').val() + '\\\\sum')">Sigma</button>
                             </div>
                             <textarea id="swal-math-input" class="form-control font-monospace" rows="3" placeholder="Ketik rumus LaTeX di sini..."></textarea>`,
                      showCancelButton: true,
                      confirmButtonText: 'Sisipkan Rumus',
                      cancelButtonText: 'Batal'
                  }).then((result) => {
                      if (result.isConfirmed) {
                          const mathText = $('#swal-math-input').val();
                          if(mathText) context.invoke('editor.insertText', ` $$ ${mathText} $$ `);
                      }
                  });
              }
          });
          return button.render();
      }

      const snConfig = { 
          height: 180, 
          toolbar: [['style', ['bold', 'italic', 'underline', 'clear']], ['para', ['ul', 'ol']], ['insert', ['picture', 'table', 'link', 'math']]],
          buttons: { math: MathButton }
      };

      function applyMathJax() { if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise().catch(()=>{}); }

      function checkResumeExam() {
          const savedExam = localStorage.getItem('cbt_active_exam');
          if(savedExam) {
              try {
                  const examState = JSON.parse(savedExam);
                  if(examState && examState.id) {
                      window.Swal.fire({ title: 'Lanjutkan Ujian?', text: 'Terdeteksi sesi ujian yang belum selesai.', icon: 'info', confirmButtonText: 'Lanjutkan', allowOutsideClick: false }).then(() => {
                          activeExamId = examState.id; totalQ = examState.qs.length; activeExamViolations = examState.maxV || 3;
                          $('#do-exam-title').html(`${examState.judul} <span class="mx-2">|</span> ${user.Nama}`);
                          if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen().catch(()=>{}); }
                          window.runExam(examState.qs, examState.dur, true);
                      });
                  }
              } catch(e) { localStorage.removeItem('cbt_active_exam'); }
          }
      }

      function toggleSidebar() { $('#sidebar').toggleClass('active'); $('#sidebar-overlay').toggleClass('active'); }
      function showLoad(s) { s ? $('#loader').removeClass('hidden') : $('#loader').addClass('hidden'); }
      function toast(icon, title) { window.Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000}).fire({icon: icon, title: title}); }

      function handleLogin() {
          window.showLoad(true);
          window.google.script.run.withSuccessHandler(res => {
              window.showLoad(false);
              if(res.status === 'success') {
                  user = res.data; user.LogoUrl = LOGO_BARU; 
                  localStorage.setItem('cbt_user', JSON.stringify(user));
                  $('#logo-container img').attr('src', LOGO_BARU);
                  window.initDash();
              } else window.Swal.fire('Gagal', res.msg, 'error');
          }).withFailureHandler(err => {
              window.showLoad(false); window.Swal.fire('Error', 'Koneksi ke server gagal. ' + err.message, 'error');
          }).loginUser($('#u-login').val(), $('#p-login').val());
      }

      function handleLogout() {
          window.Swal.fire({ title: 'Logout?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' }).then((r) => {
              if(r.isConfirmed) {
                  window.stopContinuousBeep();
                  localStorage.removeItem('cbt_user'); localStorage.removeItem('cbt_active_exam'); user = null;
                  clearInterval(timerInt); clearInterval(monitorInterval); clearInterval(autosaveInterval); activeExamId = null;
                  $('#view-dashboard').addClass('hidden'); $('#view-exam').addClass('hidden'); $('body').removeClass('exam-mode');
                  $('#u-login').val(''); $('#p-login').val(''); $('#view-auth').show(); 
                  $('#sidebar').removeClass('active'); $('#sidebar-overlay').removeClass('active');
              }
          });
      }

      function initDash() {
          $('#view-auth').hide(); $('#view-dashboard').removeClass('hidden'); $('#u-name-disp').text(user.Nama);
          const role = String(user.Role || '').trim().toLowerCase(); $('#user-role-disp').text(role.toUpperCase());
          $('.components').addClass('hidden');
          
          if(role === 'siswa') { $('#menu-siswa').removeClass('hidden'); window.loadPage('siswa-home'); } 
          else if(role === 'guru') { $('#menu-guru').removeClass('hidden'); window.loadPage('admin-home'); } 
          else if(role === 'admin') { $('#menu-admin').removeClass('hidden'); window.loadPage('admin-home'); } 
          else { window.Swal.fire('Akses Ditolak', 'Role akun Anda tidak dikenali sistem.', 'error'); }
      }

      function appRefresh() {
          const activeLink = $('.nav-link.active');
          if (activeLink.length > 0) {
              const onclickAttr = activeLink.attr('onclick');
              if(onclickAttr) { 
                  const match = onclickAttr.match(/'([^']+)'/); 
                  if(match && match[1]) window.loadPage(match[1]); 
              }
          } else {
              window.loadPage('admin-home');
          }
      }

      function loadPage(page) {
          clearInterval(timerInt); clearInterval(monitorInterval); clearInterval(autosaveInterval); window.disableSecurity(); window.stopContinuousBeep();
          $('#view-exam').addClass('hidden'); $('#view-dashboard').removeClass('hidden'); $('body').removeClass('exam-mode');
          $('#page-title').text(page.replace('-', ' ').toUpperCase());
          $('.nav-link').removeClass('active'); $(`a[onclick="window.loadPage('${page}')"]`).addClass('active');
          if(window.innerWidth <= 768) { $('#sidebar').removeClass('active'); $('#sidebar-overlay').removeClass('active'); }
          
          if(page === 'admin-users') {
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(r => {
                  window.showLoad(false);
                  if(r.status === 'success') { window.renderUsers(r.data); } else { window.Swal.fire('Error', r.msg, 'error'); }
              }).withFailureHandler(e => { window.showLoad(false); window.Swal.fire('Error', e.message, 'error'); }).getUserList(user.Role, user.ID, user.Kelas);
              return;
          }
          if(page === 'hasil-rekap') {
              $('#content-area').html('<div class="text-center p-5"><div class="spinner"></div></div>');
              window.google.script.run.withSuccessHandler(r => {
                  if(r.status === 'success') { recapAllData = r.data; window.renderRecapTable(); }
                  else { $('#content-area').html(`<div class="alert alert-danger">${r.msg}</div>`); window.Swal.fire('Error', r.msg, 'error'); }
              }).withFailureHandler(e => { window.Swal.fire('Error', e.message, 'error'); }).getRecapList(user.Role, user.ID, user.Kelas);
              return;
          }
          if(page === 'guru-monitoring') { window.renderMonitoring(); return; }
          if(page === 'admin-administrasi') {
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(r => {
                  window.showLoad(false);
                  if(r.status === 'success') { gAdminData = r; window.renderAdministrasi(); } 
                  else { window.Swal.fire('Error', r.msg, 'error'); }
              }).withFailureHandler(e => { window.showLoad(false); window.Swal.fire('Error', e.message, 'error'); }).getAdminData(user.Role, user.ID, user.Kelas);
              return;
          }
          
          window.showLoad(true);
          window.google.script.run.withSuccessHandler(res => {
              window.showLoad(false);
              if (res.status === 'success') { gData = res.data; window.renderContent(page); window.applyMathJax(); } 
              else { window.Swal.fire('Error', res.msg, 'error'); }
          }).withFailureHandler(e => { window.showLoad(false); window.Swal.fire('Error', e.message || 'Gagal memuat dashboard', 'error'); }).getDashboardData(user.Role, user.ID, user.Kelas);
      }

      function exportToExcel(tableId, filename) {
          const table = document.getElementById(tableId);
          const wb = window.XLSX.utils.table_to_book(table, {sheet: "Rekap Nilai"});
          window.XLSX.writeFile(wb, filename + '.xlsx');
      }

      function generateUserExcelTemplate() {
          const ws_data = [
              ["Nama", "Username", "Password", "Role", "Sekolah", "Kelas"],
              ["Siswa Teladan", "siswa01", "12345", "Siswa", "BELAJAR INOVASI", "10A"],
              ["Guru Budi", "guru01", "guru123", "Guru", "BELAJAR INOVASI", "10A,10B"]
          ];
          const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
          const wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, "TemplateUser");
          window.XLSX.writeFile(wb, "Template_Upload_User.xlsx");
      }

      function handleUploadUsersExcel(e) {
          const file = e.target.files[0]; if(!file) return;
          const reader = new FileReader();
          reader.onload = function(evt) {
              const data = evt.target.result; const workbook = window.XLSX.read(data, {type: 'binary'});
              const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const json = window.XLSX.utils.sheet_to_json(worksheet);
              let formattedData = json.map(row => ({
                  nama: row['Nama'] || '', username: row['Username'] || '', password: String(row['Password'] || ''),
                  role: row['Role'] || 'Siswa', sekolah: row['Sekolah'] || '-', kelas: String(row['Kelas'] || '-')
              })).filter(u => u.nama && u.username);
              if(formattedData.length === 0) return window.Swal.fire('Error', 'Data kosong atau format salah.', 'error');
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(res => {
                  window.showLoad(false);
                  if(res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('admin-users'); } 
                  else window.Swal.fire('Gagal', res.msg, 'error');
              }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminBatchSaveUsers(formattedData);
          };
          reader.readAsBinaryString(file);
      }

      function toggleAllCb(type) { const isChecked = $(`#cb-all-${type}`).is(':checked'); $(`.cb-${type}`).prop('checked', isChecked); window.checkBulkDelete(type); }
      function checkBulkDelete(type) { const count = $(`.cb-${type}:checked`).length; if(count > 0) $(`#btn-bulk-del-${type}`).removeClass('hidden'); else $(`#btn-bulk-del-${type}`).addClass('hidden'); }

      function bulkDeleteUsers() {
          const ids = []; $('.cb-user:checked').each(function(){ ids.push($(this).val()); });
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
      }

      function bulkDeleteRekap() {
          const rids = []; $('.cb-rekap:checked').each(function(){ rids.push($(this).val()); });
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
      }

      function renderUsers(users) {
          const cleanRole = String(user.Role).trim().toLowerCase(); const isAdmin = cleanRole === 'admin';
          let h = `<div class="d-flex justify-content-between mb-3 flex-wrap gap-2">
              <div>
                  ${isAdmin ? `<button class="btn btn-success shadow-sm me-2" onclick="$('#modalUser').modal('show');$('#modalUser form')[0].reset();$('#mu-id').val('');">+ Tambah User</button>
                  <button class="btn btn-outline-info shadow-sm me-2" onclick="window.generateUserExcelTemplate()"><i class="fas fa-download"></i> Template Excel</button>
                  <label class="btn btn-primary shadow-sm m-0 me-2"><i class="fas fa-upload"></i> Upload Excel <input type="file" hidden accept=".xlsx,.xls" onchange="window.handleUploadUsersExcel(event)"></label>
                  <button id="btn-bulk-del-users" class="btn btn-danger hidden shadow-sm me-2" onclick="window.bulkDeleteUsers()"><i class="fas fa-trash"></i> Hapus Terpilih</button>` : `<h5 class="fw-bold text-primary mb-0"><i class="fas fa-users me-2"></i>Data Siswa Kelas Anda</h5>`}
              </div>
              <input type="text" id="user-search" class="form-control" style="width:250px" placeholder="Cari Siswa..." onkeyup="window.filterTable('tbl-users', this.value)">
          </div>
          <div class="card border-0 shadow-sm"><div class="card-body p-0"><div class="table-responsive">
          <table class="table table-hover align-middle mb-0" id="tbl-users"><thead class="table-light"><tr>${isAdmin ? `<th width="5%"><input type="checkbox" id="cb-all-users" class="form-check-input" onchange="window.toggleAllCb('users')"></th>` : ''}<th>Nama</th><th>Username</th><th>Role</th><th>Kelas</th>${isAdmin ? '<th>Aksi</th>' : ''}</tr></thead><tbody>`;
          
          users.forEach(u => {
              const safeData = encodeURIComponent(JSON.stringify(u));
              h += `<tr>${isAdmin ? `<td><input type="checkbox" class="cb-user form-check-input" value="${u.ID}" onchange="window.checkBulkDelete('users')"></td>` : ''}<td class="fw-bold">${u.Nama}</td><td>${u.Username}</td><td><span class="badge bg-${String(u.Role).trim().toLowerCase()==='admin'?'danger':(String(u.Role).trim().toLowerCase()==='guru'?'warning':'primary')}">${u.Role}</span></td><td>${u.Kelas || '-'}</td>${isAdmin ? `<td><button class="btn btn-sm btn-outline-dark me-1" onclick="window.editUser('${safeData}')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.delUser('${u.ID}')"><i class="fas fa-trash"></i></button></td>` : ''}</tr>`;
          });
          h += `</tbody></table></div></div></div>`;
          $('#content-area').html(h);
      }

      function renderRecapTable() {
          const uniqueKelas = [...new Set(recapAllData.map(item => item.KelasSiswa))].sort();
          const uniqueUjian = [...new Set(recapAllData.map(item => item.JudulUjian))].sort();
          let h = `
          <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0 text-primary"><i class="fas fa-chart-bar me-2"></i>Rekapitulasi Nilai</h5>
              <div>
                  <button id="btn-bulk-del-rekap" class="btn btn-danger hidden shadow-sm me-2" onclick="window.bulkDeleteRekap()"><i class="fas fa-trash"></i> Hapus Terpilih</button>
                  <button class="btn btn-warning shadow-sm me-2" onclick="$('#modalKatrol').modal('show')"><i class="fas fa-sort-amount-up me-1"></i> Katrol Nilai</button>
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
          <table class="table table-hover align-middle mb-0" id="tbl-rekap"><thead class="table-light"><tr><th width="5%"><input type="checkbox" id="cb-all-rekap" class="form-check-input" onchange="window.toggleAllCb('rekap')"></th><th>Waktu</th><th>Nama Siswa</th><th>Kelas</th><th>Mata Pelajaran</th><th>Nilai Akhir</th><th>Aksi</th></tr></thead><tbody id="tbl-rekap-body"></tbody></table></div></div></div>`;
          $('#content-area').html(h); window.applyFilter();
      }

      function applyFilter() {
        const fUjian = $('#filter-ujian').val(); const fKelas = $('#filter-kelas').val(); const fSearch = $('#filter-search').val().toLowerCase();
        const tbody = $('#tbl-rekap-body'); tbody.empty(); recapDataStore = {};
        const filtered = recapAllData.filter(item => { if(fUjian && item.JudulUjian !== fUjian) return false; if(fKelas && item.KelasSiswa !== fKelas) return false; if(fSearch && !item.NamaSiswa.toLowerCase().includes(fSearch)) return false; return true; });
        window.currentFilteredData = filtered;
        $('#cb-all-rekap').prop('checked', false); $('#btn-bulk-del-rekap').addClass('hidden');

        if(filtered.length === 0) { tbody.html('<tr><td colspan="7" class="text-center p-3">Tidak ada data ditemukan.</td></tr>'); return; }
        filtered.forEach(r => {
          recapDataStore[r.ResultID] = { detail: r.Detail, nama: r.NamaSiswa, ujian: r.JudulUjian, nilai: r.TotalNilai, pembuat: r.PembuatNama };
          tbody.append(`<tr><td><input type="checkbox" class="cb-rekap form-check-input" value="${r.ResultID}" onchange="window.checkBulkDelete('rekap')"></td><td class="small text-muted">${r.WaktuSubmit}</td><td><div class="fw-bold">${r.NamaSiswa}</div></td><td>${r.KelasSiswa}</td><td>${r.Mapel} <br><small class="text-muted">${r.JudulUjian}</small></td><td><span class="badge bg-primary fs-6">${r.TotalNilai}</span></td><td><button class="btn btn-sm btn-outline-info me-1" onclick="window.openKoreksi('${r.ResultID}')" title="Koreksi & Input Nilai Personal"><i class="fas fa-edit"></i> Edit Nilai</button><button class="btn btn-sm btn-outline-success me-1" onclick="window.printRecap('${r.ResultID}')" title="Cetak"><i class="fas fa-print"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.deleteResult('${r.ResultID}')" title="Hapus"><i class="fas fa-trash"></i></button></td></tr>`);
        });
      }

      function applyKatrolMassal() {
          const addVal = parseFloat($('#katrol-value').val()) || 0;
          if(addVal === 0) return window.Swal.fire('Perhatian', 'Masukkan nilai katrol yang valid.', 'warning');
          if(!window.currentFilteredData || window.currentFilteredData.length === 0) return window.Swal.fire('Data Kosong', 'Tidak ada data di tabel untuk dikatrol.', 'info');
          
          window.Swal.fire({
              title: 'Konfirmasi Katrol Nilai', text: `Anda yakin menambahkan nilai sebesar ${addVal} ke ${window.currentFilteredData.length} siswa di tabel ini?`,
              icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Eksekusi',
          }).then((result) => {
              if(result.isConfirmed) {
                  window.showLoad(true); const rids = window.currentFilteredData.map(d => d.ResultID);
                  window.google.script.run.withSuccessHandler(res => {
                      window.showLoad(false); $('#modalKatrol').modal('hide');
                      if (res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('hasil-rekap'); } 
                      else { window.Swal.fire('Gagal', res.msg, 'error'); }
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminKatrolMassal(rids, addVal);
              }
          });
      }

      function renderAdministrasi() {
          const uniqueKelas = [...new Set(gAdminData.users.map(u => String(u.Kelas).trim()))].filter(k => k).sort();
          let optKelas = `<option value="ALL">Semua Kelas</option>` + uniqueKelas.map(k => `<option value="${k}">${k}</option>`).join('');
          let optUjian = `<option value="">-- Pilih Ujian --</option>` + gAdminData.exams.map(e => `<option value="${e.ExamID}">${e.Judul} (${e.Mapel})</option>`).join('');
          
          let h = `
          <div class="row g-4">
              <div class="col-md-4"><div class="card shadow-sm border-0 h-100"><div class="card-body"><h5 class="fw-bold text-primary"><i class="fas fa-id-card me-2"></i>Cetak Kartu Login</h5><p class="small text-muted">Cetak kartu akun siswa untuk login aplikasi CBT.</p><label class="small fw-bold">Filter Kelas</label><select id="adm-kls-kartu" class="form-select mb-3">${optKelas}</select><button class="btn btn-primary w-100" onclick="window.printKartuLogin()"><i class="fas fa-print me-1"></i> Cetak Kartu</button></div></div></div>
              <div class="col-md-4"><div class="card shadow-sm border-0 h-100"><div class="card-body"><h5 class="fw-bold text-info"><i class="fas fa-clipboard-list me-2"></i>Cetak Daftar Hadir</h5><p class="small text-muted">Format absensi siswa saat pelaksanaan ujian.</p><label class="small fw-bold">Pilih Ujian</label><select id="adm-exam-hadir" class="form-select mb-2">${optUjian}</select><label class="small fw-bold">Filter Kelas</label><select id="adm-kls-hadir" class="form-select mb-3">${optKelas}</select><button class="btn btn-info text-white w-100" onclick="window.printDaftarHadir()"><i class="fas fa-print me-1"></i> Cetak Daftar Hadir</button></div></div></div>
              <div class="col-md-4"><div class="card shadow-sm border-0 h-100"><div class="card-body"><h5 class="fw-bold text-success"><i class="fas fa-file-signature me-2"></i>Cetak Berita Acara</h5><p class="small text-muted">Format laporan pelaksanaan ujian untuk pengawas.</p><label class="small fw-bold">Pilih Ujian</label><select id="adm-exam-ba" class="form-select mb-2">${optUjian}</select><label class="small fw-bold">Filter Kelas</label><select id="adm-kls-ba" class="form-select mb-3">${optKelas}</select><button class="btn btn-success w-100" onclick="window.printBeritaAcara()"><i class="fas fa-print me-1"></i> Cetak Berita Acara</button></div></div></div>
          </div>`;
          $('#content-area').html(h);
      }

      function printKartuLogin() {
          const kls = $('#adm-kls-kartu').val(); let usersToPrint = gAdminData.users;
          if (kls !== 'ALL') usersToPrint = usersToPrint.filter(u => u.Kelas === kls);
          if (usersToPrint.length === 0) return window.Swal.fire('Kosong', 'Tidak ada data siswa untuk kelas tersebut.', 'info');
          let html = `<html><head><title>Cetak Kartu Login</title><style>body { font-family: 'Times New Roman', Times, serif; } .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; padding: 15px; } .card { border: 2px dashed #333; padding: 15px; border-radius: 8px; page-break-inside: avoid; } .kop { display: flex; align-items: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; } .kop img { width: 50px; height: 50px; margin-right: 15px; } .kop h3 { margin: 0; font-size: 15px; text-transform: uppercase; } .kop p { margin: 0; font-size: 11px; } table { width: 100%; font-size: 14px; } td { padding: 4px 0; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#7e22ce; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div><div class="grid">`;
          usersToPrint.forEach(u => { html += `<div class="card"><div class="kop"><img src="${LOGO_BARU}" alt="Logo"><div><h3>KARTU LOGIN UJIAN CBT</h3><p>BELAJAR INOVASI</p></div></div><table><tr><td width="30%"><strong>Nama</strong></td><td width="5%">:</td><td>${u.Nama}</td></tr><tr><td><strong>Kelas</strong></td><td>:</td><td>${u.Kelas}</td></tr><tr><td><strong>Username</strong></td><td>:</td><td><strong>${u.Username}</strong></td></tr><tr><td><strong>Password</strong></td><td>:</td><td><strong>${u.Password}</strong></td></tr></table></div>`; });
          html += `</div><script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      }

      function printDaftarHadir() {
          const examId = $('#adm-exam-hadir').val(); const kls = $('#adm-kls-hadir').val();
          if(!examId) return window.Swal.fire('Perhatian', 'Pilih Ujian terlebih dahulu.', 'warning');
          const exam = gAdminData.exams.find(e => String(e.ExamID) === String(examId)); let usersToPrint = gAdminData.users;
          if (kls !== 'ALL') usersToPrint = usersToPrint.filter(u => u.Kelas === kls);
          if (usersToPrint.length === 0) return window.Swal.fire('Kosong', 'Tidak ada data siswa untuk kelas tersebut.', 'info');
          let html = `<html><head><title>Daftar Hadir Ujian</title><style>body { font-family: 'Times New Roman', Times, serif; padding: 30px; } .kop { display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 20px; text-align: center; } .kop img { width: 70px; height: 70px; margin-right: 20px; position: absolute; left: 40px; } .kop h2 { margin: 0; font-size: 20px; text-transform: uppercase; } .kop p { margin: 5px 0 0; font-size: 14px; } h3 { text-align: center; text-decoration: underline; margin-bottom: 20px; } .info-table { width: 100%; margin-bottom: 20px; font-size: 14px; } .info-table td { padding: 4px; } .data-table { width: 100%; border-collapse: collapse; font-size: 14px; } .data-table th, .data-table td { border: 1px solid #000; padding: 8px; } .data-table th { background: #f0f0f0; text-align: center; } .ttd-box { height: 35px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#84cc16; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div><div class="kop"><img src="${LOGO_BARU}" alt="Logo"><div><h2>DAFTAR HADIR PESERTA UJIAN</h2><p>Aplikasi CBT BELAJAR INOVASI</p></div></div><h3>DAFTAR HADIR PESERTA</h3><table class="info-table"><tr><td width="15%"><strong>Mata Pelajaran</strong></td><td width="2%">:</td><td width="33%">${exam.Mapel} - ${exam.Judul}</td><td width="15%"><strong>Hari, Tanggal</strong></td><td width="2%">:</td><td>......................................</td></tr><tr><td><strong>Kelas</strong></td><td>:</td><td>${kls === 'ALL' ? 'Semua Kelas' : kls}</td><td><strong>Waktu</strong></td><td>:</td><td>......................................</td></tr></table><table class="data-table"><thead><tr><th width="5%">No</th><th width="15%">Username</th><th width="40%">Nama Peserta</th><th width="25%" colspan="2">Tanda Tangan</th><th width="15%">Ket</th></tr></thead><tbody>`;
          usersToPrint.forEach((u, i) => { let ttdCol1 = (i % 2 === 0) ? `${i+1}.` : ''; let ttdCol2 = (i % 2 !== 0) ? `${i+1}.` : ''; html += `<tr><td style="text-align:center">${i + 1}</td><td style="text-align:center">${u.Username}</td><td>${u.Nama}</td><td class="ttd-box">${ttdCol1}</td><td class="ttd-box">${ttdCol2}</td><td></td></tr>`; });
          html += `</tbody></table><div style="margin-top: 50px; text-align: right; padding-right: 50px;"><p>..................................</p><p style="margin-bottom: 70px;">Pengawas Ujian,</p><p><strong>( ......................................... )</strong></p></div><script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      }

      function printBeritaAcara() {
          const examId = $('#adm-exam-ba').val(); const kls = $('#adm-kls-ba').val();
          if(!examId) return window.Swal.fire('Perhatian', 'Pilih Ujian terlebih dahulu.', 'warning');
          const exam = gAdminData.exams.find(e => String(e.ExamID) === String(examId));
          let html = `<html><head><title>Berita Acara Ujian</title><style>body { font-family: 'Times New Roman', Times, serif; padding: 40px; line-height: 1.6; } .kop { display: flex; align-items: center; justify-content: center; border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 30px; text-align: center; } .kop img { width: 80px; height: 80px; margin-right: 20px; position: absolute; left: 40px; } .kop h2 { margin: 0; font-size: 22px; text-transform: uppercase; } .kop p { margin: 5px 0 0; font-size: 14px; } h3 { text-align: center; text-decoration: underline; margin-bottom: 30px; } .content { font-size: 15px; text-align: justify; } .content p { margin-bottom: 15px; } .ttd-section { margin-top: 60px; width: 100%; } .ttd-section table { width: 100%; text-align: center; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; background:#198754; color:white; border:none; border-radius:5px; cursor:pointer;">Cetak Dokumen</button></div><div class="kop"><img src="${LOGO_BARU}" alt="Logo"><div><h2>PANITIA PELAKSANAAN UJIAN CBT</h2><p>Aplikasi BELAJAR INOVASI</p></div></div><h3>BERITA ACARA PELAKSANAAN UJIAN</h3><div class="content"><p>Pada hari ini .................................. tanggal ........... bulan .............................. tahun .........................., telah diselenggarakan Ujian Berbasis Komputer (CBT) dengan rincian sebagai berikut:</p><table style="width: 100%; margin-left: 20px; margin-bottom: 15px;"><tr><td width="25%">Mata Pelajaran</td><td width="5%">:</td><td><strong>${exam.Mapel} - ${exam.Judul}</strong></td></tr><tr><td>Kelas / Ruang</td><td>:</td><td><strong>${kls === 'ALL' ? 'Semua Kelas' : kls}</strong></td></tr><tr><td>Waktu Pelaksanaan</td><td>:</td><td>Pukul ..................... s.d .....................</td></tr></table><p>Dengan jumlah peserta ujian sebagai berikut:</p><table style="width: 100%; margin-left: 20px; margin-bottom: 20px;"><tr><td width="25%">1. Jumlah Peserta Seharusnya</td><td width="5%">:</td><td>........... Orang</td></tr><tr><td>2. Jumlah Peserta Hadir</td><td>:</td><td>........... Orang</td></tr><tr><td>3. Jumlah Peserta Tidak Hadir</td><td>:</td><td>........... Orang</td></tr><tr><td valign="top">4. Catatan Selama Ujian</td><td valign="top">:</td><td style="border-bottom: 1px dotted #000; height: 30px;"></td></tr><tr><td></td><td></td><td style="border-bottom: 1px dotted #000; height: 30px;"></td></tr></table><p>Demikian Berita Acara ini dibuat dengan sesungguhnya untuk dapat dipergunakan sebagaimana mestinya.</p></div><div class="ttd-section"><table><tr><td width="50%"></td><td width="50%">....................................<br>Pengawas Ujian,</td></tr><tr><td height="80"></td><td></td></tr><tr><td></td><td><strong>( .................................................. )</strong></td></tr></table></div><script>window.onload = function() { window.print(); }<\/script></body></html>`;
          const win = window.open('', '', 'width=800,height=600'); win.document.write(html); win.document.close();
      }

      function printFilteredRecap() {
        if(!window.currentFilteredData || window.currentFilteredData.length === 0) { window.Swal.fire('Data Kosong', 'Tidak ada data nilai yang tampil untuk dicetak.', 'info'); return; }
        const fUjian = $('#filter-ujian').val() || 'Semua Ujian'; const fKelas = $('#filter-kelas').val() || 'Semua Kelas';
        let namaPengawas = window.currentFilteredData.length > 0 ? window.currentFilteredData[0].PembuatNama : user.Nama;
        let html = `<html><head><title>Cetak Rekap Nilai</title><style>body { font-family: 'Times New Roman', Times, serif; padding: 30px;} h2, h4 { text-align: center; margin: 5px 0; } table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;} th, td { border: 1px solid black; padding: 8px; text-align: left; } th { background-color: #f2f2f2; text-align: center;font-weight: bold; } .text-center { text-align: center; } .signature { margin-top: 50px; width: 100%; text-align: right;} .signature div { display: inline-block; text-align: center; width: 250px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="margin-bottom: 15px; text-align:right;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer; background:#198754; color:white; border:none; border-radius:5px;">Cetak Rekap</button></div><h4><div id="logo-container"><img src="${LOGO_BARU}" class="mb-3 rounded" width="100" alt="Logo"></div></h4><hr style="border:1px solid #000; margin-bottom: 20px;"><div><h2>REKAPITULASI HASIL UJIAN</h2><p><strong>Ujian / Materi :</strong> ${fUjian}</p><p><strong>Kelas :</strong> ${fKelas}</p><p><strong>Waktu Cetak :</strong> ${new Date().toLocaleString('id-ID')}</p></div><table><thead><tr><th width="5%">No</th><th width="15%">Waktu Submit</th><th width="25%">Nama Siswa</th><th width="10%">Kelas</th><th width="35%">Mata Pelajaran / Judul</th><th width="10%">Nilai Akhir</th></tr></thead><tbody>`;
        window.currentFilteredData.forEach((r, i) => { html += `<tr><td class="text-center">${i + 1}</td><td class="text-center">${r.WaktuSubmit}</td><td>${r.NamaSiswa}</td><td class="text-center">${r.KelasSiswa}</td><td>${r.Mapel} - ${r.JudulUjian}</td><td class="text-center" style="font-weight: bold;">${r.TotalNilai}</td></tr>`; });
        html += `</tbody></table><div class="signature"><div><p>${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p><p style="margin-bottom: 70px;">Guru Pengampu / Pengawas</p><p><strong>${namaPengawas}</strong></p></div></div><script>window.onload = function() { window.print();}<\/script></body></html>`;
        const printWin = window.open('', '', 'width=900,height=700'); printWin.document.write(html); printWin.document.close();
      }

      function printRecap(rid) {
        const d = recapDataStore[rid]; if(!d) return;
        let namaPengawas = d.pembuat || user.Nama;
        let detailArr = []; try { detailArr = JSON.parse(d.detail); } catch(e) {}
        let detailHtml = '<table class="data-table"><thead><tr><th width="10%">No</th><th width="20%">Tipe Soal</th><th width="50%">Jawaban Siswa</th><th width="20%">Skor</th></tr></thead><tbody>';
        detailArr.forEach(item => { let n = item.i !== undefined ? item.i : item[0]; let s = item.s !== undefined ? item.s : item[1]; let t = item.t || 'Objektif'; let a = item.a !== undefined ? item.a : ''; let displayAns = Array.isArray(a) ? a.join(', ') : a; displayAns = displayAns ? String(displayAns).replace(/\n/g, '<br>') : '<i style="color:#999;">Tidak dijawab</i>'; detailHtml += `<tr><td style="text-align:center">${n}</td><td style="text-align:center">${t}</td><td>${displayAns}</td><td style="text-align:center">${s}</td></tr>`; });
        detailHtml += '</tbody></table>';
        const printWindow = window.open('', '', 'width=800,height=600');
        printWindow.document.write(`<html><head><title>Cetak Hasil - ${d.nama}</title><style>body{ font-family: 'Times New Roman', Times, serif; padding: 40px; color: #333; } .header { text-align: center; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 20px; } .score-box { border: 2px solid #000; padding: 15px; text-align: center; margin-bottom: 20px; width: 200px; float: right; } .score { font-size: 38px; font-weight: bold; margin-top: 5px; } .data-table { width: 100%; border-collapse: collapse; margin-top: 15px; } .data-table th, .data-table td { border: 1px solid #000; padding: 8px; } .data-table th { background: #f0f0f0; text-align: center; } .clearfix::after { content: ""; clear: both; display: table; } .footer { margin-top: 50px; text-align: right; } .footer div { display: inline-block; text-align: center; width: 250px; } @media print { .no-print { display: none; } }</style></head><body><div class="no-print" style="text-align: right; margin-bottom: 20px;"><button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer; background:#7e22ce; color:white; border:none; border-radius:5px;">Cetak Dokumen</button></div><div class="header"><h2>HASIL UJIAN BERBASIS KOMPUTER</h2><h4>AGIS CBT SYSTEM</h4></div><div class="clearfix"><div class="score-box"><h3>NILAI AKHIR</h3><div class="score">${d.nilai}</div></div><table class="student-info"><tr><td width="150"><strong>Nama Peserta</strong></td><td width="10">:</td><td>${d.nama}</td></tr><tr><td><strong>Mata Pelajaran</strong></td><td>:</td><td>${d.ujian}</td></tr><tr><td><strong>Waktu Cetak</strong></td><td>:</td><td>${new Date().toLocaleString('id-ID')}</td></tr></table></div><h4 style="margin-top:20px; border-bottom:1px solid #ccc; padding-bottom:5px;">Rincian Jawaban & Skor Tiap Soal</h4>${detailHtml}<div class="footer"><div><p>${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p><p style="margin-bottom: 70px;">Guru Pengampu / Pengawas</p><p><strong>${namaPengawas}</strong></p></div></div><script>window.onload = function() { window.print(); }<\/script></body></html>`);
        printWindow.document.close();
      }

      function openKoreksi(rid) {
          const d = recapDataStore[rid]; if (!d) return;
          let detailArr = []; try { detailArr = JSON.parse(d.detail); } catch(e){}
          let html = `<input type="hidden" id="kor-rid" value="${rid}"><div class="alert alert-info border-0 shadow-sm">Siswa: <b>${d.nama}</b><br>Ujian: <b>${d.ujian}</b></div>`;
          html += `<div class="alert alert-warning mb-3">Total Nilai Saat Ini: <b class="fs-5">${d.nilai}</b><br>Anda dapat memodifikasi skor per soal di bawah ini, atau jika ingin memberikan tambahan/katrol nilai massal, silakan gunakan menu <b>Katrol Nilai</b> massal di luar.</div>`;
          
          detailArr.forEach((item, index) => {
              let no = item.i !== undefined ? item.i : item[0]; let score = item.s !== undefined ? item.s : item[1]; let type = item.t || 'Objektif'; let ans = item.a !== undefined ? item.a : ''; let max = item.m !== undefined ? item.m : 0;
              html += `<div class="card mb-2 border-0 shadow-sm"><div class="card-body p-3"><div class="d-flex justify-content-between align-items-center mb-2"><strong class="text-primary">Soal No. ${no} <span class="badge bg-secondary ms-1">${type}</span></strong><div class="fw-bold d-flex align-items-center">Skor: <input type="number" step="0.1" class="form-control form-control-sm d-inline w-auto kor-score ms-2" data-idx="${index}" value="${score}" style="max-width: 80px;"> <span class="ms-1 text-muted">/ ${max}</span></div></div>`;
              let displayAns = Array.isArray(ans) ? ans.join(', ') : ans;
              html += `<div class="p-2 bg-light rounded border small mt-2"><b>Jawaban Siswa:</b><br>${displayAns ? String(displayAns).replace(/\n/g, '<br>') : '<i class="text-muted">Tidak dijawab</i>'}</div></div></div>`;
          });
          $('#kor-body').html(html); $('#modalKoreksi').modal('show');
      }

      function saveKoreksi() {
          const rid = $('#kor-rid').val(); const d = recapDataStore[rid]; let detailArr = JSON.parse(d.detail);
          $('.kor-score').each(function() { detailArr[$(this).data('idx')].s = parseFloat($(this).val()) || 0; });
          let maxTotal = 0, totalScore = 0;
          detailArr.forEach(item => { maxTotal += (item.m || 0); totalScore += (item.s || 0); });
          const finalScore = maxTotal > 0 ? Number(((totalScore / maxTotal) * 100).toFixed(2)) : totalScore;
          
          const btn = $('#btn-save-kor'); btn.prop('disabled', true).text('Menyimpan...');
          window.google.script.run.withSuccessHandler(res => {
              btn.prop('disabled', false).text('Simpan Perubahan');
              if (res.status === 'success') { $('#modalKoreksi').modal('hide'); window.Swal.fire('Sukses', res.msg, 'success'); window.loadPage('hasil-rekap'); } 
              else { window.Swal.fire('Gagal', res.msg, 'error'); }
          }).withFailureHandler(err => { btn.prop('disabled', false).text('Simpan Perubahan'); window.Swal.fire('Error', err.message, 'error'); }).adminUpdateResult(rid, finalScore, JSON.stringify(detailArr));
      }

      function filterAdminUjian() {
          const m = $('#filter-mapel-ujian').val(); const k = $('#filter-kelas-ujian').val();
          $('.ujian-card').each(function() {
              const matchMapel = m === '' || $(this).data('mapel') === m;
              const matchKelas = k === '' || $(this).data('kelas') === k;
              $(this).toggle(matchMapel && matchKelas);
          });
      }

      function openExamModal(str) {
        $('#modalExam').modal('show');
        let d = null;
        if(str) {
          d = JSON.parse(decodeURIComponent(str));
          $('#ex-id').val(d.ExamID); $('#ex-judul').val(d.Judul); $('#ex-mapel').val(d.Mapel); $('#ex-durasi').val(d.Durasi);
          $('#ex-limit').val(d.LimitTries || 1); $('#ex-start').val(d.StartDate.replace(' ','T')); $('#ex-end').val(d.EndDate.replace(' ','T'));
          $('#ex-token').val(d.Token || ''); $('#ex-randomQ').prop('checked', d.RandomQ === 'Yes'); $('#ex-showStats').prop('checked', d.ShowStats === 'Yes');
          $('#ex-violations').val(d.MaxViolations || 3);
        } else {
          $('#modalExam form')[0].reset(); $('#ex-id').val(''); $('#ex-token').val('');
          $('#ex-violations').val(3); $('#ex-limit').val(1);
        }

        const role = String(user.Role).trim().toLowerCase();
        const container = $('#kelas-container');

        if (role === 'guru') {
          const kelasArr = String(user.Kelas).split(',').map(k => k.trim()).filter(k => k);
          let selectedKelas = d ? String(d.TargetKelas).split(',').map(k => k.trim()) : kelasArr;

          let htmlKelas = `<div class="d-flex flex-wrap gap-2 mt-2">`;
          kelasArr.forEach(k => {
            const isChecked = selectedKelas.includes(k) ? 'checked' : '';
            htmlKelas += `<div class="form-check"><input class="form-check-input kls-cb" type="checkbox" value="${k}" id="cb-${k}" ${isChecked}><label class="form-check-label small" for="cb-${k}">${k}</label></div>`;
          });
          htmlKelas += `</div><input type="hidden" name="targetKelas" id="ex-kelas-hidden">`;
          
          container.html(htmlKelas);
        } else {
          let valKelas = d ? d.TargetKelas : '';
          container.html(`<input type="text" name="targetKelas" id="ex-kelas" class="form-control" placeholder="Contoh: 7A, 7B" value="${valKelas}" required>`);
        }
      }

      function saveExam() {
        const formEl = document.getElementById('frm-exam'); 
        const fd = new FormData(formEl); 
        const d = Object.fromEntries(fd.entries());

        if (String(user.Role).trim().toLowerCase() === 'guru') {
          let selectedKls = [];
          $('.kls-cb:checked').each(function() { selectedKls.push($(this).val()); });
          if (selectedKls.length === 0) return window.Swal.fire('Error', 'Pilih minimal 1 target kelas!', 'error');
          d.targetKelas = selectedKls.join(', ');
        }

        d.showStats = $('#ex-showStats').is(':checked') ? 'Yes' : 'No'; 
        d.randomQ = $('#ex-randomQ').is(':checked') ? 'Yes' : 'No'; 
        d.userRole = user.Role; 
        d.userClass = user.Kelas;
        d.userId = user.ID;
        
        if (!d.judul || !d.mapel || !d.start || !d.end || !d.targetKelas) {
          return window.Swal.fire('Error', 'Lengkapi data!', 'error');
        }
        
        window.showLoad(true);
        window.google.script.run.withSuccessHandler((res) => {
          if(res.status === 'success') {
            $('#modalExam').modal('hide');
            window.google.script.run.withSuccessHandler(res2 => {
              window.showLoad(false);
              if (res2.status === 'success') { 
                gData = res2.data; 
                window.renderContent('admin-ujian'); 
                window.toast('success', 'Jadwal Disimpan!'); 
              } else {
                window.Swal.fire('Gagal', res2.msg, 'error');
              }
            }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).getDashboardData(user.Role, user.ID, user.Kelas);
          } else { 
            window.showLoad(false); 
            window.Swal.fire('Gagal', res.msg, 'error'); 
          }
        }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminSaveExam(d);
      }

      function delExam(id){ window.Swal.fire({title:'Hapus Jadwal?', icon:'warning', showCancelButton:true}).then(r=>{if(r.isConfirmed) { window.showLoad(true); window.google.script.run.withSuccessHandler(()=>{window.showLoad(false); window.loadPage('admin-ujian')}).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error')}).adminDeleteExam(id, user.ID, user.Role); } }) }

      function manageQ(id) { activeExamId = id; $('#modalQ').modal('show'); window.loadQList(); }

      function generateQuestionExcelTemplate() {
          const ws_data = [
              ["Nomor", "Tipe", "Skor", "Pertanyaan", "Opsi (Pisahkan dgn |)", "Kunci (Pisahkan dgn |)"],
              [1, "PGS", 10, "Apa ibukota Indonesia?", "Jakarta|Bandung|Bali", "Jakarta"]
          ];
          const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
          const wb = window.XLSX.utils.book_new();
          window.XLSX.utils.book_append_sheet(wb, ws, "TemplateSoal");
          window.XLSX.writeFile(wb, "Template_Upload_Soal.xlsx");
      }

      function handleUploadQuestionsExcel(e) {
          const file = e.target.files[0]; if(!file) return; const reader = new FileReader();
          reader.onload = function(evt) {
              const data = evt.target.result; const workbook = window.XLSX.read(data, {type: 'binary'});
              const worksheet = workbook.Sheets[workbook.SheetNames[0]]; const json = window.XLSX.utils.sheet_to_json(worksheet);
              let formattedData = json.map(row => {
                  let opsRaw = row['Opsi (Pisahkan dgn |)'] ? String(row['Opsi (Pisahkan dgn |)']).split('|') : [];
                  let keyRaw = row['Kunci (Pisahkan dgn |)'] ? String(row['Kunci (Pisahkan dgn |)']).split('|') : [];
                  return { num: row['Nomor'] || 1, type: row['Tipe'] || 'PGS', score: row['Skor'] || 10, text: row['Pertanyaan'] || '', options: opsRaw, key: keyRaw };
              }).filter(q => q.text !== '');
              if(formattedData.length === 0) return window.Swal.fire('Error', 'Format tidak valid.', 'error');
              window.showLoad(true);
              window.google.script.run.withSuccessHandler(res => {
                  window.showLoad(false); if(res.status === 'success') { window.Swal.fire('Sukses', res.msg, 'success'); window.loadQList(); } else window.Swal.fire('Gagal', res.msg, 'error');
              }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).adminBatchSaveQuestions(activeExamId, formattedData, user.ID);
          };
          reader.readAsBinaryString(file);
      }

      function loadQList() {
          $('#q-list-container').html('<div class="text-center p-5"><div class="spinner"></div></div>');
          window.google.script.run.withSuccessHandler(qs => {
              let html = ''; lastQuestionNum = 0; currentQuestionsData = qs || [];
              let topActions = `
              <div class="d-flex justify-content-end mb-3 gap-2 flex-wrap">
                  <button class="btn btn-outline-info shadow-sm" onclick="window.generateQuestionExcelTemplate()"><i class="fas fa-download"></i> Template Excel</button>
                  <label class="btn btn-primary shadow-sm m-0"><i class="fas fa-upload"></i> Upload Excel <input type="file" hidden accept=".xlsx,.xls" onchange="window.handleUploadQuestionsExcel(event)"></label>
                  <button class="btn btn-info text-white shadow-sm" onclick="window.previewAllQ()"><i class="fas fa-eye me-1"></i> Preview Semua</button>
                  <button class="btn btn-primary shadow-sm" onclick="window.downloadAllQ()"><i class="fas fa-download me-1"></i> Download Ujian</button>
              </div>`;
              if (qs && qs.length > 0) {
                  lastQuestionNum = Math.max(...qs.map(q => Number(q.Nomor) || 0));
                  qs.forEach((q, idx) => { html += window.renderQuestionBlock(q, idx); });
                  $('#q-list-container').html(topActions + html); window.applyMathJax();
              } else { $('#q-list-container').html(topActions + '<div class="alert alert-info text-center">Belum ada soal. Klik Tambah Soal atau Upload Excel.</div>'); }
          }).withFailureHandler(err => window.Swal.fire('Error', err.message, 'error')).getExamQuestions(activeExamId);
      }

      function addNewQuestionBlock() {
          lastQuestionNum++; const newBlock = window.renderQuestionBlock({ Nomor: lastQuestionNum }, lastQuestionNum - 1);
          $('#q-list-container').append(newBlock); const uid = $(newBlock).attr('data-id');
          window.toggleEditQ(uid); $('.modal-body').animate({ scrollTop:$('.modal-body')[0].scrollHeight }, 500);
      }

      function generateQHTML(q) {
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
      }

      function previewAllQ() {
          const htmlContent = window.generateAllQHTML();
          if(!htmlContent) return window.Swal.fire('Kosong', 'Belum ada soal untuk dipreview.', 'info');
          if($('#modalPreviewQ').length === 0) {
              $('body').append(`<div class="modal fade" id="modalPreviewQ" tabindex="-1"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header bg-info text-white"><h5 class="modal-title fw-bold"><i class="fas fa-desktop me-2"></i> Preview Seluruh Soal</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body bg-light" id="preview-q-body"></div></div></div></div>`);
          }
          $('#preview-q-body').html(htmlContent); $('#modalPreviewQ').modal('show'); window.applyMathJax();
      }

      function downloadAllQ() {
          const htmlContent = window.generateAllQHTML();
          if(!htmlContent) return window.Swal.fire('Kosong', 'Belum ada soal untuk didownload.', 'info');
          const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Preview Soal Ujian</title><link href="[https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap](https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap)" rel="stylesheet"><script src="[https://polyfill.io/v3/polyfill.min.js?features=es6](https://polyfill.io/v3/polyfill.min.js?features=es6)"><\/script><script id="MathJax-script" async src="[https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js](https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js)"><\/script><style>body { font-family: 'Poppins', Arial, sans-serif; background-color: #f1f5f9; padding: 40px; margin: 0; display:flex; justify-content:center; } .container { max-width: 800px; width: 100%; } img { max-width: 100%; height: auto; border-radius: 6px; margin: 5px 0; }</style></head><body><div class="container">${htmlContent}</div><script>window.onload = function() { setTimeout(window.print, 1000); }<\/script></body></html>`;
          const blob = new Blob([html], {type: "text/html;charset=utf-8"}); const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `Soal_Ujian_Lengkap.html`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      }

      function renderQuestionBlock(q, idx) {
          const uid = q.QID ? q.QID : 'NEW_' + Math.random().toString(36).substr(2, 9);
          const nomor = q.Nomor || (idx + 1); const cleanPrev = (q.Pertanyaan || 'Soal Baru').replace(/<[^>]+>/g, '').substring(0, 80) + '...';
          const safeJson = encodeURIComponent(JSON.stringify(q)); 
          return `<div class="card mb-4 border-0 shadow-sm q-block" id="block-${uid}" data-id="${uid}" data-q-obj="${safeJson}"><div class="card-header bg-white d-flex justify-content-between align-items-center py-3"><span class="badge bg-primary rounded-pill px-3">No. ${nomor}</span><div><button class="btn btn-sm btn-outline-secondary me-2" onclick="window.toggleEditQ('${uid}')"><i class="fas fa-edit"></i> Edit</button><button class="btn btn-sm btn-outline-danger" onclick="window.deleteQBlock('${uid}')"><i class="fas fa-trash"></i></button></div></div><div class="card-body"><div class="q-preview mb-2 fw-bold text-muted">${cleanPrev}</div><div class="q-form hidden" id="form-${uid}"><form id="frm-q-${uid}" onsubmit="event.preventDefault(); window.saveQBlock('${uid}'); return false;"><input type="hidden" name="id" value="${q.QID || ''}"><div class="row g-2 mb-3"><div class="col-md-2"><label class="small fw-bold">No</label><input type="number" name="num" class="form-control" value="${nomor}"></div><div class="col-md-4"><label class="small fw-bold">Tipe</label><select name="type" class="form-select q-type-sel" onchange="window.renderAnsFields('${uid}', this.value)" id="type-${uid}"><option value="PGS" ${q.Tipe=='PGS'?'selected':''}>Pilihan Ganda</option><option value="PGK" ${q.Tipe=='PGK'?'selected':''}>PG Kompleks</option><option value="PGKK" ${q.Tipe=='PGKK'?'selected':''}>Benar Salah</option><option value="Menjodohkan" ${q.Tipe=='Menjodohkan'?'selected':''}>Menjodohkan</option><option value="Uraian" ${q.Tipe=='Uraian'?'selected':''}>Uraian</option></select></div><div class="col-md-2"><label class="small fw-bold">Skor</label><input type="number" step="0.1" name="score" class="form-control" value="${q.Skor || 10}"></div></div><label class="small fw-bold mb-1">Pertanyaan</label><textarea id="sn-${uid}" name="text">${q.Pertanyaan || ''}</textarea><div class="card mt-3 bg-light"><div class="card-body"><label class="small fw-bold mb-2">Jawaban & Kunci</label><div id="ans-area-${uid}"></div></div></div><div class="text-end mt-3"><button type="button" class="btn btn-secondary me-1" onclick="window.toggleEditQ('${uid}')">Tutup</button><button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Simpan</button></div></form></div></div></div>`;
      }

      function toggleEditQ(uid) { 
          const form = $(`#form-${uid}`); 
          if (form.hasClass('hidden')) { 
              activeUid = uid; form.removeClass('hidden'); $(`#block-${uid}`).addClass('border-primary'); 
              $(`#sn-${uid}`).summernote(snConfig); window.renderAnsFields(uid, $(`#type-${uid}`).val());
          } else { 
              form.addClass('hidden'); $(`#block-${uid}`).removeClass('border-primary'); 
              $(`#sn-${uid}`).summernote('destroy'); $(`#ans-area-${uid} .summernote-opt`).each(function(){ $(this).summernote('destroy'); }); 
          } 
      }

      function renderAnsFields(uid, type) { 
          const block = $(`#block-${uid}`); let qData = {}; 
          try { qData = JSON.parse(decodeURIComponent(block.attr('data-q-obj'))); } catch(e){} 
          const opts = (qData.Tipe === type) ? JSON.parse(qData.Options || "[]") : [];
          const keys = (qData.Tipe === type) ? JSON.parse(qData.Key || "[]") : []; 
          $(`#ans-area-${uid} .summernote-opt`).each(function(){ $(this).summernote('destroy'); }); let h = '';
          
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
          $(`#ans-area-${uid}`).html(h); $(`#ans-area-${uid} .summernote-opt`).summernote(snConfig); 
      }

      function genOptRow(uid, type, val='', checked='') { return `<div class="d-flex align-items-start mb-2 ans-row gap-2"><div class="mt-2"><input type="${type}" name="k_${uid}" class="form-check-input" ${checked}></div><div class="flex-grow-1"><textarea class="summernote-opt">${val}</textarea></div><button type="button" class="btn btn-outline-danger mt-1" onclick="window.removeOptRow(this)">X</button></div>`; }
      function genPGKKRow(q='', k='B') { return `<tr><td><textarea class="summernote-opt pgkk-q">${q}</textarea></td><td><select class="form-select pgkk-k"><option value="B" ${k=='B'?'selected':''}>Benar</option><option value="S" ${k=='S'?'selected':''}>Salah</option></select></td><td><button type="button" class="btn btn-danger btn-sm" onclick="$(this).closest('tr').remove()">X</button></td></tr>`; }
      function genMatchRow(l='', r='') { return `<tr><td><textarea class="summernote-opt match-l">${l}</textarea></td><td><textarea class="summernote-opt match-r">${r}</textarea></td><td><button type="button" class="btn btn-danger btn-sm" onclick="$(this).closest('tr').remove()">X</button></td></tr>`; }

      function addOptRow(uid, t) { const el = $(window.genOptRow(uid, t));$(`#opts-wrap-${uid}`).append(el); el.find('.summernote-opt').summernote(snConfig); }
      function addPGKKRowTo(uid) { const el = $(window.genPGKKRow());$(`#pgkk-tbody-${uid}`).append(el); el.find('.summernote-opt').summernote(snConfig); }
      function addMatchRowTo(uid) { const el = $(window.genMatchRow());$(`#match-tbody-${uid}`).append(el); el.find('.summernote-opt').summernote(snConfig); }
      function removeOptRow(btn) { $(btn).closest('.ans-row').remove(); }

      function saveQBlock(uid) {
          const form = $(`#frm-q-${uid}`); const type = form.find('select[name="type"]').val(); const text = $(`#sn-${uid}`).summernote('code');
          const score = form.find('input[name="score"]').val(); const num = form.find('input[name="num"]').val();
          const id = form.find('input[name="id"]').val(); let opts=[], keys=[], keyIndices=[];
          
          if (type === 'PGS' || type === 'PGK') { 
              $(`#opts-wrap-${uid} .ans-row`).each(function(){ 
                  const v = $(this).find('.summernote-opt').summernote('code'); 
                  if(v && v !== '<p><br></p>'){ opts.push(v); if($(this).find('.form-check-input').is(':checked')) { keys.push(v); keyIndices.push(opts.length - 1); } } }); } else if(type==='PGKK') {$(`#pgkk-tbody-${uid} tr`).each(function(){ const q = $(this).find('.pgkk-q').summernote('code'); if(q){ opts.push(q); keys.push($(this).find('.pgkk-k').val()); } });
          } else if(type==='Menjodohkan') { 
              $(`#match-tbody-${uid} tr`).each(function(){ const l = $(this).find('.match-l').summernote('code'); const r =$(this).find('.match-r').summernote('code'); if(l && r){ opts.push(l); keys.push(r); } });
          } else { keys = form.find('textarea[name="essay_key"]').val().split(','); } 
          
          const payload={id:id, num:num, type:type, text:text, options:opts, key:keys, keyIndices:keyIndices, score:score, userId: user.ID}; 
          const btn=form.find('button[type="submit"]'); btn.prop('disabled',true).text('Menyimpan...');
          window.google.script.run.withSuccessHandler(res=>{
              btn.prop('disabled',false).text('Simpan');
              if(res.status==='success'){
                  window.toast('success','Soal Disimpan!');
                  const newData={QID:res.id, Tipe:type, Pertanyaan:text, Options:JSON.stringify(opts), Key:JSON.stringify(keys), Skor:score, Nomor:num};
                  $(`#block-${uid}`).attr('data-q-obj', encodeURIComponent(JSON.stringify(newData))).find('input[name="id"]').val(res.id);
                  $(`#block-${uid} .q-preview`).html('Soal Tersimpan');
                  window.toggleEditQ(uid);
                  const existingIdx = currentQuestionsData.findIndex(q => String(q.QID) === String(res.id));
                  if (existingIdx !== -1) currentQuestionsData[existingIdx] = newData;
                  else { currentQuestionsData.push(newData); currentQuestionsData.sort((a,b) => (Number(a.Nomor)||999) - (Number(b.Nomor)||999)); }
              } else window.Swal.fire('Error',res.msg,'error');
          }).withFailureHandler(err => { btn.prop('disabled',false).text('Simpan'); window.Swal.fire('Error', err.message, 'error'); }).adminSaveSingleQuestion(activeExamId, payload);
      }

      function deleteQBlock(uid) {
          const id=$(`#block-${uid}`).find('input[name="id"]').val();
          if(!id){ $(`#block-${uid}`).remove(); return; }
          window.Swal.fire({title:'Hapus Soal?',icon:'warning',showCancelButton:true}).then(r=>{
              if(r.isConfirmed){
                  $(`#block-${uid}`).fadeOut();
                  window.google.script.run.withFailureHandler(err=>window.Swal.fire('Error', err.message, 'error')).adminDeleteQuestion(id, user.ID, user.Role);
                  currentQuestionsData = currentQuestionsData.filter(q => String(q.QID) !== String(id));
              }
          });
      }

      function startExam(eid) {
          try { if (screen.orientation && screen.orientation.unlock) { screen.orientation.unlock(); } } catch (e) {}
          const rules = `<div class="text-start small"><b>TATA CARA & ATURAN UJIAN:</b><br><br>1. Ujian ini menggunakan <b>Layar Penuh (Fullscreen)</b>.<br>2. Jangan keluar dari mode layar penuh selama ujian berlangsung.<br>3. Jangan membuka aplikasi, tab baru, atau split layar.<br>4. Sistem akan mendeteksi pelanggaran. Jika Anda melanggar terus menerus, maka jawaban akan <b>otomatis terkirim</b>.<br>5. Kerjakan dengan jujur dan fokus.</div>`;
          window.Swal.fire({ title: 'Peraturan Ujian', html: rules, icon: 'warning', showCancelButton: true, confirmButtonText: 'SETUJU & MULAI', confirmButtonColor: '#7e22ce' }).then(r => {
              if(r.isConfirmed) {
                  if (document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen().catch(()=>{}); }
                  window.showLoad(true);
                  window.google.script.run.withSuccessHandler(res => {
                      window.showLoad(false);
                      if(res.status === 'success') {
                          localStorage.removeItem(`ANS_${user.ID}_${eid}`); activeExamId = eid; totalQ = res.data.length; activeExamViolations = res.maxViolations || 3;
                          $('#do-exam-title').html(`${res.judul} <span class="mx-2">|</span> ${user.Nama}`);
                          try { localStorage.setItem('cbt_active_exam', JSON.stringify({ id: eid, qs: res.data, dur: res.duration, maxV: activeExamViolations, start: Date.now(), judul: res.judul, token: res.token })); } catch(e) {}
                          violationCount = 0; $('#viol-disp').text(violationCount); window.enableSecurity(); window.runExam(res.data, res.duration, false);
                      } else window.Swal.fire('Gagal', res.msg, 'error');
                  }).withFailureHandler(err => { window.showLoad(false); window.Swal.fire('Error', err.message, 'error'); }).getExamPack(eid, user.ID);
              }
          });
      }

      function refreshUjianSiswa() {
          window.Swal.fire({ title: 'Refresh Data Ujian?', text: 'Ini akan menyegarkan data soal tanpa menghilangkan jawaban Anda yang sudah tersimpan di sistem.', icon: 'info', showCancelButton: true
