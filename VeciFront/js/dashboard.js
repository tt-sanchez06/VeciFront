requireAuth();
let user = getUser();
const perfil = document.getElementById('perfil');
const lista = document.getElementById('lista');
const tituloLista = document.getElementById('tituloLista');
const listaVoluntario = document.getElementById('listaVoluntario');
const volSolicitudesCard = document.getElementById('volSolicitudesCard');
const solicitudesCard = document.getElementById('solicitudesCard');
const listaDescripcion = document.getElementById('listaDescripcion');
bindLogout();

const viewButtons = Array.from(document.querySelectorAll('[data-view]'));
const viewSections = Array.from(document.querySelectorAll('[id^="view-"]'));
function updateSectionTitle(viewId){
  const titleEl = document.getElementById('mainTitle');
  if (!titleEl) return;
  const btn = viewButtons.find(b => b.dataset.view === viewId);
  titleEl.textContent = btn ? btn.textContent.trim() : '';
}

function showView(viewId){
  viewSections.forEach(section=>{
    if (!section) return;
    const isActive = section.id === viewId;
    section.hidden = !isActive;
  });
  viewButtons.forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });
  updateSectionTitle(viewId);
}
viewButtons.forEach(btn=>{
  btn.addEventListener('click', () => {
    showView(btn.dataset.view);
    if (btn.dataset.view === 'view-chat'){
      loadChatConversations();
    }
  });
});
showView('view-solicitud');

const uiModals = window.uiModals || {};
const chatEls = {
  list: document.getElementById('chatList'),
  partner: document.getElementById('chatPartner'),
  partnerName: document.getElementById('chatPartnerName'),
  partnerAvatar: document.getElementById('chatPartnerAvatar'),
  box: document.getElementById('chatPreview'),
  input: document.getElementById('chatQuickInput'),
  send: document.getElementById('chatQuickSend'),
  viewProfile: document.getElementById('chatViewProfileBtn'),
  typing: document.getElementById('chatTypingHint')
};
const CHAT_AVATAR_PLACEHOLDER = '/img/placeholder.svg';
let chatConversations = [];
let selectedConversation = null;
let chatInitialized = false;
const joinedSolicitudes = new Set();
let chatTypingTimeout = null;
let lastTypingEmission = 0;
let socketAuthenticated = false;
let volunteerFilterParams = {};
let pendingChatSolicitudId = null;

initChatSection();

async function showInfoModal(message, title='Aviso'){
  if (uiModals.alert) return uiModals.alert({ title, message });
  return Promise.resolve();
}

async function showErrorModal(message){
  return showInfoModal(message || 'Ocurrio un error', 'Error');
}

async function requestTextInput({ title, message, placeholder='', defaultValue='', multiline=false } = {}){
  if (uiModals.prompt){
    return uiModals.prompt({ title, message, placeholder, defaultValue, confirmText:'Aceptar', cancelText:'Cancelar', multiline });
  }
  return prompt(message || '', defaultValue || '');
}

async function requestRatingDialog({ title, confirmText }){
  if (uiModals.rating){
    const data = await uiModals.rating({ title, confirmText });
    if (!data) return null;
    return { puntuacion: data.rating, comentario: data.comment || '' };
  }
  const puntuacionStr = prompt('calificacion (1-5):','5');
  if (!puntuacionStr) return null;
  const puntuacion = parseInt(puntuacionStr, 10);
  if (!puntuacion || puntuacion < 1 || puntuacion > 5) return null;
  const comentario = prompt('Comentario (opcional):','') || '';
  return { puntuacion, comentario };
}

async function requestScheduleData(){
  if (uiModals.schedule){
    const data = await uiModals.schedule({ title:'Agendar cita', message:'Selecciona fecha, hora y lugar.' });
    if (!data) return null;
    return { fecha: data.date, lugar: data.place || '' };
  }
  const fecha = prompt('Fecha y hora (YYYY-MM-DD HH:MM):','');
  if (!fecha) return null;
  const lugar = prompt('Lugar de encuentro:','') || '';
  return { fecha, lugar };
}

function initChatSection(){
  if (chatInitialized || !chatEls.box) return;
  chatInitialized = true;
  resetChatPanel();
  chatEls.send?.setAttribute('type','button');
  chatEls.send?.addEventListener('click', sendActiveChatMessage);
  chatEls.input?.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendActiveChatMessage();
    }
  });
  chatEls.input?.addEventListener('input', handleTyping);
  chatEls.viewProfile?.addEventListener('click', openCounterpartProfile);
}

function openDashboardChat(solicitudId){
  if (!solicitudId) return;
  pendingChatSolicitudId = Number(solicitudId);
  showView('view-chat');
  loadChatConversations();
}

function disableChatInput(state){
  if (chatEls.input) chatEls.input.disabled = state;
  if (chatEls.send) chatEls.send.disabled = state;
}

function resetChatPanel(){
  setChatPartnerDisplay(null);
  if (chatEls.box) chatEls.box.innerHTML = '<p class="muted chat-empty">Selecciona una conversacion para comenzar.</p>';
  if (chatEls.typing) chatEls.typing.textContent = '';
  if (chatEls.input) chatEls.input.value = '';
  disableChatInput(true);
  if (chatEls.viewProfile) chatEls.viewProfile.disabled = true;
}

function formatPersonName(person){
  if (!person) return 'Usuario';
  const fullName = [person.nombre, person.apellido].filter(Boolean).join(' ').trim();
  return fullName || `Usuario #${person.id || ''}`.trim();
}

