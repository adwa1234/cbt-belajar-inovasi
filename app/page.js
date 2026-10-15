"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

export default function Page() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    if (typeof window === "undefined" || window.appInitialized) return;
    window.appInitialized = true;

    // =================================================================
    // 1. DEKLARASI GLOBAL & PROXY FETCH KE ROUTE.JS
    // =================================================================
    window.google = {
      script: {
        get run() {
          const runner = { successFn: null, failureFn: null };
          const proxy = new Proxy(runner, {
            get: function (target, prop) {
              if (prop === "withSuccessHandler") { return function (fn) { target.successFn = fn; return proxy; }; }
              if (prop === "withFailureHandler") { return function (fn) { target.failureFn = fn; return proxy; }; }
              if (prop === 'then' || prop === 'catch' || typeof prop === 'symbol') { return target[prop]; }

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

    window.applyMathJax = function() {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise().catch((err) => console.log('MathJax Error:', err));
        }
    };

    const initApp = () => {
      if (!window.jQuery || !window.Swal || !window.XLSX) {
        setTimeout(initApp, 100);
        return;
      }
      
      const $ = window.jQuery;
      
      // =================================================================
      // 2. KONFIGURASI SUMMERNOTE DAN MATHJAX
      // =================================================================
      const MathButton = function (context) {
          const ui = $.summernote.ui;
          return ui.button({
              contents: '<i class="fas fa-square-root-alt"></i> Rumus', tooltip: 'Tambahkan Rumus Matematika (LaTeX)',
              click: function () {
                  window.Swal.fire({
                      title: 'Editor Rumus (LaTeX)', 
                      html: `<div class="text-start small mb-2 text-muted">Ketik format LaTeX:</div>
                             <textarea id="swal-math-input" class="form-control font-monospace" rows="3"></textarea>`,
                      showCancelButton: true, confirmButtonText: 'Sisipkan'
                  }).then((result) => { 
                      if (result.isConfirmed) { 
                          const mathText = document.getElementById('swal-math-input').value; 
                          if(mathText) context.invoke('editor.insertText', ` $$ ${mathText} $$ `); 
                      } 
                  });
              }
          }).render();
      };
      
      window.snConfig = { 
          height: 180, 
          toolbar: [['style', ['bold', 'italic', 'underline']], ['para', ['ul', 'ol']], ['insert', ['picture', 'table', 'math']]], 
          buttons: { math: MathButton } 
      };

      // Inisialisasi fungsi lain (seperti openModal, renderContent, loadPage) yang sama dengan source file.
      // Modifikasi pemanggilan toggleEditQ untuk menggunakan window.snConfig
      window.toggleEditQ = function(uid) { 
          const form = $('#form-'+uid); 
          if (form.hasClass('hidden')) { 
              window.activeUid = uid; form.removeClass('hidden'); $('#block-'+uid).addClass('border-primary'); 
              $('#sn-'+uid).summernote(window.snConfig); 
              window.renderAnsFields(uid, document.getElementById('type-'+uid).value);
          } else { 
              form.addClass('hidden'); $('#block-'+uid).removeClass('border-primary'); 
              $('#sn-'+uid).summernote('destroy'); 
              $('#ans-area-'+uid+' .summernote-opt').each(function(){ $(this).summernote('destroy'); }); 
          } 
      };

      window.addOptRow = function(uid, t) { 
          const el = $(window.genOptRow(uid, t));$('#opts-wrap-'+uid).append(el); 
          el.find('.summernote-opt').summernote(window.snConfig); 
      };
    };

    setTimeout(initApp, 300);

  }, [isMounted]);

  if (!isMounted) return <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f1f5f9' }}></div>;

  return (
    <>
      {/* Script & Style injection (seperti aslinya) */}
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
      <Script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" strategy="lazyOnload" />

      {/* HTML DOM Content (sama dengan aslinya) */}
      <div dangerouslySetInnerHTML={{ __html: `... ` }} /> 
    </>
  );
}
