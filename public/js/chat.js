requireAuth();
bindLogout();

const params = new URLSearchParams(location.search);
const solicitudId = params.get("solicitudId");

const mensajesEl = document.getElementById("mensajes");
const chatWithEl = document.getElementById("chatWith");
const chatWithAvatarEl = document.getElementById("chatWithAvatar");
const viewProfileBtn = document.getElementById("viewProfileBtn");
const form = document.getElementById("chatForm");
const input = document.getElementById("msgInput");

const me = getUser();
let toUserId = null;
let counterpartUser = null;

// ================================
//     CARGAR MENSAJES
// ================================
async function loadMessages() {
  const data = await api(`/chats/${solicitudId}`);

  toUserId = data.counterpartId || null;

  // Cargar info del usuario con quien se chatea
  if (toUserId && chatWithEl) {
    try {
      const u = await api(`/users/${toUserId}`);
      counterpartUser = u;

      const fullName = u?.nombre
        ? `${u.nombre}${u.apellido ? " " + u.apellido : ""}`
        : `Usuario #${toUserId}`;

      chatWithEl.textContent = fullName;
      chatWithAvatarEl.src = u?.foto_perfil || "/img/placeholder.svg";

    } catch (e) {
      chatWithEl.textContent = `Usuario #${toUserId}`;
      chatWithAvatarEl.src = "/img/placeholder.svg";
    }
  }

  // Mostrar mensajes
  mensajesEl.innerHTML = "";
  (data.messages || []).forEach(addMsg);
  mensajesEl.scrollTop = mensajesEl.scrollHeight;
}

// ================================
//     FORMATO DE HORA
// ================================
function formatTime(ts) {
  const d = new Date(ts || "");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ================================
//     PINTAR MENSAJE
// ================================
function addMsg(m) {
  const isMe = m.id_emisor === me.id;

  const div = document.createElement("div");
  div.className = "msg " + (isMe ? "me" : "other");
  div.dataset.id = m.id;

  const body = document.createElement("div");
  body.className = "msg-body";
  body.textContent = m.mensaje;

  const meta = document.createElement("div");
  meta.className = "msg-meta";

  const timeEl = document.createElement("span");
  timeEl.className = "msg-time";
  timeEl.textContent = formatTime(m.fecha_envio);

  meta.appendChild(timeEl);

  if (isMe) {
    const checkEl = document.createElement("span");
    checkEl.className = "msg-check" + (m.leido ? " read" : "");
    checkEl.textContent = "✓";
    meta.appendChild(checkEl);
  }

  div.appendChild(body);
  div.appendChild(meta);
  mensajesEl.appendChild(div);
}

// ================================
//     SOCKET.IO (RENDER + LOCAL)
// ================================
const socket = io(window.API_BASE, {
  transports: ["websocket"],
  reconnection: true,
});

// Autenticación + unión a la sala
socket.on("connect", () => {
  socket.emit("authenticate", getToken());
  socket.emit("join_solicitud", solicitudId);
});

// Nuevo mensaje recibido
socket.on("new_message", (m) => {
  if (String(m.id_solicitud) === String(solicitudId)) {
    addMsg(m);
    mensajesEl.scrollTop = mensajesEl.scrollHeight;

    if (m.id_receptor === me.id) {
      socket.emit("mark_read", { messageId: m.id, solicitudId });
    }
  }
});

// Actualizar mensaje como leído
socket.on("read", (info) => {
  const el = [...mensajesEl.children].find(
    (x) => x.dataset && String(x.dataset.id) === String(info.id)
  );

  if (el && el.classList.contains("me")) {
    const chk = el.querySelector(".msg-check");
    if (chk) chk.classList.add("read");
  }
});

// ================================
//     ESCRITURA “typing...”
// ================================
const typingEl = document.createElement("div");
typingEl.className = "chat-typing";
mensajesEl.parentElement.appendChild(typingEl);

let typingTimeout;

socket.on("typing", ({ solicitudId: sid, fromUserId }) => {
  if (String(sid) !== String(solicitudId) || fromUserId === me.id) return;
  typingEl.textContent = "Escribiendo…";
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => (typingEl.textContent = ""), 1000);
});

// ================================
//     ENVIAR MENSAJE
// ================================
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const texto = input.value.trim();
  if (!texto) return;

  if (!toUserId) {
    window.uiModals?.alert({
      title: "Chat",
      message: "No hay destinatario definido. Asegura que la oferta está aceptada.",
    });
    return;
  }

  socket.emit("send_message", {
    solicitudId,
    toUserId,
    mensaje: texto,
  });

  input.value = "";
});

// Emitir typing
let lastTyping = 0;
input.addEventListener("input", () => {
  const now = Date.now();
  if (toUserId && now - lastTyping > 500) {
    socket.emit("typing", { solicitudId, toUserId });
    lastTyping = now;
  }
});

// ================================
//     PERFIL DEL CONTACTO
// ================================
viewProfileBtn?.addEventListener("click", async () => {
  if (!counterpartUser && toUserId) {
    try {
      counterpartUser = await api(`/users/${toUserId}`);
    } catch {}
  }

  const u = counterpartUser || {};

  document.getElementById("profileName").textContent =
    u?.nombre
      ? `${u.nombre}${u.apellido ? " " + u.apellido : ""}`
      : `Usuario #${toUserId}`;

  document.getElementById("profileEmail").textContent = u?.correo || "";
  document.getElementById("profileExtra").textContent =
    u?.rol
      ? `Rol: ${u.rol}${u.telefono ? " · Tel: " + u.telefono : ""}`
      : "";

  document.getElementById("profileAvatar").src =
    u?.foto_perfil || "/img/placeholder.svg";

  const modalEl = document.getElementById("userProfileModal");

  if (window.bootstrap) {
    (bootstrap.Modal.getInstance(modalEl) ||
      new bootstrap.Modal(modalEl)).show();
  } else {
    modalEl.classList.add("show");
    modalEl.style.display = "block";
  }
});

// Cerrar modal
function hideUserProfileModal() {
  const modalEl = document.getElementById("userProfileModal");
  if (window.bootstrap) {
    bootstrap.Modal.getInstance(modalEl)?.hide();
  } else {
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
  }
}

document.getElementById("userProfileCloseBtn")?.addEventListener("click", hideUserProfileModal);
document.getElementById("userProfileCloseX")?.addEventListener("click", hideUserProfileModal);

// ================================
//     INICIALIZAR
// ================================
loadMessages();
