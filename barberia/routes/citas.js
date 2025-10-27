// routes/citas.js
const express = require('express');
const router = express.Router();
const { sql, pool, poolConnect } = require('../db/connection');


// Crea CitaID tipo CIT001, CIT002, ...
function generarIDCita(n) {
  return 'CIT' + String(n).padStart(3, '0');
}

// Parsea "HH:mm" a {h, mi}
function parseTimeHHMM(str) {
  if (!str) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, mi };
}

// Convierte {h, mi} a un Date fijo (SQL tomará solo la parte de hora)
function timeAsDate(h, m) {
  return new Date(1970, 0, 1, h, m, 0, 0);
}

// Para comparar horas
function minutesOf(t) { return t.h * 60 + t.mi; }

// ( para auditoría vía CONTEXT_INFO/SESSION_CONTEXT si tienes triggers
async function setUsuarioContext(req) {
  const usuario = req.session?.usuario || 'Sistema';
  await pool.request()
    .input('Usuario', sql.NVarChar, usuario)
    .query(`EXEC sys.sp_set_session_context 
              @key=N'UsuarioApp', 
              @value=@Usuario, 
              @read_only=0;`);
  return usuario;
}

// Facilidad
function isAdmin(req){ return req.session?.rol === 'admin'; }
function isCliente(req){ return req.session?.rol === 'cliente' && !!req.session?.clienteId; }
function isBarbero(req){ return req.session?.rol === 'barbero' && !!req.session?.barberoId; }

/* filtrar Citas según rol */
function buildRoleFilterForCitas(req) {
  let where = '';
  let r = pool.request();
  if (isCliente(req)) {
    where = 'WHERE c.ClienteID = @clid';
    r = r.input('clid', sql.VarChar(15), req.session.clienteId);
  } else if (isBarbero(req)) {
    where = 'WHERE c.BarberoID = @bid';
    r = r.input('bid', sql.VarChar(15), req.session.barberoId);
  }
  return { where, req: r };
}

/*Para proteger UPDATE/DELETE por rol */
function addAuthCondition(req, request, alias='') {
 
  const col = (c) => (alias ? `${alias}.${c}` : c);

  let cond = '';
  let r = request;
  if (isCliente(req)) {
    cond = ` AND ${col('ClienteID')} = @AuthCliente`;
    r = r.input('AuthCliente', sql.VarChar(15), req.session.clienteId);
  } else if (isBarbero(req)) {
    cond = ` AND ${col('BarberoID')} = @AuthBarbero`;
    r = r.input('AuthBarbero', sql.VarChar(15), req.session.barberoId);
  }
  return { cond, req: r };
}

