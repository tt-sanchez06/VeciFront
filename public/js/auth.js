// ==============================
//     LOGIN
// ==============================
const loginForm = document.getElementById('loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(loginForm);
    const correo = (fd.get('correo') || '').trim();
    const contrasena = fd.get('contrasena') || '';

    const errEl = document.getElementById('loginError');
    if (errEl) errEl.textContent = '';

    try {
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        data: { correo, contrasena }
      });

      setToken(token);
      setUser(user);

      window.location.href = '/dashboard.html';
    } catch (err) {
      if (errEl) errEl.textContent = err.message || "Error al iniciar sesión";
    }
  });
}


// ==============================
//     REGISTRO
// ==============================
const registroForm = document.getElementById('registroForm');
const btnVol = document.getElementById('selVoluntario');
const btnAdulto = document.getElementById('selAdulto');
const rolInput = document.getElementById('rolInput');
const dirGroup = document.getElementById('direccionGroup');

function setRol(rol) {
  if (!rolInput || !registroForm) return;
  rolInput.value = rol;
  registroForm.style.display = '';

  // Dirección SOLO para adulto mayor
  if (dirGroup) dirGroup.style.display = rol === 'adulto_mayor' ? '' : 'none';
}

if (btnVol) btnVol.addEventListener('click', () => setRol('voluntario'));
if (btnAdulto) btnAdulto.addEventListener('click', () => setRol('adulto_mayor'));

if (registroForm) {
  registroForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const rol = rolInput?.value || '';
    const errEl = document.getElementById('registroError');
    if (errEl) errEl.textContent = '';

    // Validación: seleccionar rol
    if (!rol) {
      errEl.textContent = 'Selecciona cómo deseas registrarte';
      return;
    }

    // Validación dirección adulto mayor
    if (rol === 'adulto_mayor') {
      const dirInput = registroForm.querySelector('input[name="direccion"]');
      if (!dirInput?.value.trim()) {
        errEl.textContent = 'La dirección es obligatoria para Adulto Mayor';
        return;
      }
    }

    // Validación edad
    const edadVal = parseInt(
      (registroForm.querySelector('input[name="edad"]')?.value || '').trim(),
      10
    );

    if (!edadVal || (rol === 'adulto_mayor' ? edadVal < 60 : edadVal < 18)) {
      errEl.textContent = rol === 'adulto_mayor'
        ? 'Edad mínima 60'
        : 'Edad mínima 18';
      return;
    }

    // Validación teléfono
    const telVal = (registroForm.querySelector('input[name="telefono"]')?.value || '').trim();
    if (!/^\d{10}$/.test(telVal)) {
      errEl.textContent = 'El teléfono debe tener exactamente 10 dígitos';
      return;
    }

    // Validación documento
    const docVal = (registroForm.querySelector('input[name="documento_identificacion"]')?.value || '').trim();
    if (!/^\d+$/.test(docVal)) {
      errEl.textContent = 'El documento debe contener solo números';
      return;
    }

    // Enviar datos con FormData
    const fd = new FormData(registroForm);

    try {
      const { token, user } = await api('/auth/register', {
        method: 'POST',
        formData: fd
      });

      setToken(token);
      setUser(user);

      window.location.href = '/dashboard.html';
    } catch (err) {
      errEl.textContent = err.message || "Error en el registro";
    }
  });
}
