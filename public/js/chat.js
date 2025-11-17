requireAuth();
bindLogout();
const params = new URLSearchParams(location.search);
const solicitudId = params.get('solicitudId');

const mensajesEl = document.getElementById('mensajes');
const chatWithEl = document.getElementById('chatWith');
const chatWithAvatarEl = document.getElementById('chatWithAvatar');
const viewProfileBtn = document.getElementById('viewProfileBtn');
const form = document.getElementById('chatForm');
const input = document.getElementById('msgInput');
const me = getUser();

let toUserId = null;
let counterpartUser = null;

async function loadMessages(){
  const data = await api(`/api/chats/${solicitudId}`);
  toUserId = data.counterpartId || null;
  // Header info (nombre, avatar)
  if (toUserId && chatWithEl){
    try {
      const u = await api(`/api/users/${toUserId}`);
      counterpartUser = u;
      chatWithEl.textContent = u?.nombre ? `${u.nombre}${u.apellido ? ' ' + u.apellido : ''}` : `Usuario #${toUserId}`;
      if (chatWithAvatarEl) chatWithAvatarEl.src = u?.foto_perfil || '/img/placeholder.svg';
    } catch {
      chatWithEl.textContent = `Usuario #${toUserId}`;
      if (chatWithAvatarEl) chatWithAvatarEl.src = '/img/placeholder.svg';
    }
  }

  mensajesEl.innerHTML = '';
  (data.messages||[]).forEach(addMsg);
  mensajesEl.scrollTop = mensajesEl.scrollHeight;
}

function formatTime(ts){
  const d = new Date(ts || '');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function addMsg(m){
  const isMe = m.id_emisor === me.id;
  const div = document.createElement('div');
  div.className = 'msg ' + (isMe ? 'me' : 'other');
  div.dataset.id = m.id;
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = m.mensaje;
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = formatTime(m.fecha_envio);
  meta.appendChild(timeEl);
  if (isMe){
    const checkEl = document.createElement('span');
    checkEl.className = 'msg-check' + (m.leido ? ' read' : '');
    checkEl.textContent = '✓';
    meta.appendChild(checkEl);
  }
  div.appendChild(body);
  div.appendChild(meta);
  mensajesEl.appendChild(div);
}

const socket = io();
socket.on('connect', ()=>{
  socket.emit('authenticate', getToken());
  socket.emit('join_solicitud', solicitudId);
});
socket.on('new_message', (m)=>{
  if (String(m.id_solicitud) === String(solicitudId)){
    addMsg(m);
    mensajesEl.scrollTop = mensajesEl.scrollHeight;
    if (m.id_receptor === me.id){
      socket.emit('mark_read', { messageId: m.id, solicitudId });
    }
  }
});
socket.on('read', (info)=>{
  // Marcar visualmente mensaje como leído
  const el = Array.from(mensajesEl.children).find(x => x.dataset && String(x.dataset.id) === String(info.id));
  if (el && el.classList.contains('me')){
    const chk = el.querySelector('.msg-check');
    if (chk) chk.classList.add('read');
  }
});
socket.on('delivered', ()=>{/* opcional: feedback al remitente */});

// typing
const typingEl = document.createElement('div');
typingEl.style.opacity = '0.7';
typingEl.style.fontSize = '12px';
mensajesEl.parentElement.insertBefore(typingEl, mensajesEl.nextSibling);
let typingTimeout;
socket.on('typing', ({ solicitudId: sid, fromUserId })=>{
  if (String(sid) !== String(solicitudId) || fromUserId === me.id) return;
  typingEl.textContent = 'Escribiendo…';
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(()=> typingEl.textContent = '', 1000);
});

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const texto = input.value.trim(); if (!texto) return;
  if (!toUserId){
    if (window.uiModals?.alert){
      await window.uiModals.alert({ title: 'Chat', message: 'No hay destinatario definido (asegura que la oferta está aceptada).' });
    }
    return;
  }
  socket.emit('send_message', { solicitudId, toUserId, mensaje: texto });
  input.value = '';
});

// Emitir typing mientras escribe
let lastTyping = 0;
input.addEventListener('input', ()=>{
  const now = Date.now();
  if (toUserId && now - lastTyping > 500){
    socket.emit('typing', { solicitudId, toUserId });
    lastTyping = now;
  }
});

// Ver perfil (modal)
viewProfileBtn?.addEventListener('click', async ()=>{
  if (!counterpartUser && toUserId){
    try{ counterpartUser = await api(`/api/users/${toUserId}`); }catch{}
  }
  const u = counterpartUser || {};
  document.getElementById('profileName').textContent = u?.nombre ? `${u.nombre}${u.apellido ? ' ' + u.apellido : ''}` : `Usuario #${toUserId}`;
  document.getElementById('profileEmail').textContent = u?.correo || '';
  document.getElementById('profileExtra').textContent = u?.rol ? `Rol: ${u.rol}${u.telefono ? ' · Tel: ' + u.telefono : ''}` : '';
  document.getElementById('profileAvatar').src = u?.foto_perfil || '/img/placeholder.svg';
  const modalEl = document.getElementById('userProfileModal');
  if (window.bootstrap){
    (bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl)).show();
  } else {
    modalEl.classList.add('show'); modalEl.style.display = 'block'; modalEl.removeAttribute('aria-hidden');
  }
});

loadMessages();

// Cierre del modal de perfil (fallback si no hay Bootstrap)
function hideUserProfileModal(){
  const modalEl = document.getElementById('userProfileModal');
  if (window.bootstrap){
    const inst = bootstrap.Modal.getInstance(modalEl);
    if (inst) inst.hide();
  } else {
    modalEl.classList.remove('show');
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden','true');
  }
}
document.getElementById('userProfileCloseBtn')?.addEventListener('click', hideUserProfileModal);
document.getElementById('userProfileCloseX')?.addEventListener('click', hideUserProfileModal);
