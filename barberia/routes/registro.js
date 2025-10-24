// routes/registro.js
const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();
const { sql, pool, poolConnect } = require('../db/connection');

// Validaciones básicas
const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]{2,50}$/;
const SOLO_TEL    = /^[0-9()+\-\s]{7,20}$/;

//  genera IDs (USU001/CLI001/BAR001) usando SIEMPRE un Request nuevo
async function nextId(tx, table, col, prefix, width = 3) {
  const { recordset } = await tx.request()
    .input('pfx', sql.VarChar(10), prefix)
    .query(`
      SELECT ISNULL(MAX(CAST(SUBSTRING(${col}, LEN(@pfx)+1, 10) AS INT)), 0) AS MaxNum
      FROM ${table}
      WHERE ${col} LIKE @pfx + '%'
    `);
  const n = (recordset[0]?.MaxNum || 0) + 1;
  return prefix + String(n).padStart(width, '0');
}

// GET registro
router.get('/', (req, res) => {
  res.render('registro', { error: undefined, success: undefined, titulo: 'Registrarse', values: {}, hideNav:true });
});

// POST registro
router.post('/', async (req, res) => {
  await poolConnect;

  const {
    nombreUsuario = '',
    correo = '',
    contrasena = '',
    rol = '',                 // 'cliente' | 'barbero' | 'admin'
    nombre = '',
    apellido1 = '',
    apellido2 = '',
    telefono = '',
    fechaNacimiento = null,   // 'YYYY-MM-DD' o ''
    direccion = ''
  } = req.body;

  const hoy = new Date();

  // Validaciones mínimas
  if (!['cliente','barbero','admin'].includes(rol)) {
    return res.render('registro', { error:'Rol inválido.', success:undefined, titulo:'Registrarse', values:req.body, hideNav:true });
  }
  if (!nombreUsuario.trim() || !correo.trim() || !contrasena) {
    return res.render('registro', { error:'Complete usuario, correo y contraseña.', success:undefined, titulo:'Registrarse', values:req.body, hideNav:true });
  }
  if (rol === 'cliente' || rol === 'barbero') {
    if (!SOLO_LETRAS.test(nombre))    return res.render('registro', { error:'Nombre inválido (solo letras y espacios).', success:undefined, titulo:'Registrarse', values:req.body, hideNav:true });
    if (!SOLO_LETRAS.test(apellido1)) return res.render('registro', { error:'Primer apellido inválido.', success:undefined, titulo:'Registrarse', values:req.body, hideNav:true });
    if (apellido2 && !SOLO_LETRAS.test(apellido2)) return res.render('registro', { error:'Segundo apellido inválido.', success:undefined, titulo:'Registrarse', values:req.body, hideNav:true });
    if (telefono && !SOLO_TEL.test(telefono))       return res.render('registro', { error:'Teléfono inválido.', success:undefined, titulo:'Registrarse', values:req.body, hideNav:true });
  }

  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();

    // ¿Usuario duplicado?
    const dup = await tx.request()
      .input('u', sql.VarChar(30), nombreUsuario.trim())
      .query('SELECT 1 FROM Usuarios WHERE NombreUsuario = @u');

    if (dup.recordset.length) {
      await tx.rollback();
      return res.render('registro', {
        error: 'El nombre de usuario ya existe.',
        success: undefined,
        titulo: 'Registrarse',
        values: req.body,
        hideNav: true
      });
    }

    const hashed = await bcrypt.hash(contrasena, 10);

    // Según rol, crear Cliente/Barbero
    let ClienteID = null, BarberoID = null;

    if (rol === 'cliente') {
      ClienteID = await nextId(tx, 'Clientes', 'ClienteID', 'CLI', 3);

      await tx.request()
        .input('ClienteID',         sql.VarChar(15),  ClienteID)
        .input('Nombre',            sql.VarChar(50),  nombre)
        .input('Apellido1',         sql.VarChar(30),  apellido1)
        .input('Apellido2',         sql.VarChar(30),  apellido2 || '')
        .input('Telefono',          sql.VarChar(20),  telefono || '')
        .input('CorreoElectronico', sql.VarChar(320), correo)
        .input('FechaNacimiento',   sql.Date,         fechaNacimiento || null)
        .input('FechaRegistro',     sql.Date,         hoy)
        .input('Direccion',         sql.VarChar(100), direccion || '')
        .input('Estado',            sql.Char(1),      'A')
        .input('UsuarioRegistro',   sql.VarChar(50),  nombreUsuario)
        .query(`
          INSERT INTO Clientes
            (ClienteID, Nombre, Apellido1, Apellido2, Telefono, CorreoElectronico,
             FechaNacimiento, FechaRegistro, Direccion, Estado, UsuarioRegistro)
          VALUES
            (@ClienteID, @Nombre, @Apellido1, @Apellido2, @Telefono, @CorreoElectronico,
             @FechaNacimiento, @FechaRegistro, @Direccion, @Estado, @UsuarioRegistro)
        `);
    }

    if (rol === 'barbero') {
      BarberoID = await nextId(tx, 'Barberos', 'BarberoID', 'BAR', 3);

      await tx.request()
        .input('BarberoID',         sql.VarChar(15),  BarberoID)
        .input('Nombre',            sql.VarChar(50),  nombre)
        .input('Apellido1',         sql.VarChar(30),  apellido1)
        .input('Apellido2',         sql.VarChar(30),  apellido2 || '')
        .input('Telefono',          sql.VarChar(20),  telefono || '')
        .input('CorreoElectronico', sql.VarChar(320), correo)
        .input('FechaNacimiento',   sql.Date,         fechaNacimiento || null)
        .input('FechaContratacion', sql.Date,         hoy)
        .input('Estado',            sql.Char(1),      'A')
        .input('UsuarioRegistro',   sql.VarChar(50),  nombreUsuario)
        .query(`
          INSERT INTO Barberos
            (BarberoID, Nombre, Apellido1, Apellido2, Telefono, CorreoElectronico,
             FechaNacimiento, FechaContratacion, Estado, UsuarioRegistro)
          VALUES
            (@BarberoID, @Nombre, @Apellido1, @Apellido2, @Telefono, @CorreoElectronico,
             @FechaNacimiento, @FechaContratacion, @Estado, @UsuarioRegistro)
        `);
    }

    // Usuario de acceso
    const UsuarioID = await nextId(tx, 'Usuarios', 'UsuarioID', 'USU', 3);

    await tx.request()
      .input('UsuarioID',         sql.VarChar(10),   UsuarioID)
      .input('NombreUsuario',     sql.VarChar(30),   nombreUsuario.trim())
      .input('Contrasena',        sql.VarBinary(128), Buffer.from(hashed))
      .input('Rol',               sql.VarChar(20),   rol)
      .input('FechaCreacion',     sql.Date,          hoy)
      .input('UltimoAcceso',      sql.DateTime,      hoy)
      .input('CorreoElectronico', sql.VarChar(320),  correo)
      .query(`
        INSERT INTO Usuarios
          (UsuarioID, NombreUsuario, Contrasena, Rol, FechaCreacion, UltimoAcceso, CorreoElectronico)
        VALUES
          (@UsuarioID, @NombreUsuario, @Contrasena, @Rol, @FechaCreacion, @UltimoAcceso, @CorreoElectronico)
      `);

    await tx.commit();

    return res.render('registro', {
      success: 'Usuario registrado correctamente. Ya puedes iniciar sesión.',
      error: undefined,
      titulo: 'Registrarse',
      values: {},
      hideNav: true
    });

  } catch (err) {
    try { await tx.rollback(); } catch {}
    console.error('Error en registro (DEBUG):', err);
    console.error('Detalle SQL:', err?.originalError || err);
    return res.render('registro', {
      error: 'Ocurrió un error al registrar el usuario.',
      success: undefined,
      titulo: 'Registrarse',
      values: req.body,
      hideNav: true
    });
  }
});

module.exports = router;




