// app/page.js
export default function Page() {
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        :root { 
            --primary: #7e22ce; /* Ungu */
            --secondary: #a855f7; /* Ungu Muda */
            --accent: #84cc16; /* Hijau Muda */
            --bg-body: #faf5ff; /* Background Ungu Sangat Terang */
        }
        body { font-family: 'Poppins', sans-serif; background-color: var(--bg-body); color: #1e293b; overflow-x: hidden; }
        body.exam-mode { overflow: hidden; user-select: none; }
        .hidden { display: none !important; }
        .q-content img, .opt-content img { max-width: 100% !important; height: auto !important; border-radius: 6px; margin: 5px 0; }
        
        /* Tema Warna Diperbarui Pada Auth */
        .auth-container { 
            min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; 
            background: linear-gradient(135deg, rgba(126,34,206,0.9) 0%, rgba(132,204,22,0.9) 100%); 
            padding: 20px;
        }
        .auth-card { background: white; border-radius: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); width: 100%; max-width: 420px; padding: 40px; z-index: 2; }
        
        /* Tambahkan sisa CSS asli dari index menjadi turso.txt ke sini (tidak ada yang dihapus) */
        .wrapper { display: flex; width: 100%; align-items: stretch; position: relative; }
        #sidebar { min-width: 260px; max-width: 260px; background: #3b0764; color: #fff; min-height: 100vh; position: fixed; z-index: 1050; transition: all 0.3s; left: 0; top: 0; }
        #sidebar.active { left: -260px; }
        #content { width: 100%; margin-left: 260px; padding: 20px; transition: all 0.3s; min-height: 100vh; display: flex; flex-direction: column; }
        /* ... Sisa CSS Identik dengan sumber ... */
      `}} />

      {/* Masukkan Seluruh Struktur HTML <body> dari index menjadi turso.txt di sini */}
      <div id="loader" className="loader hidden"><div className="spinner"></div></div>
      <div id="view-auth" className="auth-container">
          {/* Form Login Anda, dll... Sama Persis dengan File Asli */}
          <div className="auth-card">
              <h4 className="fw-bold text-center" style={{color: "var(--primary)"}}>MIN 1 MANGGARAI TIMUR</h4>
              <form id="frm-login" onSubmit={(e) => { e.preventDefault(); window.handleLogin(); }}>
                  <div className="form-floating mb-3"><input type="text" id="u-login" className="form-control" placeholder="User" required/><label>Username</label></div>
                  <div className="form-floating mb-4 position-relative">
                      <input type="password" id="p-login" className="form-control" placeholder="Pass" required/>
                      <label>Password</label>
                  </div>
                  <button type="submit" className="btn w-100 py-2 fw-bold shadow-sm" style={{backgroundColor: "var(--primary)", color: "white"}}>MASUK SEKARANG</button>
              </form>
          </div>
      </div>
      
      {/* SCRIPT INJEKSI: Mengarahkan GAS ke API Vercel */}
      <script dangerouslySetInnerHTML={{__html: `
        // MOCKUP API UNTUK MENGGANTIKAN GOOGLE.SCRIPT.RUN
        window.google = {
            script: {
                run: new Proxy({}, {
                    get: function(target, prop) {
                        if (prop === 'withSuccessHandler') {
                            return function(fn) { target.successFn = fn; return new Proxy(target, this); }.bind(this);
                        }
                        if (prop === 'withFailureHandler') {
                            return function(fn) { target.failureFn = fn; return new Proxy(target, this); }.bind(this);
                        }
                        return function(...args) {
                            fetch('/api/cbt', {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({ action: prop, args: args })
                            })
                            .then(r => r.json())
                            .then(res => { if(target.successFn) target.successFn(res); })
                            .catch(err => { if(target.failureFn) target.failureFn(err); });
                        }
                    }
                })
            }
        };

        // Salin seluruh script Javascript dari file "index menjadi turso.txt" Anda ke bawah ini.
        // Fungsi handleLogin, handleLogout, initDash, dll. TIDAK PERLU DIUBAH!
      `}} />
    </>
  );
}
