// routes/login.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { sql, pool, poolConnect } = require('../db/connection');

// A dónde enviar por rol
const REDIRECTS = {
  admin:   '/reportes',
  barbero: '/citas',
  cliente: '/servicios/menu',
};

// Sanitiza el parámetro next para evitar open-redirect
function safeNext(url = '') {
  if (!url) return '';
  try {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return '';
    if (!url.startsWith('/')) return '';
    if (url.startsWith('/login')) return '';
    return url;
  } catch {
    return '';
  }
}

// GET /login
router.get('/', (req, res) => {
  if (req.session?.usuario) {
    const to = REDIRECTS[req.session.rol] || '/';
    return res.redirect(to);
  }

  const next = safeNext(req.query.next || '');
  const toast = (req.query.out === '1')
    ? { type: 'success', message: 'Sesión cerrada correctamente.' }
    : undefined;

  res.render('login', {
    error: undefined,
    toast,
    values: {},
    next,
    titulo: 'Iniciar Sesión',
    hideNav: true,
  });
});

// POST /login
router.post('/', async (req, res) => {
  const { nombreUsuario = '', contrasena = '', recordarme } = req.body;
  const next = safeNext(req.query.next || req.body.next || '');

  const user = String(nombreUsuario).trim();
  const pass = String(contrasena);

  if (!user || !pass) {
    return res.render('login', {
      toast: { type: 'danger', message: 'Ingrese usuario y contraseña.' },
      values: { nombreUsuario: user, recordarme: !!recordarme },
      next,
      titulo: 'Iniciar Sesión',
      hideNav: true,
    });
  }

  try {
    await poolConnect;

    const result = await pool.request()
      .input('nombreUsuario', sql.VarChar(50), user)
      .query(`
        SELECT UsuarioID, NombreUsuario, Contrasena, Rol
        FROM Usuarios
        WHERE NombreUsuario = @nombreUsuario
      `);

    const usuario = result.recordset[0];

    if (!usuario) {
      return res.render('login', {
        toast: { type: 'danger', message: 'Usuario o contraseña incorrectos' },
        values: { nombreUsuario: user, recordarme: !!recordarme },
        next,
        titulo: 'Iniciar Sesión',
        hideNav: true,
      });
    }

    const hash = Buffer.isBuffer(usuario.Contrasena)
      ? usuario.Contrasena.toString()
      : String(usuario.Contrasena);

    const valid = await bcrypt.compare(pass, hash);
    if (!valid) {
      return res.render('login', {
        toast: { type: 'danger', message: 'Usuario o contraseña incorrectos' },
        values: { nombreUsuario: user, recordarme: !!recordarme },
        next,
        titulo: 'Iniciar Sesión',
        hideNav: true,
      });
    }

    // Vincula IDs de dominio según el rol (usando UsuarioRegistro = NombreUsuario)
    let clienteId = null;
    let barberoId = null;

    if (usuario.Rol === 'cliente') {
      const r = await pool.request()
        .input('u', sql.VarChar(50), usuario.NombreUsuario)
        .query(`SELECT TOP 1 ClienteID FROM Clientes WHERE UsuarioRegistro = @u`);
      clienteId = r.recordset[0]?.ClienteID || null;

      if (!clienteId) {
        return res.render('login', {
          toast: { type: 'danger', message: 'Tu usuario no está vinculado a ningún cliente. Contacta al administrador.' },
          values: { nombreUsuario: user, recordarme: !!recordarme },
          next,
          titulo: 'Iniciar Sesión',
          hideNav: true,
        });
      }
    } else if (usuario.Rol === 'barbero') {
      const r = await pool.request()
        .input('u', sql.VarChar(50), usuario.NombreUsuario)
        .query(`SELECT TOP 1 BarberoID FROM Barberos WHERE UsuarioRegistro = @u`);
      barberoId = r.recordset[0]?.BarberoID || null;

      if (!barberoId) {
        return res.render('login', {
          toast: { type: 'danger', message: 'Tu usuario no está vinculado a ningún barbero. Contacta al administrador.' },
          values: { nombreUsuario: user, recordarme: !!recordarme },
          next,
          titulo: 'Iniciar Sesión',
          hideNav: true,
        });
      }
    }

    // ------ Sesión (guardar después de validar vínculos) ------
    req.session.usuario   = usuario.NombreUsuario;
    req.session.userId    = usuario.UsuarioID;
    req.session.rol       = usuario.Rol;
    req.session.clienteId = clienteId;  
    req.session.barberoId = barberoId;  

    // Recordarme (30 días) o sesión de navegador
    if (recordarme) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
    } else {
      req.session.cookie.expires = false;
    }

    // Opcional: actualizar último acceso
    try {
      await pool.request()
        .input('id', sql.VarChar(50), usuario.UsuarioID)
        .query(`UPDATE Usuarios SET UltimoAcceso = SYSDATETIME() WHERE UsuarioID = @id`);
    } catch (_) {}

    // Redirección
    if (next) return res.redirect(next);
    if (REDIRECTS[usuario.Rol]) return res.redirect(REDIRECTS[usuario.Rol]);

    return res.render('login', {
      toast: { type: 'danger', message: 'Rol no válido' },
      values: { nombreUsuario: user },
      next: '',
      titulo: 'Iniciar Sesión',
      hideNav: true,
    });

  } catch (err) {
    console.error('Error en login:', err);
    return res.render('login', {
      toast: { type: 'danger', message: 'Error al iniciar sesión' },
      values: { nombreUsuario: user },
      next,
      titulo: 'Iniciar Sesión',
      hideNav: true,
    });
  }
});

// GET /login/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login?out=1'));
});

module.exports = router;