function setChatPartnerDisplay(person){
  const name = person ? formatPersonName(person) : 'Selecciona un chat';
  if (chatEls.partnerName){
    chatEls.partnerName.textContent = name;
  } else if (chatEls.partner){
    chatEls.partner.textContent = name;
  }
  const avatarSrc = person?.foto_perfil || CHAT_AVATAR_PLACEHOLDER;
  if (chatEls.partnerAvatar){
    chatEls.partnerAvatar.src = avatarSrc;
    chatEls.partnerAvatar.alt = `Foto de ${name}`;
  }
}

async function loadChatConversations(){
  if (!chatEls.list) return;
  try{
    const data = await api('/api/chats');
    const list = Array.isArray(data) ? data : [];
    const activeId = selectedConversation?.solicitudId;
    const previousMessages = selectedConversation?.messages;
    const previousCounterpart = selectedConversation?.counterpart;
    chatConversations = list;
    selectedConversation = activeId ? chatConversations.find(c => c.solicitudId === activeId) || null : null;
    if (selectedConversation && previousMessages){
      selectedConversation.messages = previousMessages;
    }
    if (selectedConversation && previousCounterpart){
      selectedConversation.counterpart = { ...previousCounterpart, ...(selectedConversation.counterpart || {}) };
    }
    renderChatList();
    if (pendingChatSolicitudId){
      const desired = chatConversations.find(c => Number(c.solicitudId) === Number(pendingChatSolicitudId));
      if (desired){
        pendingChatSolicitudId = null;
        openConversation(desired);
        return;
      }
    }
    if (!selectedConversation && chatConversations.length){
      openConversation(chatConversations[0]);
    } else if (!chatConversations.length){
      resetChatPanel();
    } else if (selectedConversation){
      setChatPartnerDisplay(selectedConversation.counterpart);
    }
    chatConversations.forEach(conv => joinChatRoom(conv.solicitudId));
  }catch(err){
    console.error('No se pudieron cargar los chats', err);
    chatEls.list.innerHTML = '<p class="muted">No pudimos cargar tus chats.</p>';
  }
}

function renderChatList(){
  if (!chatEls.list) return;
  const grouped = groupChatConversations();
  chatEls.list.innerHTML = '';
  if (!grouped.length){
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Aún no tienes chats activos.';
    chatEls.list.appendChild(empty);
    return;
  }
  grouped.forEach(({ conv, unreadCount }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-list-item';
    if (selectedConversation && selectedConversation.solicitudId === conv.solicitudId){
      btn.classList.add('active');
    }
    const nameEl = document.createElement('div');
    nameEl.className = 'chat-list-name';
    nameEl.textContent = formatPersonName(conv.counterpart);
    const snippetEl = document.createElement('div');
    snippetEl.className = 'chat-list-snippet';
    snippetEl.textContent = conv.lastMessage?.trim() || conv.descripcion || 'Sin mensajes';
    btn.append(nameEl, snippetEl);
    const unread = unreadCount || conv.unreadCount || 0;
    if (unread){
      const badge = document.createElement('span');
      badge.className = 'chat-badge';
      badge.textContent = unread > 9 ? '9+' : String(unread);
      btn.appendChild(badge);
    }
    btn.addEventListener('click', ()=> openConversation(conv));
    chatEls.list.appendChild(btn);
  });
}

function getConversationKey(conv){
  if (!conv) return '';
  if (conv.counterpart?.id) return `user:${conv.counterpart.id}`;
  return `solicitud:${conv.solicitudId}`;
}

function groupChatConversations(){
  if (!chatConversations.length) return [];
  const map = new Map();
  chatConversations.forEach(conv => {
    const key = getConversationKey(conv) || `solicitud:${conv.solicitudId}`;
    if (!key) return;
    const unread = Number(conv.unreadCount) || 0;
    const existing = map.get(key);
    if (!existing){
      map.set(key, { conv, unreadCount: unread });
    } else {
      const prevTime = new Date(existing.conv.lastMessageAt || 0).getTime();
      const newTime = new Date(conv.lastMessageAt || 0).getTime();
      if (newTime > prevTime){
        existing.conv = conv;
      }
      existing.unreadCount += unread;
    }
  });
  return Array.from(map.values());
}

async function openConversation(conv){
  if (!conv || !chatEls.box) return;
  pendingChatSolicitudId = null;
  selectedConversation = conv;
  renderChatList();
  disableChatInput(true);
  if (chatEls.typing) chatEls.typing.textContent = '';
  if (chatEls.viewProfile) chatEls.viewProfile.disabled = false;
  setChatPartnerDisplay(conv.counterpart);
  chatEls.box.innerHTML = '<p class="muted chat-empty">Cargando conversación...</p>';
  try{
    const data = await api(`/api/chats/${conv.solicitudId}`);
    conv.counterpartId = data.counterpartId || conv.counterpart?.id || conv.counterpartId;
    conv.messages = data.messages || [];
    if (selectedConversation === conv){
      setChatPartnerDisplay(conv.counterpart);
    }
    renderMessages(conv.messages);
    disableChatInput(false);
    chatEls.viewProfile?.removeAttribute('disabled');
    chatEls.input?.focus();
    conv.unreadCount = 0;
    renderChatList();
    joinChatRoom(conv.solicitudId);
  }catch(e){
    chatEls.box.innerHTML = '<p class="muted chat-empty">No se pudo cargar el chat.</p>';
    await showErrorModal(e.message);
  }
}

function renderMessages(messages = []){
  if (!chatEls.box) return;
  chatEls.box.innerHTML = '';
  if (!messages.length){
    chatEls.box.innerHTML = '<p class="muted chat-empty">Aún no hay mensajes.</p>';
    return;
  }
  messages.forEach(m => addChatMessage(m));
  chatEls.box.scrollTop = chatEls.box.scrollHeight;
}

