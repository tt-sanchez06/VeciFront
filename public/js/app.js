// Resolve API base robustly
// - file:// -> http://localhost:3000
// - if running on a non-3000 port (e.g., Live Server), point to backend on :3000
// - allow override with window.API_BASE if defined
const API_BASE = (function(){
  try {
    if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE;
    if (location.protocol === 'file:') return 'http://localhost:3000';
    const port = location.port || '';
    if (port && port !== '3000') return 'http://localhost:3000';
    return '';
  } catch {}
  return 'http://localhost:3000';
})();

// If opened directly as file://, rewrite absolute asset and link paths to relative
(function fixAbsolutePathsForFileProtocol(){
  try {
    if (typeof window === 'undefined') return;
    if (location.protocol !== 'file:') return;
    const attrs = ['href','src'];
    attrs.forEach(attr => {
      document.querySelectorAll(`[${attr}^='/']`).forEach(el => {
        const val = el.getAttribute(attr);
        if (!val) return;
        // Avoid double-dotting if already fixed
        if (val.startsWith('./') || val.startsWith('../')) return;
        el.setAttribute(attr, `.${val}`);
      });
    });
  } catch {}
})();

function getToken(){ return localStorage.getItem('token'); }
function setToken(t){ localStorage.setItem('token', t); }
function clearToken(){ localStorage.removeItem('token'); }
function getUser(){ try{ return JSON.parse(localStorage.getItem('user')||'null'); }catch{return null} }
function setUser(u){ localStorage.setItem('user', JSON.stringify(u)); }

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

  // Try multiple bases to avoid "Failed to fetch" when backend is on a different origin/port
  const bases = (() => {
    const list = [];
    try { if (typeof window !== 'undefined' && window.API_BASE) list.push(window.API_BASE); } catch {}
    try {
      if (location.protocol === 'file:') return ['http://localhost:3000', 'http://127.0.0.1:3000'];
      // Prefer same-origin first
      list.push('');
      // If serving frontend on other port, add common local backends
      if ((location.port || '') !== '3000') list.push('http://localhost:3000', 'http://127.0.0.1:3000');
    } catch { list.push('http://localhost:3000'); }
    return list.length ? list : [''];
  })();

  let lastErr;
  for (const base of bases){
    try {
      const res = await fetch(base + path, { method, headers, body });
      if (!res.ok) {
        const msg = (await res.json().catch(()=>({error:res.statusText}))).error || 'Error';
        throw new Error(msg);
      }
      return res.json();
    } catch (e){
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error('Network error');
}

function requireAuth(){
  const t = getToken();
  if (!t) window.location.href = '/login.html';
}

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

async function ensureValidAuthOrRedirect(){
  // Comprueba token y que /me responda; si falla, vuelve a login
  try{
    requireAuth();
    await api('/api/auth/me');
  }catch(e){
    clearToken();
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  }
}

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

function showModalPrompt({ title='Entrada', message='', placeholder='', defaultValue='', confirmText='Aceptar', cancelText='Cancelar', multiline=false } = {}){
  return new Promise((resolve)=>{
    const { card, overlay, close } = createBaseModal({ title, message });
    const input = multiline ? document.createElement('textarea') : document.createElement('input');
    input.className = 'form-control';
    input.placeholder = placeholder;
    if (!multiline) input.type = 'text';
    input.value = defaultValue || '';
    card.appendChild(input);
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-outline-secondary';
    cancelBtn.textContent = cancelText;
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-sm btn-primary';
    okBtn.textContent = confirmText;
    actions.append(cancelBtn, okBtn);
    card.appendChild(actions);
    input.focus();
    const finish = (value)=>{
      close();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e)=>{
      if (e.key === 'Escape'){
        e.preventDefault();
        finish(null);
      }
      if (!multiline && e.key === 'Enter'){
        e.preventDefault();
        finish(input.value);
      }
    };
    cancelBtn.addEventListener('click', ()=> finish(null));
    okBtn.addEventListener('click', ()=> finish(input.value));
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) finish(null); });
    document.addEventListener('keydown', onKey);
  });
}

