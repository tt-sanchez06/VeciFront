const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    const correo = (fd.get('correo') || '').trim();
    const contrasena = fd.get('contrasena') || '';
    try {
      const { token, user } = await api('/api/auth/login', { method: 'POST', data: { correo, contrasena } });
      setToken(token);
      setUser(user);
      window.location.href = '/dashboard.html';
    } catch (err) {
      const el = document.getElementById('loginError');
      if (el) el.textContent = err.message;
    }
  });
}

const registroForm = document.getElementById('registroForm');
const btnVol = document.getElementById('selVoluntario');
const btnAdulto = document.getElementById('selAdulto');
const rolInput = document.getElementById('rolInput');
const dirGroup = document.getElementById('direccionGroup');

function setRol(rol) {
  if (!rolInput || !registroForm) return;
  rolInput.value = rol;
  registroForm.style.display = '';
  if (dirGroup) dirGroup.style.display = rol === 'adulto_mayor' ? '' : 'none';
}

if (btnVol) btnVol.addEventListener('click', () => setRol('voluntario'));
if (btnAdulto) btnAdulto.addEventListener('click', () => setRol('adulto_mayor'));

if (registroForm) {
  registroForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rol = rolInput ? rolInput.value : '';
    const errEl = document.getElementById('registroError');
    if (!rol) {
      if (errEl) errEl.textContent = 'Selecciona cómo deseas registrarte';
      return;
    }
    if (rol === 'adulto_mayor') {
      const dirInput = registroForm.querySelector('input[name="direccion"]');
      if (!dirInput || !dirInput.value.trim()) {
        if (errEl) errEl.textContent = 'La dirección es obligatoria para Adulto Mayor';
        return;
      }
    }

    const edadVal = parseInt((registroForm.querySelector('input[name="edad"]')?.value || '').trim(), 10);
    if (!edadVal || (rol === 'adulto_mayor' ? edadVal < 60 : edadVal < 18)) {
      if (errEl) errEl.textContent = rol === 'adulto_mayor' ? 'Edad mínima 60' : 'Edad mínima 18';
      return;
    }
    const telVal = (registroForm.querySelector('input[name="telefono"]')?.value || '').trim();
    if (!/^\d{10}$/.test(telVal)) {
      if (errEl) errEl.textContent = 'El teléfono debe tener exactamente 10 dígitos';
      return;
    }
    const docVal = (registroForm.querySelector('input[name="documento_identificacion"]')?.value || '').trim();
    if (!/^\d+$/.test(docVal)) {
      if (errEl) errEl.textContent = 'El documento debe contener solo números';
      return;
    }

    const fd = new FormData(registroForm);
    try {
      const { token, user } = await api('/api/auth/register', { method: 'POST', formData: fd });
      setToken(token);
      setUser(user);
      window.location.href = '/dashboard.html';
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    }
  });
}