function addChatMessage(m){
  if (!chatEls.box) return;
  const me = user || getUser();
  const isMe = me && m.id_emisor === me.id;
  const firstChild = chatEls.box.firstElementChild;
  if (firstChild && firstChild.classList.contains('chat-empty')){
    chatEls.box.innerHTML = '';
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'msg ' + (isMe ? 'me' : 'other');
  wrapper.dataset.id = m.id;
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = m.mensaje;
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = formatChatTime(m.fecha_envio);
  meta.appendChild(timeEl);
  if (isMe){
    const chk = document.createElement('span');
    chk.className = 'msg-check' + (m.leido ? ' read' : '');
    chk.textContent = '?';
    meta.appendChild(chk);
  }
  wrapper.append(body, meta);
  chatEls.box.appendChild(wrapper);
}

function formatChatTime(ts){
  const d = new Date(ts || '');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

async function sendActiveChatMessage(){
  if (!selectedConversation || !chatEls.input) return;
  const text = chatEls.input.value.trim();
  if (!text) return;
  const toUserId = selectedConversation.counterpart?.id || selectedConversation.counterpartId;
  if (!toUserId){
    await showErrorModal('No hay destinatario definido para este chat.');
    return;
  }
  if (!emitSocket('send_message', { solicitudId: selectedConversation.solicitudId, toUserId, mensaje: text })){
    await showErrorModal('No se pudo enviar el mensaje. Intenta nuevamente m��s tarde.');
    return;
  }
  chatEls.input.value = '';
}

function handleTyping(){
  if (!selectedConversation) return;
  const toUserId = selectedConversation.counterpart?.id || selectedConversation.counterpartId;
  if (!toUserId) return;
  const now = Date.now();
  if (now - lastTypingEmission < 500) return;
  lastTypingEmission = now;
  emitSocket('typing', { solicitudId: selectedConversation.solicitudId, toUserId });
}

async function openCounterpartProfile(){
  if (!selectedConversation) return;
  try{
    const data = await ensureCounterpartData(selectedConversation);
    if (data) await showChatProfileModal(data);
  }catch(e){
    await showErrorModal(e.message);
  }
}

async function ensureCounterpartData(conv){
  if (!conv) return null;
  if (conv.counterpart && (conv.counterpart.correo || conv.counterpart.telefono)){
    if (selectedConversation && conv.solicitudId === selectedConversation.solicitudId){
      setChatPartnerDisplay(conv.counterpart);
    }
    return conv.counterpart;
  }
  const id = conv.counterpart?.id || conv.counterpartId;
  if (!id) return conv.counterpart || null;
  const info = await api(`/api/users/${id}`);
  conv.counterpart = { ...(conv.counterpart || {}), ...info };
  if (selectedConversation && conv.solicitudId === selectedConversation.solicitudId){
    setChatPartnerDisplay(conv.counterpart);
  }
  return conv.counterpart;
}

function showChatProfileModal(info = {}){
  return new Promise(resolve=>{
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    const card = document.createElement('div');
    card.className = 'modal-card';
    const title = document.createElement('h3');
    title.textContent = 'Perfil del usuario';
    const avatar = document.createElement('img');
    avatar.src = info.foto_perfil || '/img/placeholder.svg';
    avatar.alt = 'Foto de perfil';
    avatar.className = 'chat-profile-avatar';
    const details = document.createElement('div');
    details.className = 'chat-profile-details';
    const name = document.createElement('p');
    name.className = 'profile-line name';
    name.textContent = formatPersonName(info);
    const email = document.createElement('p');
    email.textContent = info.correo ? `Correo: ${info.correo}` : '';
    const phone = document.createElement('p');
    phone.textContent = info.telefono ? `Teléfono: ${info.telefono}` : '';
    const address = document.createElement('p');
    address.textContent = info.direccion ? `Dirección: ${info.direccion}` : '';
    const rating = document.createElement('p');
    rating.textContent = typeof info.reputacion !== 'undefined' ? `Reputación: ${Number(info.reputacion || 0).toFixed(1)}` : '';
    [name, email, phone, address, rating].forEach(el => { if (el.textContent) details.appendChild(el); });
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm btn-primary';
    closeBtn.textContent = 'Cerrar';
    actions.appendChild(closeBtn);
    card.append(title, avatar, details, actions);
    overlay.appendChild(card);
    const close = ()=>{
      overlay.classList.remove('show');
      overlay.remove();
      resolve();
    };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  });
}

function joinChatRoom(solicitudId){
  if (!solicitudId) return;
  if (!joinedSolicitudes.has(solicitudId)){
    joinedSolicitudes.add(solicitudId);
  }
  if (socketAuthenticated){
    emitSocket('join_solicitud', solicitudId);
  }
}

function renderPerfil(u){
  const avatar = u.foto_perfil || '/img/placeholder.svg';
  const rolLabel = u.rol === 'adulto_mayor' ? 'Adulto mayor' : 'Voluntario';
  perfil.innerHTML = `
    <img src="${avatar}" alt="perfil" />
    <div class="profile-info">
      <p class="profile-line name">${u.nombre || ''}</p>
      <p class="profile-line email">${u.correo || ''}</p>
      <p class="profile-line role">${rolLabel}</p>
      <p class="profile-line rating">&#9733; ${Number(u.reputacion||0).toFixed(1)}</p>
    </div>
  `;

  updateSectionTitle(document.querySelector('[data-view].active')?.dataset.view || 'view-solicitud');

  document.querySelectorAll('[data-view]').forEach(btn=>{
    const label = rolLabel === 'Adulto mayor' ? btn.dataset.labelAm : btn.dataset.labelVol;
    if (label) btn.textContent = label;
  });
}

async function loadPerfil(){
  await ensureValidAuthOrRedirect();
  const me = await api('/api/auth/me');
  setUser(me);
  user = me;
  renderPerfil(me);
  const main = document.getElementById('dashboardMain');
  if (main) main.style.display = '';
  const solicitudCard = document.getElementById('solicitudFormCard');
  const filtrosCard = document.getElementById('filtrosCard');
  const placeholder = document.getElementById('solicitudPlaceholder');
  const misOfertasWrapper = document.getElementById('misOfertasCard');
  if (misOfertasWrapper) misOfertasWrapper.style.display = 'none';

  if (me.rol === 'adulto_mayor'){
    if (solicitudCard) solicitudCard.style.display = 'block';
    if (filtrosCard) filtrosCard.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    if (volSolicitudesCard) volSolicitudesCard.style.display = 'none';
    if (solicitudesCard) solicitudesCard.style.display = 'block';
    setupSolicitudForm();
    if (tituloLista) tituloLista.textContent = 'Activas';
    await loadMisSolicitudesSplit();
    showView('view-solicitud');
  } else {
    volunteerFilterParams = {};
    if (solicitudCard) solicitudCard.style.display = 'none';
    if (filtrosCard) filtrosCard.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    if (solicitudesCard) solicitudesCard.style.display = 'none';
    if (volSolicitudesCard) volSolicitudesCard.style.display = 'block';
    setupFiltroForm();
    await loadSolicitudes({}, { target: listaVoluntario, emptyIndicator: document.getElementById('volSolicitudesEmpty') });
    if (misOfertasWrapper) misOfertasWrapper.style.display = 'block';
    await loadMisOfertas();
    const finCard = document.getElementById('finalizadasCard');
    if (finCard) finCard.style.display = 'block';
    await loadVolFinalizadas();
    showView('view-listas');
  }

  const editButton = document.getElementById('editarPerfilBtn');
  if (editButton) editButton.onclick = ()=> openEditProfileForm(me);

  loadChatConversations();
}

async function loadSolicitudes(params, opts = {}){
  params = params || {};
  const target = opts.target || lista;
  const emptyIndicator = opts.emptyIndicator;
  if (!target) return;
  const qs = new URLSearchParams(params).toString();
  const data = await api('/api/solicitudes' + (qs?'?'+qs:''));
  target.innerHTML = '';
  if (!data.length && emptyIndicator){
    emptyIndicator.hidden = false;
  } else if (emptyIndicator){
    emptyIndicator.hidden = true;
  }
  data.forEach(item => {
    const el = document.createElement('div');
    el.className = 'card p-3 mb-2';
    el.id = `sol-${item.id}`;
    el.innerHTML = `
      <div><strong>${item.tipo_ayuda}</strong> • ${item.descripcion}</div>
      <div style="opacity:.8;font-size:12px">${item.direccion || ''}</div>
      ${item.cita_fecha ? `<div style='font-size:12px;opacity:.8'>Cita: ${new Date(item.cita_fecha).toLocaleString()} • ${item.cita_lugar||''}</div>` : ''}
      <div style="font-size:12px;opacity:.8">Estado: ${item.estado}</div>
      <div class="actions"></div>
    `;
    const actions = el.querySelector('.actions');
    actions.classList.add('d-flex','gap-2','mt-2');
    if (user.rol === 'voluntario'){
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-success';
      btn.textContent = 'Ofrecer ayuda';
      btn.onclick = async ()=>{
        const input = await requestTextInput({
          title: 'Ofrecer ayuda',
          message: 'Mensaje para el Adulto Mayor (opcional)',
          multiline: true
        });
        if (input === null || typeof input === 'undefined') return;
        const mensaje = input || '';
        try{
          await api(`/api/ofertas/${item.id}`, { method:'POST', data:{ mensaje } });
          await showInfoModal('Oferta enviada', 'Listo');
        }catch(e){
          await showErrorModal(e.message);
        }
      };
      actions.appendChild(btn);
    } else {
      // Adulto Mayor
      if (item.estado === 'pendiente'){
        const verBtn = document.createElement('button');
        verBtn.className = 'btn btn-sm btn-outline-light';
        verBtn.textContent = 'Ver ofertas';
        verBtn.onclick = ()=> verOfertas(item.id, item.estado);
        actions.appendChild(verBtn);
      }
      if (item.estado === 'en_proceso'){
        // Indicador de voluntario asignado
        const indicator = document.createElement('div');
        indicator.className = 'text-success small mt-1';
        indicator.textContent = 'Voluntario asignado';
        el.insertBefore(indicator, actions);

        const chatBtn = document.createElement('button');
        chatBtn.className = 'btn btn-sm btn-secondary';
        chatBtn.textContent = 'Chat';
        chatBtn.onclick = ()=> openDashboardChat(item.id);
        actions.appendChild(chatBtn);

        const coordBtn = document.createElement('button');
        coordBtn.className = 'btn btn-sm btn-info';
        coordBtn.textContent = 'Agendar cita';
        coordBtn.onclick = ()=> coordinarCita(item.id);
        actions.appendChild(coordBtn);

        const finBtn = document.createElement('button');
        finBtn.className = 'btn btn-sm btn-warning';
        finBtn.textContent = 'Marcar finalizada';
        finBtn.onclick = async ()=>{
          const ok = uiModals.confirm
            ? await uiModals.confirm({ title:'Finalizar solicitud', message:'?Confirmas que el servicio fue finalizado?', confirmText:'Finalizar' })
            : true;
          if (!ok) return;
        const calificacion = await requestRatingDialog({ title:'Calificar voluntario', confirmText:'Enviar' });
        if (!calificacion) return;
        try{
          await api(`/api/solicitudes/${item.id}/estado`, { method:'PUT', data:{ estado:'finalizada' } });
          try{
            await api(`/api/Calificaciones/${item.id}`, { method:'POST', data:{ puntuacion: calificacion.puntuacion, comentario: calificacion.comentario } });
            await showInfoModal('¡Gracias por calificar!', 'Listo');
          }catch(e){
            await showErrorModal('Finalizado, pero no se pudo guardar la calificacion: ' + e.message);
          }
          await loadMisSolicitudesSplit();
        }catch(e){
          await showErrorModal(e.message);
        }
        };
        actions.appendChild(finBtn);
      }
    }
    target.appendChild(el);
  });
}

async function loadMisOfertas(target){
  const cont = target || document.getElementById('misOfertas');
  if (!cont) return;
  cont.innerHTML = '';
  const ofertas = await api('/api/ofertas/mias');
  if (!ofertas.length){
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Aún no tienes ofertas activas.';
    cont.appendChild(empty);
    return;
  }
  ofertas.forEach(o=>{
    const el = document.createElement('div');
    el.className = 'card p-3 mb-2';
    el.innerHTML = `
      <div><strong>Solicitud #${o.id_solicitud}</strong> - ${o.descripcion}</div>
      <div class='text-secondary small'>Estado oferta: ${o.estado}  Estado solicitud: ${o.estado_solicitud}</div>
    `;
    if (o.estado === 'aceptada'){
      if (o.estado_solicitud === 'finalizada') return;
      const actions = document.createElement('div');
      actions.className = 'actions d-flex gap-2 mt-2';
      const chatBtn = document.createElement('button');
      chatBtn.className = 'btn btn-sm btn-secondary';
      chatBtn.textContent = 'Chat';
      const chatEnabled = o.estado_solicitud === 'en_proceso';
      chatBtn.disabled = !chatEnabled;
      if (chatEnabled){
        chatBtn.onclick = ()=> openDashboardChat(o.id_solicitud);
      } else {
        chatBtn.title = 'El chat se habilita cuando la solicitud es aceptada.';
      }
      const coordBtn = document.createElement('button');
      coordBtn.className = 'btn btn-sm btn-info';
      coordBtn.textContent = 'Agendar cita';
      coordBtn.onclick = ()=> coordinarCita(o.id_solicitud);
      actions.append(coordBtn, chatBtn);
      el.appendChild(actions);
    }
    cont.appendChild(el);
  });
}

// Secci�n de finalizadas para Voluntario
async function loadVolFinalizadas(){
  const list = document.getElementById('listaFinalizadas');
  if (!list) return;
  list.innerHTML = '';
  const ofertas = await api('/api/ofertas/mias');
  ofertas.filter(o => o.estado_solicitud === 'finalizada')
    .forEach(o => {
      const card = document.createElement('div');
      card.className = 'card p-3 mb-2';
      card.innerHTML = `<div><strong>Solicitud #${o.id_solicitud}</strong> • ${o.descripcion}</div>
                        <div class='text-secondary small mb-2'>Finalizada</div>
                        <div class='actions d-flex gap-2'></div>`;
      const actions = card.querySelector('.actions');
      if (o.calificado_por_mi > 0 || hasRatedLocal(o.id_solicitud)){
        const done = document.createElement('span');
        done.className = 'text-success small';
        done.textContent = 'Calificado ?';
        actions.appendChild(done);
      } else {
        const calBtn = document.createElement('button');
        calBtn.className = 'btn btn-sm btn-success';
        calBtn.textContent = 'Calificar A.M.';
        calBtn.onclick = async ()=>{
          const feedback = await requestRatingDialog({ title:'Calificar Adulto Mayor', confirmText:'Enviar' });
          if (!feedback) return;
          try {
            calBtn.disabled = true;
            await api(`/api/Calificaciones/${o.id_solicitud}`, { method:'POST', data:{ puntuacion: feedback.puntuacion, comentario: feedback.comentario } });
            await showInfoModal('¡Gracias por calificar!', 'Listo');
            calBtn.remove();
            const done = document.createElement('span');
            done.className = 'text-success small';
            done.textContent = 'Calificado ?';
            actions.appendChild(done);
          } catch(e){
            calBtn.disabled = false;
            await showErrorModal(e.message);
          }
        };
        actions.appendChild(calBtn);
      }
      list.appendChild(card);
    });
}

async function verOfertas(solicitudId, estadoSol){
  // Evitar duplicar contenedores al presionar varias veces
  const existing = document.getElementById(`ofertas-${solicitudId}`);
  if (existing){ existing.scrollIntoView({ behavior:'smooth', block:'center' }); return; }
  const ofertas = await api(`/api/ofertas/solicitud/${solicitudId}`);
  const container = document.createElement('div');
  container.id = `ofertas-${solicitudId}`;
  container.className = 'card p-3 mb-2';
  container.innerHTML = `<h3 class='h5'>Ofertas (${ofertas.length})</h3>`;
  ofertas.forEach(o=>{
    const row = document.createElement('div');
    row.className = 'card p-3 mb-2';
    row.innerHTML = `<div><strong>${o.nombre_voluntario}</strong> • ? ${Number(o.reputacion||0).toFixed(1)}</div>
                     <div class='text-secondary small'>${o.mensaje||''}</div>
                     <div class='text-secondary small'>Estado: ${o.estado}</div>`;
    if (estadoSol === 'pendiente' && o.estado === 'pendiente'){
      const actions = document.createElement('div');
      actions.className = 'actions d-flex gap-2 mt-2';
      const aceptar = document.createElement('button');
      aceptar.className = 'btn btn-sm btn-success';
      aceptar.textContent = 'Aceptar';
      aceptar.onclick = async ()=>{
        try{
          await api(`/api/ofertas/${o.id}`, { method:'PUT', data:{ estado:'aceptada' } });
          await showInfoModal('Oferta aceptada', 'Listo');
          location.reload();
        }catch(e){
          await showErrorModal(e.message);
        }
      };
      const rechazar = document.createElement('button');
      rechazar.className = 'btn btn-sm btn-outline-danger';
      rechazar.textContent = 'Rechazar';
      rechazar.onclick = async ()=>{
        try{
          await api(`/api/ofertas/${o.id}`, { method:'PUT', data:{ estado:'rechazada' } });
          await showInfoModal('Oferta rechazada', 'Listo');
          location.reload();
        }catch(e){
          await showErrorModal(e.message);
        }
      };
      actions.appendChild(aceptar); actions.appendChild(rechazar);
      row.appendChild(actions);
    }
    container.appendChild(row);
  });
  // Insertar justo debajo del elemento de la solicitud
  const holder = document.getElementById(`sol-${solicitudId}`);
  if (holder && holder.parentNode){
    holder.parentNode.insertBefore(container, holder.nextSibling);
  } else {
    lista.prepend(container);
  }
}

// Nueva solicitud (AM)
const solicitudForm = document.getElementById('solicitudForm');
solicitudForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(solicitudForm);
  const data = Object.fromEntries(fd.entries());
  try{
    await api('/api/solicitudes', { method:'POST', data });
    solicitudForm.reset();
    await loadMisSolicitudesSplit();
  }catch(err){
    await showErrorModal(err.message);
  }
});