/* ================== Listado + Formulario ================== */
router.get('/', async (req, res) => {
  try {
    await poolConnect;

    // Listas para selects: si cliente/barbero, solo él mismo
    let reqClientes = pool.request();
    let sqlClientes = 'SELECT ClienteID, Nombre, Apellido1 FROM Clientes';
    if (isCliente(req)) {
      sqlClientes += ' WHERE ClienteID = @clid';
      reqClientes = reqClientes.input('clid', sql.VarChar(15), req.session.clienteId);
    }
    let reqBarberos = pool.request();
    let sqlBarberos = 'SELECT BarberoID, Nombre, Apellido1 FROM Barberos';
    if (isBarbero(req)) {
      sqlBarberos += ' WHERE BarberoID = @bid';
      reqBarberos = reqBarberos.input('bid', sql.VarChar(15), req.session.barberoId);
    }

    const { where, req: reqCitas } = buildRoleFilterForCitas(req);

    const [clientes, barberos, servicios, citas] = await Promise.all([
      reqClientes.query(sqlClientes),
      reqBarberos.query(sqlBarberos),
      pool.request().query('SELECT ServicioID, Nombre FROM Servicios'),
      reqCitas.query(`
        SELECT c.*, 
               cl.Nombre + ' ' + cl.Apellido1 AS ClienteNombre,
               b.Nombre  + ' ' + b.Apellido1  AS BarberoNombre,
               s.Nombre  AS ServicioNombre
        FROM Citas c
        JOIN Clientes  cl ON c.ClienteID  = cl.ClienteID
        JOIN Barberos  b  ON c.BarberoID = b.BarberoID
        JOIN Servicios s  ON c.ServicioID = s.ServicioID
        ${where}
        ORDER BY c.Fecha DESC, c.HoraInicio
      `)
    ]);

    res.render('citas', { 
      citas     : citas.recordset, 
      clientes  : clientes.recordset, 
      barberos  : barberos.recordset, 
      servicios : servicios.recordset,
      citaEditar: null,
      rol       : req.session?.rol || null 
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener citas');
  }
});

/* =========================== Agregar =========================== */
router.post('/agregar', async (req, res) => {
  try {
    await poolConnect;

    let {
      ClienteID, BarberoID, ServicioID,
      Fecha, HoraInicio, HoraFin,
      Estado = 'P', Notas = ''
    } = req.body;

    // Si no es admin, forzar IDs desde sesión (no desde el form)
    if (isCliente(req))   ClienteID = req.session.clienteId;
    if (isBarbero(req))   BarberoID = req.session.barberoId;

    // Valida horas
    const tHi = parseTimeHHMM(HoraInicio);
    const tHf = parseTimeHHMM(HoraFin);
    if (!tHi || !tHf) throw new Error('Hora inválida');
    if (minutesOf(tHf) <= minutesOf(tHi))
      throw new Error('HoraInicio debe ser menor que HoraFin');

    const hiDate = timeAsDate(tHi.h, tHi.mi);
    const hfDate = timeAsDate(tHf.h, tHf.mi);

    const usuarioApp = await setUsuarioContext(req);

    const { recordset: [{ MaxNum }] } = await pool.request().query(`
      SELECT ISNULL(MAX(CAST(SUBSTRING(CitaID, 4, 10) AS INT)), 0) AS MaxNum
      FROM Citas
      WHERE CitaID LIKE 'CIT%'
    `);
    const nuevoID = generarIDCita(MaxNum + 1);

    await pool.request()
      .input('CitaID',          sql.VarChar(10), nuevoID)
      .input('ClienteID',       sql.VarChar(15), ClienteID)
      .input('BarberoID',       sql.VarChar(15), BarberoID)
      .input('ServicioID',      sql.VarChar(10), ServicioID)
      .input('Fecha',           sql.Date,        Fecha)
      .input('HoraInicio',      sql.Time,        hiDate)
      .input('HoraFin',         sql.Time,        hfDate)
      .input('Estado',          sql.Char(1),     Estado)
      .input('Notas',           sql.VarChar(200), Notas || '')
      .input('UsuarioRegistro', sql.VarChar(50),  usuarioApp)
      .query(`
        INSERT INTO Citas
          (CitaID, ClienteID, BarberoID, ServicioID, Fecha, HoraInicio, HoraFin, Estado, Notas, UsuarioRegistro)
        VALUES
          (@CitaID, @ClienteID, @BarberoID, @ServicioID, @Fecha, @HoraInicio, @HoraFin, @Estado, @Notas, @UsuarioRegistro)
      `);

    res.redirect('/citas');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al agregar cita');
  }
});

/* ===================== Cargar para editar ====================== */
router.get('/editar/:id', async (req, res) => {
  try {
    await poolConnect;
    const { id } = req.params;

    // Listas filtradas según rol
    let reqClientes = pool.request();
    let sqlClientes = 'SELECT ClienteID, Nombre, Apellido1 FROM Clientes';
    if (isCliente(req)) {
      sqlClientes += ' WHERE ClienteID = @clid';
      reqClientes = reqClientes.input('clid', sql.VarChar(15), req.session.clienteId);
    }
    let reqBarberos = pool.request();
    let sqlBarberos = 'SELECT BarberoID, Nombre, Apellido1 FROM Barberos';
    if (isBarbero(req)) {
      sqlBarberos += ' WHERE BarberoID = @bid';
      reqBarberos = reqBarberos.input('bid', sql.VarChar(15), req.session.barberoId);
    }

    const { where, req: reqCitas } = buildRoleFilterForCitas(req);

    // La cita a editar, protegida por rol
    let reqSel = pool.request().input('id', sql.VarChar(10), id);
    let cond = '';
    ({ cond, req: reqSel } = addAuthCondition(req, reqSel)); // agrega AND ClienteID=... / AND BarberoID=...

    const [clientes, barberos, servicios, citas, citaEditar] = await Promise.all([
      reqClientes.query(sqlClientes),
      reqBarberos.query(sqlBarberos),
      pool.request().query('SELECT ServicioID, Nombre FROM Servicios'),
      reqCitas.query(`
        SELECT c.*, 
               cl.Nombre + ' ' + cl.Apellido1 AS ClienteNombre,
               b.Nombre  + ' ' + b.Apellido1  AS BarberoNombre,
               s.Nombre  AS ServicioNombre
        FROM Citas c
        JOIN Clientes  cl ON c.ClienteID  = cl.ClienteID
        JOIN Barberos  b  ON c.BarberoID = b.BarberoID
        JOIN Servicios s  ON c.ServicioID = s.ServicioID
        ${where}
        ORDER BY c.Fecha DESC, c.HoraInicio
      `),
      reqSel.query(`SELECT * FROM Citas WHERE CitaID = @id${cond}`)
    ]);

    res.render('citas', { 
      citas     : citas.recordset, 
      clientes  : clientes.recordset, 
      barberos  : barberos.recordset, 
      servicios : servicios.recordset,
      citaEditar: citaEditar.recordset[0] || null,
      rol       : req.session?.rol || null
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error al cargar cita para editar');
  }
});

/* ============================ Editar ============================ */
router.post('/editar/:id', async (req, res) => {
  try {
    await poolConnect;
    const { id } = req.params;

    let {
      ClienteID, BarberoID, ServicioID,
      Fecha, HoraInicio, HoraFin,
      Estado = 'P', Notas = ''
    } = req.body;

    // Si no es admin, forzar IDs desde sesión
    if (isCliente(req))   ClienteID = req.session.clienteId;
    if (isBarbero(req))   BarberoID = req.session.barberoId;

    const tHi = parseTimeHHMM(HoraInicio);
    const tHf = parseTimeHHMM(HoraFin);
    if (!tHi || !tHf) throw new Error('Hora inválida');
    if (minutesOf(tHf) <= minutesOf(tHi))
      throw new Error('HoraInicio debe ser menor que HoraFin');

    const hiDate = timeAsDate(tHi.h, tHi.mi);
    const hfDate = timeAsDate(tHf.h, tHf.mi);

    await setUsuarioContext(req);

    let rq = pool.request()
      .input('CitaID',     sql.VarChar(10), id)
      .input('ClienteID',  sql.VarChar(15), ClienteID)
      .input('BarberoID',  sql.VarChar(15), BarberoID)
      .input('ServicioID', sql.VarChar(10), ServicioID)
      .input('Fecha',      sql.Date,       Fecha)
      .input('HoraInicio', sql.Time,       hiDate)
      .input('HoraFin',    sql.Time,       hfDate)
      .input('Estado',     sql.Char(1),    Estado)
      .input('Notas',      sql.VarChar(200), Notas || '');

    let cond = '';
    ({ cond, req: rq } = addAuthCondition(req, rq));

    const result = await rq.query(`
      UPDATE Citas
         SET ClienteID=@ClienteID,
             BarberoID=@BarberoID,
             ServicioID=@ServicioID,
             Fecha=@Fecha,
             HoraInicio=@HoraInicio,
             HoraFin=@HoraFin,
             Estado=@Estado,
             Notas=@Notas
       WHERE CitaID=@CitaID${cond}
    `);

    if ((result.rowsAffected?.[0] || 0) === 0) {
      return res.status(403).send('No autorizado o la cita no existe');
    }

    res.redirect('/citas');

  } catch (err) {
    console.error(err);
    res.status(500).send('Error al actualizar cita');
  }
});

/* =========================== Eliminar =========================== */
router.post('/eliminar/:id', async (req, res) => {
  try {
    await poolConnect;
    const { id } = req.params;

    await setUsuarioContext(req);

    let rq = pool.request().input('CitaID', sql.VarChar(10), id);
    let cond = '';
    ({ cond, req: rq } = addAuthCondition(req, rq));

    const result = await rq.query(`DELETE FROM Citas WHERE CitaID = @CitaID${cond}`);

    if ((result.rowsAffected?.[0] || 0) === 0) {
      return res.status(403).send('No autorizado o la cita no existe');
    }

    res.redirect('/citas');

  } catch (err) {
    console.error(err);
    res.status(500).send('Error al eliminar cita');
  }
});

module.exports = router;