function showModalRating({ title='Calificar', message='Califica de 1 a 5', confirmText='Aceptar', cancelText='Cancelar' } = {}){
  return new Promise((resolve)=>{
    const { card, overlay, close } = createBaseModal({ title, message });
    const ratingLabel = document.createElement('label');
    ratingLabel.className = 'form-label';
    ratingLabel.textContent = 'Puntuación (1-5)';
    const ratingInput = document.createElement('input');
    ratingInput.type = 'number';
    ratingInput.min = '1';
    ratingInput.max = '5';
    ratingInput.value = '5';
    ratingInput.className = 'form-control';
    const commentLabel = document.createElement('label');
    commentLabel.className = 'form-label mt-3';
    commentLabel.textContent = 'Comentario (opcional)';
    const commentInput = document.createElement('textarea');
    commentInput.className = 'form-control';
    commentInput.rows = 3;
    card.append(ratingLabel, ratingInput, commentLabel, commentInput);
    const error = document.createElement('div');
    error.className = 'text-danger small mt-1';
    error.style.display = 'none';
    card.appendChild(error);
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-outline-secondary';
    cancelBtn.textContent = cancelText;
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-sm btn-primary';
    okBtn.textContent = confirmText;
    actions.append(cancelBtn, okBtn);
    card.appendChild(actions);
    ratingInput.focus();
    const showError = (msg)=>{
      error.textContent = msg;
      error.style.display = '';
    };
    const finish = (value)=>{
      close();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e)=>{
      if (e.key === 'Escape'){
        e.preventDefault();
        finish(null);
      }
    };
    cancelBtn.addEventListener('click', ()=> finish(null));
    okBtn.addEventListener('click', ()=>{
      const score = parseInt(ratingInput.value, 10);
      if (!score || score < 1 || score > 5){
        showError('Ingresa un valor entre 1 y 5.');
        ratingInput.focus();
        return;
      }
      finish({ rating: score, comment: commentInput.value.trim() });
    });
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) finish(null); });
    document.addEventListener('keydown', onKey);
  });
}

function showModalSchedule({ title='Agendar cita', message='Selecciona fecha y lugar', confirmText='Guardar', cancelText='Cancelar' } = {}){
  return new Promise((resolve)=>{
    const { card, overlay, close } = createBaseModal({ title, message });
    const dateLabel = document.createElement('label');
    dateLabel.className = 'form-label';
    dateLabel.textContent = 'Fecha y hora';
    const dateInput = document.createElement('input');
    dateInput.type = 'datetime-local';
    dateInput.className = 'form-control';
    const placeLabel = document.createElement('label');
    placeLabel.className = 'form-label mt-3';
    placeLabel.textContent = 'Lugar (opcional)';
    const placeInput = document.createElement('input');
    placeInput.type = 'text';
    placeInput.placeholder = 'Ej: Parque principal';
    placeInput.className = 'form-control';
    const error = document.createElement('div');
    error.className = 'text-danger small mt-1';
    error.style.display = 'none';
    card.append(dateLabel, dateInput, placeLabel, placeInput, error);
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-outline-secondary';
    cancelBtn.textContent = cancelText;
    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-sm btn-primary';
    okBtn.textContent = confirmText;
    actions.append(cancelBtn, okBtn);
    card.appendChild(actions);
    dateInput.focus();
    const showError = (msg)=>{
      error.textContent = msg;
      error.style.display = '';
    };
    const finish = (value)=>{
      close();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e)=>{
      if (e.key === 'Escape'){
        e.preventDefault();
        finish(null);
      }
    };
    cancelBtn.addEventListener('click', ()=> finish(null));
    okBtn.addEventListener('click', ()=>{
      if (!dateInput.value){
        showError('La fecha es obligatoria.');
        dateInput.focus();
        return;
      }
      finish({ date: dateInput.value, place: placeInput.value.trim() });
    });
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) finish(null); });
    document.addEventListener('keydown', onKey);
  });
}

window.uiModals = {
  alert: showModalAlert,
  confirm: showModalConfirm,
  prompt: showModalPrompt,
  rating: showModalRating,
  schedule: showModalSchedule
};

// Exponer helpers globales
window.bindLogout = bindLogout;
window.ensureValidAuthOrRedirect = ensureValidAuthOrRedirect;