// Filtros (Voluntario)
const filtrosForm = document.getElementById('filtrosForm');
filtrosForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(filtrosForm);
  const params = Object.fromEntries(fd.entries());
  const currentUser = getUser();
  if (currentUser?.rol === 'voluntario'){
    volunteerFilterParams = params;
    await loadSolicitudes(params, { target: listaVoluntario, emptyIndicator: document.getElementById('volSolicitudesEmpty') });
  } else {
    await loadSolicitudes(params);
  }
});

// Socket notificaciones
const socket = window.createSocketConnection ? window.createSocketConnection() : null;
function emitSocket(event, ...args){
  if (!socket) return false;
  socket.emit(event, ...args);
  return true;
}

if (socket){
  socket.on('connect', ()=>{
    socketAuthenticated = false;
    emitSocket('authenticate', getToken());
  });
  socket.on('auth_ok', ()=>{
    socketAuthenticated = true;
    joinedSolicitudes.forEach(id => emitSocket('join_solicitud', id));
  });
  socket.on('disconnect', ()=>{ socketAuthenticated = false; });
  socket.on('notify', async (n)=>{
    if (n?.type === 'cita_actualizada'){
      await showInfoModal('Cita actualizada para la solicitud #' + n.solicitudId);
    } else if (n?.type === 'reminder'){
      const mins = Math.round(n.inMs/60000);
      await showInfoModal(`Recordatorio: tienes una cita en ~${mins} minutos (solicitud #${n.solicitudId})`, 'Recordatorio');
    } else if (n?.type === 'solicitud_finalizada'){
      await showInfoModal('La solicitud #' + n.solicitudId + ' ha sido finalizada.');
      if (user?.rol === 'voluntario'){
        await loadSolicitudes(volunteerFilterParams || {}, { target: listaVoluntario, emptyIndicator: document.getElementById('volSolicitudesEmpty') });
        await loadMisOfertas();
        await loadVolFinalizadas();
      } else {
        await loadMisSolicitudesSplit();
      }
      loadChatConversations();
    } else if (n?.type === 'oferta_aceptada' || n?.type === 'oferta_rechazada'){
      if (user?.rol === 'voluntario'){
        await loadSolicitudes(volunteerFilterParams || {}, { target: listaVoluntario, emptyIndicator: document.getElementById('volSolicitudesEmpty') });
        await loadMisOfertas();
        await loadVolFinalizadas();
      }
      loadChatConversations();
    } else if (n?.type === 'message'){
      if (!selectedConversation || String(selectedConversation.solicitudId) !== String(n.solicitudId)){
        loadChatConversations();
      }
    } else {
      console.log('Notificación:', n);
    }
  });

  socket.on('new_message', (m)=>{
    const sid = Number(m.id_solicitud);
    const conv = chatConversations.find(c => Number(c.solicitudId) === sid);
    if (!conv){
      loadChatConversations();
      return;
    }
    conv.lastMessage = m.mensaje;
    conv.lastMessageAt = m.fecha_envio;
    conv.lastMessageFrom = m.id_emisor;
    if (selectedConversation && Number(selectedConversation.solicitudId) === sid){
      selectedConversation.messages = selectedConversation.messages || [];
      selectedConversation.messages.push(m);
      if (chatEls.box){
        addChatMessage(m);
        chatEls.box.scrollTop = chatEls.box.scrollHeight;
      }
      if (m.id_receptor === (user?.id)){
        emitSocket('mark_read', { messageId: m.id, solicitudId: sid });
      }
    } else {
      conv.unreadCount = (conv.unreadCount || 0) + 1;
    }
    renderChatList();
  });
  socket.on('typing', ({ solicitudId: sid, fromUserId })=>{
    if (!selectedConversation || Number(selectedConversation.solicitudId) !== Number(sid)) return;
    if (fromUserId === (user?.id)) return;
    if (chatEls.typing){
      chatEls.typing.textContent = 'Escribiendo…';
      clearTimeout(chatTypingTimeout);
      chatTypingTimeout = setTimeout(()=> chatEls.typing.textContent = '', 1000);
    }
  });
  socket.on('read', (info)=>{
    if (!selectedConversation || Number(selectedConversation.solicitudId) !== Number(info.solicitudId)) return;
    const target = chatEls.box?.querySelector(`[data-id="${info.id}"] .msg-check`);
    if (target) target.classList.add('read');
  });
} else {
  console.warn('No se pudo inicializar Socket.io; las notificaciones en tiempo real estarán deshabilitadas.');
}

