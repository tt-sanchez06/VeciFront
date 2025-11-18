/********************************************
 *   APP.JS FINAL — PRODUCCIÓN FUNCIONANDO   *
 ********************************************/

// Siempre usar el backend fijo de Render
const API_BASE = "https://veciback-1.onrender.com";

// Token & Usuario
function getToken(){ return localStorage.getItem('token'); }
function setToken(t){ localStorage.setItem('token', t); }
function clearToken(){ localStorage.removeItem('token'); }
function getUser(){ try{ return JSON.parse(localStorage.getItem('user')||'null'); }catch{return null} }
function setUser(u){ localStorage.setItem('user', JSON.stringify(u)); }

// Fetch unificado
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

  const url = API_BASE + path;

  try {
    const res = await fetch(url, { method, headers, body });
    if (!res.ok){
      const err = await res.json().catch(()=>({ error: "Error" }));
      throw new Error(err.error || "Error");
    }
    return res.json();
  } catch (e){
    throw new Error("No se pudo conectar con el servidor");
  }
}

// Proteger rutas
function requireAuth(){
  if (!getToken()) window.location.href = "login.html";
}

async function ensureValidAuthOrRedirect(){
  try{
    await api("/api/auth/me");
  }catch{
    clearToken();
    window.location.href = "login.html";
  }
}

// Logout
function bindLogout(){
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;
  btn.onclick = ()=>{
    clearToken();
    localStorage.removeItem("user");
    window.location.href = "login.html";
  };
}

// Modal — simple
function showModalAlert({ title='Aviso', message='', confirmText='Aceptar' } = {}){
  alert(title + "\n" + message);
  return Promise.resolve();
}

// Socket.io
function createSocketConnection(){
  if (typeof window === 'undefined' || typeof window.io !== 'function'){
    console.warn("Socket.io no disponible");
    return null;
  }
  
  return window.io(API_BASE, {
    transports: ["websocket"],
    withCredentials: true
  });
}

window.API_BASE = API_BASE;
window.api = api;
window.bindLogout = bindLogout;
window.requireAuth = requireAuth;
window.ensureValidAuthOrRedirect = ensureValidAuthOrRedirect;
window.createSocketConnection = createSocketConnection;
