"use client";

import Script from "next/script";
import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.appInitialized) return;
    window.appInitialized = true;

    const initApp = () => {
      if (!window.jQuery || !window.Swal) {
        setTimeout(initApp, 100);
        return;
      }
      const $ = window.jQuery;

      // PROXY API: PENGGANTI GOOGLE.SCRIPT.RUN
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

      // ORIGINAL JAVASCRIPT LOGIC
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
                      html: `<div class="text-start small mb-2 text-muted">Ketik format LaTeX manual:</div>
                             <textarea id="swal-math-input" class="form-control font-monospace" rows="3"></textarea>`,
                      showCancelButton: true, confirmButtonText: 'Sisipkan Rumus'
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

      function applyMathJax() { if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise().catch(() => {}); }

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
                          runExam(examState.qs, examState.dur, true);
                      });
                  }
              } catch(e) { localStorage.removeItem('cbt_active_exam'); }
          }
      }

      function toggleSidebar() { $('#sidebar').toggleClass('active'); $('#sidebar-overlay').toggleClass('active'); }
      function showLoad(s) { s ? $('#loader').removeClass('hidden') : $('#loader').addClass('hidden'); }
      function toast(icon, title) { window.Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000}).fire({icon: icon, title: title}); }

      function handleLogin() {
          showLoad(true);
          window.google.script.run.withSuccessHandler(res => {
              showLoad(false);
              if(res.status === 'success') {
                  user = res.data; user.LogoUrl = res.logo;
                  localStorage.setItem('cbt_user', JSON.stringify(user));
                  if(res.logo) $('#logo-container img').attr('src', res.logo);
                  initDash();
              } else window.Swal.fire('Gagal', res.msg, 'error');
          }).withFailureHandler(err => {
              showLoad(false); window.Swal.fire('Error', 'Koneksi ke server gagal. ' + err.message, 'error');
          }).loginUser($('#u-login').val(), $('#p-login').val());
      }

      function handleLogout() {
          window.Swal.fire({ title: 'Logout?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya' }).then((r) => {
              if(r.isConfirmed) {
                  stopContinuousBeep(); localStorage.removeItem('cbt_user'); localStorage.removeItem('cbt_active_exam'); user = null;
                  clearInterval(timerInt); clearInterval(monitorInterval); clearInterval(autosaveInterval); activeExamId = null;
                  $('#view-dashboard').addClass('hidden'); $('#view-exam').addClass('hidden'); $('body').removeClass('exam-mode');$('#u-login').val(''); $('#p-login').val(''); $('#view-auth').show(); $('#sidebar').removeClass('active'); $('#sidebar-overlay').removeClass('active');
              }
          });
      }

      function initDash() {
          $('#view-auth').hide(); $('#view-dashboard').removeClass('hidden'); $('#u-name-disp').text(user.Nama);
          const role = String(user.Role || '').trim().toLowerCase(); $('#user-role-disp').text(role.toUpperCase());
          $('.components').addClass('hidden');
          if(role === 'siswa') { $('#menu-siswa').removeClass('hidden'); loadPage('siswa-home'); } 
          else if(role === 'guru') { $('#menu-guru').removeClass('hidden'); loadPage('admin-home'); } 
          else if(role === 'admin') { $('#menu-admin').removeClass('hidden'); loadPage('admin-home'); } 
          else { window.Swal.fire('Akses Ditolak', 'Role akun Anda tidak dikenali sistem.', 'error'); }
      }

      function appRefresh() {
          const activeLink = $('.nav-link.active');
          if (activeLink.length > 0) { const onclickAttr = activeLink.attr('onclick'); if(onclickAttr) { const match = onclickAttr.match(/'([^']+)'/); if(match) loadPage(match[1]); } }
      }

      function loadPage(page) {
          clearInterval(timerInt); clearInterval(monitorInterval); clearInterval(autosaveInterval); disableSecurity(); stopContinuousBeep();
          $('#view-exam').addClass('hidden'); $('#view-dashboard').removeClass('hidden'); $('body').removeClass('exam-mode');$('#page-title').text(page.replace('-', ' ').toUpperCase());
          $('.nav-link').removeClass('active');$(`a[onclick="loadPage('${page}')"]`).addClass('active');
          if(window.innerWidth <= 768) { $('#sidebar').removeClass('active'); $('#sidebar-overlay').removeClass('active'); }
          
          if(page === 'admin-users') {
              showLoad(true);
              window.google.script.run.withSuccessHandler(r => { showLoad(false); if(r.status === 'success') { renderUsers(r.data); } else { window.Swal.fire('Error', r.msg, 'error'); } }).getDashboardData(user.Role, user.ID, user.Kelas); // Trigger fetching Users in Background
              window.google.script.run.withSuccessHandler(r => { showLoad(false); if(r.status === 'success') { renderUsers(r.data); } }).getUserList();
              return;
          }
          if(page === 'admin-administrasi') {
              showLoad(true);
              window.google.script.run.withSuccessHandler(r => { showLoad(false); if(r.status === 'success') { gAdminData = r; renderAdministrasi(); } }).getAdminData(user.Role, user.ID, user.Kelas);
              return;
          }
          showLoad(true);
          window.google.script.run.withSuccessHandler(res => {
              showLoad(false);
              if (res.status === 'success') { gData = res.data; renderContent(page); applyMathJax(); } else { window.Swal.fire('Error', res.msg, 'error'); }
          }).getDashboardData(user.Role, user.ID, user.Kelas);
      }

      function renderUsers(users) {
          const cleanRole = String(user.Role).trim().toLowerCase();
          const isAdmin = cleanRole === 'admin';
          let h = `<div class="d-flex justify-content-between mb-3 flex-wrap gap-2">
              <div>${isAdmin ? `<button class="btn btn-success shadow-sm me-2" onclick="$('#modalUser').modal('show');$('#modalUser form')[0].reset();$('#mu-id').val('');">+ Tambah User</button>` : `<h5 class="fw-bold text-primary mb-0"><i class="fas fa-users me-2"></i>Data Siswa Kelas Anda</h5>`}</div>
              <input type="text" id="user-search" class="form-control" style="width:250px" placeholder="Cari Siswa..." onkeyup="window.filterTable('tbl-users', this.value)">
          </div>
          <div class="card border-0 shadow-sm"><div class="card-body p-0"><div class="table-responsive">
          <table class="table table-hover align-middle mb-0" id="tbl-users"><thead class="table-light"><tr><th>Nama</th><th>Username</th><th>Role</th><th>Kelas</th>${isAdmin ? '<th>Aksi</th>' : ''}</tr></thead><tbody>`;
          
          users.forEach(u => {
              const safeData = encodeURIComponent(JSON.stringify(u));
              h += `<tr><td class="fw-bold">${u.Nama}</td><td>${u.Username}</td><td><span class="badge bg-${String(u.Role).trim().toLowerCase()==='admin'?'danger':(String(u.Role).trim().toLowerCase()==='guru'?'warning':'primary')}">${u.Role}</span></td><td>${u.Kelas || '-'}</td>${isAdmin ? `<td><button class="btn btn-sm btn-outline-dark me-1" onclick="window.editUser('${safeData}')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-outline-danger" onclick="window.delUser('${u.ID}')"><i class="fas fa-trash"></i></button></td>` : ''}</tr>`;
          });
          h += `</tbody></table></div></div></div>`;
          $('#content-area').html(h);
      }

      function renderContent(page) {
          const area = $('#content-area'); let h = '';
          if (page === 'admin-home') {
              h = `<div class="row g-4"><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-primary"><h3>${gData.stats.totalSiswa}</h3><small>Siswa di Kelas Anda</small></div></div><div class="col-md-4"><div class="card p-3 shadow-sm border-0 border-start border-4 border-success"><h3>${gData.stats.totalUjian}</h3><small>Total Ujian</small></div></div></div>`;
          }
          else if (page === 'admin-ujian') {
              let uniqueMapel = [...new Set(gData.exams.map(e => e.Mapel))]; let uniqueKelas = [...new Set(gData.exams.map(e => String(e.TargetKelas).trim()))];
              h = `<div class="d-flex justify-content-between mb-3"><button class="btn btn-primary shadow-sm" onclick="window.openExamModal()">+ Buat Jadwal Baru</button>
                   <div class="d-flex gap-2"><select id="filter-mapel-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Mapel</option>${uniqueMapel.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
                   <select id="filter-kelas-ujian" class="form-select form-select-sm" onchange="window.filterAdminUjian()"><option value="">Semua Kelas</option>${uniqueKelas.map(k=>`<option value="${k}">${k}</option>`).join('')}</select></div></div><div class="row g-4" id="admin-ujian-list">`;
              gData.exams.forEach(e => {
                  const isOwner = (String(user.Role).trim().toLowerCase() === 'admin' || String(e.PembuatID) === String(user.ID));
                  const actionButtons = isOwner ? `<button class="btn btn-sm btn-outline-dark flex-fill" onclick="window.openExamModal('${encodeURIComponent(JSON.stringify(e))}')">Edit</button> <button class="btn btn-sm btn-outline-primary flex-fill" onclick="window.manageQ('${e.ExamID}')"><i class="fas fa-list me-1"></i> Soal</button> <button class="btn btn-sm btn-danger" onclick="window.delExam('${e.ExamID}')"><i class="fas fa-trash"></i></button>` : `<div class="alert alert-light small m-0 p-1 text-center w-100">Read Only</div>`;
                  h += `<div class="col-md-6 col-lg-4 ujian-card" data-mapel="${e.Mapel}" data-kelas="${e.TargetKelas}"><div class="card h-100 shadow-sm border-0"><div class="card-body"><div class="d-flex justify-content-between mb-2"><span class="badge bg-primary">${e.Mapel}</span><span class="badge bg-light text-dark border">${e.TargetKelas}</span></div><h5 class="fw-bold text-dark">${e.Judul}</h5><div class="d-flex gap-2">${actionButtons}</div></div></div></div>`;
              });
              h += '</div>';
          }
          area.html(h);
      }

      function filterAdminUjian() {
          const m = $('#filter-mapel-ujian').val(); const k = $('#filter-kelas-ujian').val();
          $('.ujian-card').each(function() {
              const matchMapel = m === '' || $(this).data('mapel') === m; const matchKelas = k === '' \vert{}\vert{}$(this).data('kelas') === k;
              $(this).toggle(matchMapel && matchKelas);
          });
      }

      function openExamModal(str) {
        $('#modalExam').modal('show'); let d = null;
        if(str) {
          d = JSON.parse(decodeURIComponent(str));
          $('#ex-id').val(d.ExamID); $('#ex-judul').val(d.Judul); $('#ex-mapel').val(d.Mapel); $('#ex-durasi').val(d.Durasi);
          $('#ex-limit').val(d.LimitTries || 1); $('#ex-start').val(d.StartDate.replace(' ','T')); $('#ex-end').val(d.EndDate.replace(' ','T'));
          $('#ex-token').val(d.Token || ''); $('#ex-randomQ').prop('checked', d.RandomQ === 'Yes'); $('#ex-showStats').prop('checked', d.ShowStats === 'Yes');
          $('#ex-violations').val(d.MaxViolations || 3);
        } else {
          $('#modalExam form')[0].reset(); $('#ex-id').val(''); $('#ex-token').val(''); $('#ex-violations').val(3); $('#ex-limit').val(1);
        }
        $('#kelas-container').html(`<input type="text" name="targetKelas" id="ex-kelas" class="form-control" placeholder="Contoh: 7A, 7B" value="${d ? d.TargetKelas : ''}" required>`);
      }

      function saveExam() {
        const d = Object.fromEntries(new FormData(document.getElementById('frm-exam')).entries());
        d.showStats = $('#ex-showStats').is(':checked') ? 'Yes' : 'No'; 
        d.randomQ = $('#ex-randomQ').is(':checked') ? 'Yes' : 'No'; 
        d.userId = user.ID;
        
        showLoad(true);
        window.google.script.run.withSuccessHandler((res) => {
          showLoad(false); $('#modalExam').modal('hide'); toast('success', 'Jadwal Disimpan!'); loadPage('admin-ujian');
        }).adminSaveExam(d);
      }

      function delExam(id){ window.Swal.fire({title:'Hapus Jadwal?', icon:'warning', showCancelButton:true}).then(r=>{if(r.isConfirmed){ showLoad(true); window.google.script.run.withSuccessHandler(()=>{showLoad(false); loadPage('admin-ujian')}).adminDeleteExam(id); }}) }

      function manageQ(id) { activeExamId = id; $('#modalQ').modal('show'); loadQList(); }

      function loadQList() {
          $('#q-list-container').html('<div class="text-center p-5"><div class="spinner"></div></div>');
          window.google.script.run.withSuccessHandler(qs => {
              let html = ''; lastQuestionNum = 0; currentQuestionsData = qs || [];
              let topActions = `<div class="d-flex justify-content-end mb-3 gap-2 flex-wrap"></div>`;
              if (qs && qs.length > 0) {
                  lastQuestionNum = Math.max(...qs.map(q => Number(q.Nomor) || 0));
                  qs.forEach((q, idx) => { html += renderQuestionBlock(q, idx); });
                  $('#q-list-container').html(topActions + html); applyMathJax();
              } else { $('#q-list-container').html(topActions + '<div class="alert alert-info text-center">Belum ada soal. Klik Tambah Soal.</div>'); }
          }).getExamQuestions(activeExamId);
      }

      function addNewQuestionBlock() {
          lastQuestionNum++; const newBlock = renderQuestionBlock({ Nomor: lastQuestionNum }, lastQuestionNum - 1);
          $('#q-list-container').append(newBlock); const uid = $(newBlock).attr('data-id');
          toggleEditQ(uid); $('.modal-body').animate({ scrollTop:$('.modal-body')[0].scrollHeight }, 500);
      }

      function renderQuestionBlock(q, idx) {
          const uid = q.QID ? q.QID : 'NEW_' + Math.random().toString(36).substr(2, 9);
          const nomor = q.Nomor || (idx + 1); const cleanPrev = (q.Pertanyaan || 'Soal Baru').replace(/<[^>]+>/g, '').substring(0, 80) + '...';
          const safeJson = encodeURIComponent(JSON.stringify(q)); 
          return `<div class="card mb-4 border-0 shadow-sm q-block" id="block-${uid}" data-id="${uid}" data-q-obj="${safeJson}"><div class="card-header bg-white d-flex justify-content-between align-items-center py-3"><span class="badge bg-primary rounded-pill px-3">No. ${nomor}</span><div><button class="btn btn-sm btn-outline-secondary me-2" onclick="window.toggleEditQ('${uid}')"><i class="fas fa-edit"></i> Edit</button><button class="btn btn-sm btn-outline-danger" onclick="window.deleteQBlock('${uid}')"><i class="fas fa-trash"></i></button></div></div><div class="card-body"><div class="q-preview mb-2 fw-bold text-muted">${cleanPrev}</div><div class="q-form hidden" id="form-${uid}"><form id="frm-q-${uid}" onsubmit="event.preventDefault(); window.saveQBlock('${uid}'); return false;"><input type="hidden" name="id" value="${q.QID || ''}"><div class="row g-2 mb-3"><div class="col-md-2"><label class="small fw-bold">No</label><input type="number" name="num" class="form-control" value="${nomor}"></div><div class="col-md-4"><label class="small fw-bold">Tipe</label><select name="type" class="form-select q-type-sel" onchange="window.renderAnsFields('${uid}', this.value)" id="type-${uid}"><option value="PGS" ${q.Tipe=='PGS'?'selected':''}>Pilihan Ganda</option></select></div><div class="col-md-2"><label class="small fw-bold">Skor</label><input type="number" step="0.1" name="score" class="form-control" value="${q.Skor || 10}"></div></div><label class="small fw-bold mb-1">Pertanyaan</label><textarea id="sn-${uid}" name="text">${q.Pertanyaan || ''}</textarea><div class="card mt-3 bg-light"><div class="card-body"><label class="small fw-bold mb-2">Jawaban & Kunci</label><div id="ans-area-${uid}"></div></div></div><div class="text-end mt-3"><button type="submit" class="btn btn-success"><i class="fas fa-save"></i> Simpan</button></div></form></div></div></div>`;
      }

      function toggleEditQ(uid) { 
          const form = $(`#form-${uid}`); 
          if (form.hasClass('hidden')) { 
              activeUid = uid; form.removeClass('hidden'); $(`#block-${uid}`).addClass('border-primary'); 
              $(`#sn-${uid}`).summernote(snConfig); renderAnsFields(uid, $(`#type-${uid}`).val());
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
          let h = `<button type="button" class="btn btn-outline-primary btn-sm mb-2" onclick="window.addOptRow('${uid}')">+ Opsi</button><div id="opts-wrap-${uid}">`; 
          if(opts.length) opts.forEach(o => h+=genOptRow(uid, o, keys.includes(o)?'checked':'')); else h+=genOptRow(uid); h+='</div>'; 
          $(`#ans-area-${uid}`).html(h); $(`#ans-area-${uid} .summernote-opt`).summernote(snConfig); 
      }

      function genOptRow(uid, val='', checked='') { return `<div class="d-flex align-items-start mb-2 ans-row gap-2"><div class="mt-2"><input type="radio" name="k_${uid}" class="form-check-input" ${checked}></div><div class="flex-grow-1"><textarea class="summernote-opt">${val}</textarea></div><button type="button" class="btn btn-outline-danger mt-1" onclick="$(this).closest('.ans-row').remove()">X</button></div>`; }
      function addOptRow(uid) { const el = $(genOptRow(uid));$(`#opts-wrap-${uid}`).append(el); el.find('.summernote-opt').summernote(snConfig); }

      function saveQBlock(uid) {
          const form = $(`#frm-q-${uid}`); const type = form.find('select[name="type"]').val(); const text = $(`#sn-${uid}`).summernote('code');
          const score = form.find('input[name="score"]').val(); const num = form.find('input[name="num"]').val();
          const id = form.find('input[name="id"]').val(); let opts=[], keys=[];
          
          $(`#opts-wrap-${uid} .ans-row`).each(function(){ 
              const v = $(this).find('.summernote-opt').summernote('code'); 
              if(v && v !== '<p><br></p>'){ opts.push(v); if($(this).find('.form-check-input').is(':checked')) keys.push(v); } 
          });
          const payload={id:id, num:num, type:type, text:text, options:opts, key:keys, score:score, userId: user.ID}; 
          const btn=form.find('button[type="submit"]'); btn.prop('disabled',true).text('Menyimpan...');
          window.google.script.run.withSuccessHandler(res=>{
              btn.prop('disabled',false).text('Simpan');
              if(res.status==='success'){
                  toast('success','Soal Disimpan!'); toggleEditQ(uid); loadQList();
              } else window.Swal.fire('Error',res.msg,'error');
          }).adminSaveSingleQuestion(activeExamId, payload);
      }

      function deleteQBlock(uid) {
          const id=$(`#block-${uid}`).find('input[name="id"]').val();
          if(!id){ $(`#block-${uid}`).remove(); return; }
          window.Swal.fire({title:'Hapus Soal?',icon:'warning',showCancelButton:true}).then(r=>{
              if(r.isConfirmed) window.google.script.run.withSuccessHandler(()=>loadQList()).adminDeleteQuestion(id);
          });
      }

      function editUser(s){ const u=JSON.parse(decodeURIComponent(s)); $('#modalUser').modal('show'); $('#mu-id').val(u.ID); $('#mu-nama').val(u.Nama); $('#mu-user').val(u.Username); $('#mu-pass').val(u.Password); $('#mu-role').val(u.Role); $('#mu-kelas').val(u.Kelas); $('#mu-sekolah').val(u.Sekolah); }
      function saveUser(e){ if (e) e.preventDefault(); const d={id:$('#mu-id').val(), nama:$('#mu-nama').val(), username:$('#mu-user').val(), password:$('#mu-pass').val(), role:$('#mu-role').val(), kelas:$('#mu-kelas').val(), sekolah:$('#mu-sekolah').val()}; showLoad(true); window.google.script.run.withSuccessHandler(()=>{showLoad(false);$('#modalUser').modal('hide'); loadPage('admin-users')}).adminManageUser('save',d); }
      function delUser(id){ if(confirm('Hapus User?')){ showLoad(true); window.google.script.run.withSuccessHandler(()=>{showLoad(false); loadPage('admin-users')}).adminManageUser('delete',{id:id}); } }
      function filterTable(tid, q) { const f=q.toLowerCase(); $(`#${tid} tbody tr`).each(function(){ const t=$(this).text().toLowerCase();$(this).toggle(t.indexOf(f)>-1); }); }

      // BIND TO WINDOW
      window.handleLogin = handleLogin; window.handleLogout = handleLogout; window.loadPage = loadPage;
      window.toggleSidebar = toggleSidebar; window.appRefresh = appRefresh; window.saveExam = saveExam; window.openExamModal = openExamModal; window.delExam = delExam; window.manageQ = manageQ; window.addNewQuestionBlock = addNewQuestionBlock; window.saveUser = saveUser; window.editUser = editUser; window.delUser = delUser; window.filterTable = filterTable; window.filterAdminUjian = filterAdminUjian; window.toggleEditQ = toggleEditQ; window.renderAnsFields = renderAnsFields; window.addOptRow = addOptRow; window.saveQBlock = saveQBlock; window.deleteQBlock = deleteQBlock;

      $('#togglePassword').on('click', function() {
          const type = $('#p-login').attr('type') === 'password' ? 'text' : 'password';
          $('#p-login').attr('type', type); $(this).toggleClass('fa-eye fa-eye-slash');
      });
      const savedUser = localStorage.getItem('cbt_user');
      if(savedUser) { user = JSON.parse(savedUser); $('#logo-container img').attr('src', user.LogoUrl || 'https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk'); initDash(); }
    };
    initApp();
  }, []);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet" />
      <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/summernote@0.8.18/dist/summernote-lite.min.css" rel="stylesheet" />

      <Script src="https://code.jquery.com/jquery-3.6.0.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/sweetalert2@11" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/summernote@0.8.18/dist/summernote-lite.min.js" strategy="beforeInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" strategy="beforeInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/7.12.1/polyfill.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" strategy="lazyOnload" />

      <div dangerouslySetInnerHTML={{ __html: `
        <style>
          :root { --primary: #7e22ce; --secondary: #a855f7; --accent: #84cc16; --bg-body: #faf5ff; }
          body { font-family: 'Poppins', sans-serif; background-color: var(--bg-body); color: #1e293b; overflow-x: hidden; }
          body.exam-mode { overflow: hidden; user-select: none; }
          .hidden { display: none !important; }
          
          /* SPLIT UI LOGIN UPDATE */
          .auth-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-body); padding: 20px; }
          .auth-card-split { display: flex; background: white; border-radius: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); max-width: 900px; width: 100%; overflow: hidden; z-index: 2; }
          .auth-left { flex: 1; background: linear-gradient(135deg, rgba(126,34,206,0.95) 0%, rgba(132,204,22,0.95) 100%); color: white; padding: 40px; display: flex; flex-direction: column; justify-content: center; }
          .auth-right { flex: 1; padding: 40px; display: flex; flex-direction: column; justify-content: center; }
          @media (max-width: 768px) { .auth-card-split { flex-direction: column; } .auth-left { padding: 30px; text-align: center; } }
          .auth-left h2 { font-weight: 700; margin-bottom: 15px; }
          .auth-left p { font-size: 14px; opacity: 0.9; margin-bottom: 20px; }
          .auth-left ul { list-style: none; padding: 0; margin: 0; }
          .auth-left ul li { margin-bottom: 15px; font-size: 14px; display: flex; align-items: center; gap: 10px; }

          .wrapper { display: flex; width: 100%; align-items: stretch; position: relative; }
          #sidebar { min-width: 260px; max-width: 260px; background: #3b0764; color: #fff; min-height: 100vh; position: fixed; z-index: 1050; transition: all 0.3s; left: 0; top: 0; }
          #sidebar.active { left: -260px; }
          #content { width: 100%; margin-left: 260px; padding: 20px; transition: all 0.3s; min-height: 100vh; display: flex; flex-direction: column; }
          #sidebar ul li a { padding: 15px 25px; display: block; color: #cbd5e1; text-decoration: none; border-left: 4px solid transparent; cursor: pointer; }
          #sidebar ul li a:hover, #sidebar ul li a.active { background: rgba(255,255,255,0.05); color: #fff; border-left-color: var(--accent); }
          @media (max-width: 768px) { #sidebar { left: -260px; } #sidebar.active { left: 0; } #content { margin-left: 0; padding: 15px; } }
          
          .loader { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.8); z-index: 10000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); }
          .spinner { width: 50px; height: 50px; border: 5px solid #e2e8f0; border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
          @keyframes spin { 100% { transform: rotate(360deg); } }
        </style>

        <div id="loader" class="loader hidden"><div class="spinner"></div></div>
        
        <!-- NEW SPLIT LOGIN SCREEN -->
        <div id="view-auth" class="auth-container">
            <div class="auth-card-split">
                <div class="auth-left">
                    <h2>CBT Belajar Inovasi</h2>
                    <p>Selamat datang di sistem Ujian Berbasis Komputer. Platform ini dirancang untuk memberikan pengalaman ujian yang interaktif, stabil, dan aman.</p>
                    <ul>
                        <li><i class="fas fa-bolt fs-5"></i> Sinkronisasi Super Cepat</li>
                        <li><i class="fas fa-shield-alt fs-5"></i> Aman dari Kecurangan</li>
                        <li><i class="fas fa-mobile-alt fs-5"></i> Responsif di Perangkat Seluler</li>
                    </ul>
                </div>
                <div class="auth-right">
                    <div class="text-center mb-4">
                        <div id="logo-container"><img src="https://lh3.googleusercontent.com/d/1V7RV4GJbNhX65Fv81QRhnAQxwSndHEGk" class="mb-3 rounded" width="100" alt="Logo Belajar Inovasi"></div>
                        <h4 class="fw-bold text-center" style="color: var(--primary)">BELAJAR INOVASI</h4>
                    </div>
                    <form id="frm-login" onsubmit="event.preventDefault(); window.handleLogin(); return false;" action="javascript:void(0);">
                        <div class="form-floating mb-3"><input type="text" id="u-login" class="form-control" placeholder="User" required><label>Username</label></div>
                        <div class="form-floating mb-4 position-relative">
                            <input type="password" id="p-login" class="form-control" placeholder="Pass" required>
                            <label>Password</label>
                            <i class="fas fa-eye position-absolute top-50 end-0 translate-middle-y me-3 text-muted" id="togglePassword" style="cursor: pointer; z-index: 10;"></i>
                        </div>
                        <button type="submit" class="btn w-100 py-2 fw-bold shadow-sm" style="background-color: var(--primary); color: white;">MASUK SEKARANG</button>
                    </form>
                </div>
            </div>
            <div class="text-center mt-3 text-muted small z-3">© 2026 BELAJAR INOVASI</div>
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
                        <span class="navbar-brand mb-0 h1 fw-bold fs-5" id="page-title" style="color: var(--primary)">DASHBOARD</span>
                    </div>
                </nav>
                <div id="content-area"></div>
                <footer class="mt-4 text-center text-muted small pb-3 border-top pt-3">© 2026 BELAJAR INOVASI </footer>
            </div>
        </div>

        <!-- MODAL FORM UNTUK JADWAL DAN USER (Sama seperti sebelumnya) -->
        <div class="modal fade" id="modalExam" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header text-white" style="background-color: var(--primary);"><h5 class="modal-title">Konfigurasi Ujian</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>
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
                                <div class="col-md-4"><label class="small fw-bold">Target Kelas</label><div id="kelas-container"></div></div>
                                <div class="col-md-4"><label class="small fw-bold">Batas Pelanggaran</label><input type="number" name="maxViolations" id="ex-violations" class="form-control" value="3" required></div>
                            </div>
                            <button type="submit" class="btn w-100 fw-bold text-white" style="background-color: var(--primary);">SIMPAN JADWAL</button>
                        </form>
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
                            <button type="submit" class="btn btn-success w-100 mt-3">Simpan User</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="modal fade" id="modalQ" tabindex="-1"><div class="modal-dialog modal-fullscreen"><div class="modal-content bg-light"><div class="modal-header bg-white shadow-sm"><h5 class="modal-title fw-bold" style="color: var(--primary)">Editor Soal</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body p-4"><div class="container" style="max-width:900px"><div id="q-list-container"></div><div class="text-center mt-5 mb-5"><button class="btn btn-lg btn-success rounded-pill px-5 shadow" onclick="window.addNewQuestionBlock()"><i class="fas fa-plus-circle me-2"></i> TAMBAH SOAL</button></div></div></div></div></div></div>
      ` }} />
    </>
  );
}