loadPerfil();

// Helpers UI mejorados
function populateTipos(select, includeAll=false){
  if (!select) return;
  const tipos = ['Compras','Acompañamiento','Transporte','Tareas domésticas','Tecnología','Salud'];
  select.innerHTML = '';
  if (includeAll){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Todos';
    select.appendChild(opt);
  }
  tipos.forEach(t=>{
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t; select.appendChild(opt);
  });
}

function setupSolicitudForm(){
  populateTipos(document.getElementById('tipo_ayuda_select'));
}

function setupFiltroForm(){
  populateTipos(document.getElementById('filtro_tipo'), true);
}

async function coordinarCita(solicitudId){
  const data = await requestScheduleData();
  if (!data) return;
  try{
    await api(`/api/solicitudes/${solicitudId}/cita`, { method:'PUT', data:{ cita_fecha: (data.fecha || data.date || '').replace('T',' '), cita_lugar: data.lugar || data.place || '' } });
    await showInfoModal('Cita actualizada', 'Listo');
    const currentUser = getUser();
    if (currentUser?.rol === 'adulto_mayor'){
      await loadMisSolicitudesSplit();
    } else {
      await loadSolicitudes(volunteerFilterParams || {}, { target: listaVoluntario, emptyIndicator: document.getElementById('volSolicitudesEmpty') });
      await loadMisOfertas();
      await loadVolFinalizadas();
    }
  }catch(e){
    await showErrorModal(e.message);
  }
}

