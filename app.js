const express = require('express');
const path = require('path');
const session = require('express-session');
const {
  requireAuth,
  requireRole,
  onlySelfClient,
  onlySelfBarber
} = require('./middlewares/auth');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'barberia_super_secret',
  resave: false,
  saveUninitialized: false
}));

// Vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Locals para header / vistas
app.use((req, res, next) => {
  res.locals.usuario = req.session?.usuario || null;
  res.locals.rol     = req.session?.rol || null;
  next();
});

// Routers
const loginRoutes          = require('./routes/login');
const registroRoutes       = require('./routes/registro');
const clientesRoutes       = require('./routes/clientes');
const barberosRoutes       = require('./routes/barberos');
const citasRoutes          = require('./routes/citas');
const especialidadesRoutes = require('./routes/especialidades');
const ventasRoutes         = require('./routes/ventas');
const pagosRoutes          = require('./routes/pagos');
const serviciosRoutes      = require('./routes/servicios');
const productosRoutes      = require('./routes/productos');
const reportesRoutes       = require('./routes/reportes');

// Home
app.get('/', (req, res) => {
  res.render('index', { titulo: 'Inicio' });
});
app.get('/index', (req, res) => res.redirect('/'));

// Públicas (sin sesión)
app.use('/login',    loginRoutes);
app.use('/registro', registroRoutes);

// ===== “Puertas” por prefijo antes de montar routers =====
// Servicios: /menu y /api públicos; lo demás solo admin o barbero
app.use('/servicios', (req, res, next) => {
  if (req.path === '/menu' || req.path.startsWith('/api')) return next();
  return requireRole('admin','barbero')(req, res, next);
});

// Productos: /menu y /api públicos; lo demás solo admin o barbero
app.use('/productos', (req, res, next) => {
  if (req.path === '/menu' || req.path.startsWith('/api')) return next();
  return requireRole('admin','barbero')(req, res, next);
});

// Solo ADMIN
app.use('/reportes', requireRole('admin'), reportesRoutes);

// ADMIN + BARBERO
app.use('/barberos',       requireRole('admin','barbero'), barberosRoutes);
app.use('/ventas',         requireRole('admin','barbero'), ventasRoutes);
app.use('/pagos',          requireRole('admin','barbero'), pagosRoutes);
app.use('/especialidades', requireRole('admin','barbero'), especialidadesRoutes);

// Requieren sesión (cualquier rol logueado)
// Añadimos auto-filtros para que los routers puedan mostrar solo “mis datos”
app.use('/citas',    requireAuth, onlySelfClient, onlySelfBarber, citasRoutes);
app.use('/clientes', requireAuth, onlySelfClient, clientesRoutes);

// Montaje de routers (después de las “puertas”)
app.use('/servicios', serviciosRoutes);
app.use('/productos', productosRoutes);

// 404
app.use((req, res) => res.status(404).send('Página no encontrada'));

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

