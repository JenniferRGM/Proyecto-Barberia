// middlewares/auth.js

// Responder JSON cuando la petición es XHR/Fetch
function wantsJSON(req) {
  return req.xhr || (req.headers.accept || '').includes('application/json');
}

// Si no hay sesión → redirige a /login
function requireAuth(req, res, next) {
  if (req.session?.usuario) return next();
  const back = encodeURIComponent(req.originalUrl || '/');
  if (wantsJSON(req)) return res.status(401).json({ error: 'auth_required' });
  return res.redirect(`/login?next=${back}`);
}

// Verifica que esté logueado y que su rol esté permitido
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.usuario) {
      const back = encodeURIComponent(req.originalUrl || '/');
      if (wantsJSON(req)) return res.status(401).json({ error: 'auth_required' });
      return res.redirect(`/login?next=${back}`);
    }
    if (roles.length && !roles.includes(req.session.rol)) {
      if (wantsJSON(req)) return res.status(403).json({ error: 'forbidden' });
      return res.status(403).send('No autorizado');
    }
    next();
  };
}

// “Auto-filtro” (coloca IDs propios en req para usarlos en las queries)
function onlySelfClient(req, res, next) {
  if (req.session?.rol === 'cliente') req.onlyClientId = req.session.clienteId || null;
  next();
}
function onlySelfBarber(req, res, next) {
  if (req.session?.rol === 'barbero') req.onlyBarberoId = req.session.barberoId || null;
  next();
}

// Guarda por parámetro: impiden acceder a un recurso que no es tuyo
function requireOwnClienteParam(param = 'id') {
  return (req, res, next) => {
    if (req.session?.rol === 'cliente') {
      const me = req.session.clienteId;
      if (!me || req.params[param] !== me) return res.status(403).send('No autorizado');
    }
    next();
  };
}
function requireOwnBarberoParam(param = 'id') {
  return (req, res, next) => {
    if (req.session?.rol === 'barbero') {
      const me = req.session.barberoId;
      if (!me || req.params[param] !== me) return res.status(403).send('No autorizado');
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  onlySelfClient,
  onlySelfBarber,
  requireOwnClienteParam,
  requireOwnBarberoParam
};