async function loadMisSolicitudesSplit(){
  const data = await api('/api/solicitudes?mine=1');
  lista.innerHTML = '';
  data.filter(s => s.estado !== 'finalizada').forEach(s => {
    const el = document.createElement('div');
    el.className = 'item';
    el.id = `sol-${s.id}`;
    el.innerHTML = `
      <div><strong>${s.tipo_ayuda}</strong> • ${s.descripcion}</div>
      <div style="opacity:.8;font-size:12px">${s.direccion || ''}</div>
      ${s.cita_fecha ? `<div style='font-size:12px;opacity:.8'>Cita: ${new Date(s.cita_fecha).toLocaleString()} • ${s.cita_lugar||''}</div>` : ''}
      <div style="font-size:12px;opacity:.8">Estado: ${s.estado}</div>
      <div class="actions"></div>
    `;
    const actions = el.querySelector('.actions');
    if (s.estado === 'pendiente'){
      const verBtn = document.createElement('button');
      verBtn.textContent = 'Ver ofertas';
      verBtn.onclick = ()=> verOfertas(s.id, s.estado);
      actions.appendChild(verBtn);
    }
    if (s.estado === 'en_proceso'){
      const indicator = document.createElement('div');
      indicator.className = 'text-success small mt-1';
      indicator.textContent = 'Voluntario asignado';
      el.insertBefore(indicator, actions);
      const chatBtn = document.createElement('button');
      chatBtn.textContent = 'Chat';
      chatBtn.onclick = ()=> openDashboardChat(s.id);
      actions.appendChild(chatBtn);
      const coordBtn = document.createElement('button');
      coordBtn.textContent = 'Agendar cita';
      coordBtn.onclick = ()=> coordinarCita(s.id);
      actions.appendChild(coordBtn);
      const finBtn = document.createElement('button');
      finBtn.textContent = 'Marcar finalizada';
      finBtn.onclick = async ()=>{
        const ok = uiModals.confirm
          ? await uiModals.confirm({ title:'Finalizar solicitud', message:'?Confirmas que el servicio fue finalizado?', confirmText:'Finalizar' })
          : true;
        if (!ok) return;
        const feedback = await requestRatingDialog({ title:'Calificar voluntario', confirmText:'Enviar' });
        if (!feedback) return;
        try{
          await api(`/api/solicitudes/${s.id}/estado`, { method:'PUT', data:{ estado:'finalizada' } });
          try{
            await api(`/api/Calificaciones/${s.id}`, { method:'POST', data:{ puntuacion: feedback.puntuacion, comentario: feedback.comentario } });
            await showInfoModal('¡Gracias por calificar!', 'Listo');
          }catch(err){
            await showErrorModal('Finalizado, pero no se pudo guardar la calificacion: ' + err.message);
          }
          await loadMisSolicitudesSplit();
        }catch(err){
          await showErrorModal(err.message);
        }
      };
      actions.appendChild(finBtn);
    }
    lista.appendChild(el);
  });
  // Finalizadas
// Finalizadas
  const finCard = document.getElementById('finalizadasCard');
  const finList = document.getElementById('listaFinalizadas');
  finCard.style.display = 'block';
  finList.innerHTML = '';
  data.filter(s=>s.estado === 'finalizada').forEach(s=>{
    const el = document.createElement('div');
    el.className = 'card p-3 mb-2';
    el.innerHTML = `
      <div><strong>${s.tipo_ayuda}</strong> • ${s.descripcion}</div>
      <div class='text-secondary small'>${s.direccion || ''}</div>
      ${s.cita_fecha ? `<div class='text-secondary small'>Cita: ${new Date(s.cita_fecha).toLocaleString()} • ${s.cita_lugar||''}</div>` : ''}
      <div class='text-secondary small mb-2'>Estado: ${s.estado}</div>
      <div class='actions d-flex gap-2'></div>
    `;
    const actions = el.querySelector('.actions');
    if (s.calificado_por_mi > 0 || hasAmRatedLocal(s.id)){
      const done = document.createElement('span');
      done.className = 'text-success small';
      done.textContent = 'Calificado ?';
      actions.appendChild(done);
    } else {
      const calBtn = document.createElement('button');
      calBtn.className = 'btn btn-sm btn-success';
      calBtn.textContent = 'Calificar voluntario';
      calBtn.onclick = async ()=>{
        const feedback = await requestRatingDialog({ title:'Calificar voluntario', confirmText:'Enviar' });
        if (!feedback) return;
        try {
          calBtn.disabled = true;
          await api(`/api/Calificaciones/${s.id}`, { method:'POST', data:{ puntuacion: feedback.puntuacion, comentario: feedback.comentario } });
          await showInfoModal('¡Gracias por calificar!', 'Listo');
          setAmRatedLocal(s.id);
          await loadMisSolicitudesSplit();
        } catch(e){
          calBtn.disabled = false;
          await showErrorModal(e.message);
        }
      };
      actions.appendChild(calBtn);
    }
    finList.appendChild(el);
  });
}

