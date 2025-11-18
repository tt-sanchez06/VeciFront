// ===============================
//  API BASE REMOTO FIJO (Render)
// ===============================
const API_BASE = "https://veciback-1.onrender.com/api";

function getToken(){ return localStorage.getItem('token'); }
function setToken(t){ localStorage.setItem('token', t); }
function clearToken(){ localStorage.removeItem('token'); }
function getUser(){ try{ return JSON.parse(localStorage.getItem('user')||'null'); }catch{return null} }
function setUser(u){ localStorage.setItem('user', JSON.stringify(u)); }

// ===============
//   API WRAPPER
// ===============
async function api(path, { method='GET', data, formData }={}){
  const headers = {};
  let body;

  if (formData){
    body = formData;
  } else if (data){
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }

  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const res = await fetch(API_BASE + path, { method, headers, body });
    if (!res.ok) {
      const msg = (await res.json().catch(()=>({error:res.statusText}))).error || 'Error';
      throw new Error(msg);
    }
    return res.json();
  } catch (err){
    console.error("API error:", err);
    throw err;
  }
}

// =========================
//     AUTENTICACIÓN
// =========================
function requireAuth(){
  const t = getToken();
  if (!t) window.location.href = '/login.html';
}

async function ensureValidAuthOrRedirect(){
  try{
    requireAuth();
    await api('/auth/me');
  }catch(e){
    clearToken();
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  }
}

// =========================
//    FORMATOS Y HELPERS
// =========================
function formatDate(dt){
  return new Date(dt).toLocaleString();
}

function bindLogout(){
  const btn = document.getElementById('logoutBtn');
  if (btn){
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      clearToken();
      localStorage.removeItem('user');
      window.location.href = '/login.html';
    });
  }
}

// =========================
//    SISTEMA DE MODALES
// =========================
function createBaseModal({ title, message } = {}){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const card = document.createElement('div');
  card.className = 'modal-card';

  if (title){
    const heading = document.createElement('h3');
    heading.textContent = title;
    card.appendChild(heading);
  }
  if (message){
    const p = document.createElement('p');
    p.textContent = message;
    card.appendChild(p);
  }

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  requestAnimationFrame(()=> overlay.classList.add('show'));

  const close = ()=>{
    overlay.classList.remove('show');
    setTimeout(()=> overlay.remove(), 200);
  };

  return { overlay, card, close };
}

function showModalAlert({ title='Aviso', message='', confirmText='Aceptar' } = {}){
  return new Promise((resolve)=>{
    const { card, overlay, close } = createBaseModal({ title, message });
    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-sm btn-primary';
    okBtn.textContent = confirmText;

    actions.appendChild(okBtn);
    card.appendChild(actions);

    const finish = ()=>{
      close();
      document.removeEventListener('keydown', onKey);
      resolve();
    };

    const onKey = (e)=>{
      if (e.key === 'Escape'){
        e.preventDefault();
        finish();
      }
    };

    okBtn.addEventListener('click', finish);
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) finish(); });
    document.addEventListener('keydown', onKey);
  });
}

function showModalConfirm({ title='Confirmar', message='', confirmText='Aceptar', cancelText='Cancelar' } = {}){
  return new Promise((resolve)=>{
    const { card, overlay, close } = createBaseModal({ title, message });
    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-outline-secondary';
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-sm btn-danger';
    okBtn.textContent = confirmText;

    actions.append(cancelBtn, okBtn);
    card.appendChild(actions);

    const finish = (res)=>{
      close();
      document.removeEventListener('keydown', onKey);
      resolve(res);
    };

    const onKey = (e)=>{
      if (e.key === 'Escape'){
        e.preventDefault();
        finish(false);
      }
    };

    cancelBtn.addEventListener('click', ()=> finish(false));
    okBtn.addEventListener('click', ()=> finish(true));
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) finish(false); });
    document.addEventListener('keydown', onKey);
  });
}

window.uiModals = {
  alert: showModalAlert,
  confirm: showModalConfirm
};

// Exponer helpers globales
window.bindLogout = bindLogout;
window.ensureValidAuthOrRedirect = ensureValidAuthOrRedirect;