// Editar perfil
const editProfileForm = document.getElementById('editProfileForm');
const editCancelBtn = document.getElementById('editCancelBtn');
editProfileForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const nombre = document.getElementById('editNombre').value.trim();
  const apellido = (document.getElementById('editApellido')?.value || '').trim();
  const edad = document.getElementById('editEdad')?.value || '';
  const telefono = (document.getElementById('editTelefono')?.value || '').trim();
  const documentoIdent = (document.getElementById('editDocumento')?.value || '').trim();
  const direccion = (document.getElementById('editDireccion')?.value || '').trim();
  const pwd = document.getElementById('editPassword').value;
  const foto = document.getElementById('editFoto').files[0];
  const fd = new FormData();
  fd.append('nombre', nombre);
  fd.append('apellido', apellido);
  fd.append('edad', edad);
  fd.append('telefono', telefono);
  if (documentoIdent) fd.append('documento_identificacion', parseInt(documentoIdent, 10));
  // Validaciones mínimas en cliente
  const me = getUser();
  const edadNum = parseInt(edad||'0',10);
  if (!edadNum || (me?.rol === 'adulto_mayor' ? edadNum < 60 : edadNum < 18)){
    await showInfoModal(me?.rol === 'adulto_mayor' ? 'Edad mínima 60' : 'Edad mínima 18', 'Validación');
    return;
  }
  if (!/^\d{10}$/.test(telefono)) {
    await showInfoModal('El telefono debe tener exactamente 10 digitos', 'Validacion');
    return;
  }
  if (documentoIdent && !/^\d+$/.test(documentoIdent)) {
    await showInfoModal('El documento debe contener solo numeros', 'Validacion');
    return;
  }
  if (direccion) fd.append('direccion', direccion);
  if (pwd){
    fd.append('contrasena', pwd);
  }
  if (foto) fd.append('foto_perfil', foto);

  const hasProfileChanges = (() => {
    if (!me) return true;
    const normalize = (val)=> (val ?? '');
    const baseNombre = normalize(me.nombre);
    const baseApellido = normalize(me.apellido);
    const baseEdad = me.edad != null ? String(me.edad) : '';
    const baseTelefono = normalize(me.telefono);
    const baseDocumento = me.documento_identificacion != null ? String(me.documento_identificacion) : '';
    const baseDireccion = me.rol === 'adulto_mayor' ? normalize(me.direccion) : '';
    return (
      nombre !== baseNombre ||
      apellido !== baseApellido ||
      edad !== baseEdad ||
      telefono !== baseTelefono ||
      documentoIdent !== baseDocumento ||
      (me.rol === 'adulto_mayor' && direccion !== baseDireccion) ||
      !!pwd ||
      !!foto
    );
  })();

  if (!hasProfileChanges){
    await showInfoModal('No detectamos cambios en tu perfil. Modifica algún campo antes de guardar.', 'Sin cambios');
    return;
  }

  try{
    const updated = await api('/api/users/me', { method:'PUT', formData: fd });
    setUser(updated);
    renderPerfil(updated);
    editProfileForm.hidden = true;
    await showInfoModal('Cambios realizados con éxito', 'Perfil actualizado');
  } catch(err){
    await showErrorModal(err.message);
  }
});

editCancelBtn?.addEventListener('click', ()=>{
  editProfileForm.hidden = true;
});

// Persistencia local para Calificaciones del voluntario (fallback)
function setRatedLocal(solicitudId){ try{ localStorage.setItem('rated_'+solicitudId, '1'); }catch{} }
function hasRatedLocal(solicitudId){ try{ return localStorage.getItem('rated_'+solicitudId) === '1'; }catch{ return false } }
function setAmRatedLocal(solicitudId){ try{ localStorage.setItem('am_rated_'+solicitudId, '1'); }catch{} }
function hasAmRatedLocal(solicitudId){ try{ return localStorage.getItem('am_rated_'+solicitudId) === '1'; }catch{ return false } }

function setupFiltroForm(){
  populateTipos(document.getElementById('filtro_tipo'), true);
}

function openEditProfileForm(userData){
  const me = userData || getUser();
  document.getElementById('editNombre').value = me?.nombre || '';
  const apInput = document.getElementById('editApellido'); if (apInput) apInput.value = me?.apellido || '';
  const edadInput = document.getElementById('editEdad'); if (edadInput) edadInput.value = me?.edad || '';
  const telInput = document.getElementById('editTelefono'); if (telInput) telInput.value = me?.telefono || '';
  const docInput = document.getElementById('editDocumento'); if (docInput) docInput.value = me?.documento_identificacion || '';
  const dirGroup = document.getElementById('editDireccionGroup');
  const dirInput = document.getElementById('editDireccion');
  if (dirGroup) dirGroup.hidden = me?.rol !== 'adulto_mayor';
  if (dirInput) dirInput.value = me?.direccion || '';
  document.getElementById('editPassword').value = '';
  const form = document.getElementById('editProfileForm');
  if (form){
    form.hidden = false;
    form.scrollIntoView({ behavior:'smooth', block:'start' });
  }
}



