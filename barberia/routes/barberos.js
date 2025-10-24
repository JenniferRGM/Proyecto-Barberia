// routes/barberos.js
const express = require('express');
const router = express.Router();
const { sql, pool, poolConnect } = require('../db/connection');

//  setea usuario para triggers/bitácora
async function setUsuarioContext(req) {
  const usuario = req.session?.usuario || 'Sistema';
  await pool.request()
    .input('Usuario', sql.NVarChar, usuario)
    .query(`EXEC sys.sp_set_session_context @key=N'UsuarioApp', @value=@Usuario, @read_only=0;`);
  return usuario;
}

function generarIDBarbero(n) { return `BAR${String(n).padStart(3, '0')}`; }

// LISTAR
router.get('/', async (req, res) => {
  try {
    await poolConnect;
    const rs = await pool.request().query(`
      SELECT BarberoID, Nombre, Apellido1, Apellido2, CorreoElectronico, Telefono,
             FechaNacimiento, FechaContratacion, Estado
      FROM Barberos
      ORDER BY Nombre, Apellido1
    `);

    const msgMap = {
      creado: 'Barbero creado correctamente.',
      actualizado: 'Barbero actualizado correctamente.',
      eliminado: 'Barbero eliminado correctamente.'
    };

    res.render('barberos', { 
      barberos: rs.recordset, 
      titulo: 'Barberos', 
      error: undefined, 
      success: undefined 
    });
  } catch (err) {
    console.error('Error /barberos:', err);
    res.status(500).send('Error al obtener barberos');
  }
});

// CREAR
router.post('/agregar', async (req, res) => {
  const { Nombre, Apellido1, Apellido2, Telefono, CorreoElectronico, FechaNacimiento } = req.body;
  try {
    await poolConnect;
    const usuarioApp = await setUsuarioContext(req);

    const c = await pool.request().query('SELECT COUNT(*) AS total FROM Barberos');
    const nuevoId = generarIDBarbero(c.recordset[0].total + 1);

    await pool.request()
      .input('BarberoID',         sql.VarChar(15), nuevoId)
      .input('Nombre',            sql.VarChar(50), Nombre)
      .input('Apellido1',         sql.VarChar(30), Apellido1 || '')
      .input('Apellido2',         sql.VarChar(30), Apellido2 || '')
      .input('Telefono',          sql.VarChar(15), Telefono || '')
      .input('CorreoElectronico', sql.VarChar(320), CorreoElectronico || '')
      .input('FechaNacimiento',   sql.Date, FechaNacimiento || null)
      .input('FechaContratacion', sql.Date, new Date())
      .input('Estado',            sql.Char(1), 'A')
      .input('UsuarioRegistro',   sql.VarChar(50), usuarioApp)
      .query(`
        INSERT INTO Barberos
          (BarberoID, Nombre, Apellido1, Apellido2, Telefono, CorreoElectronico,
           FechaNacimiento, FechaContratacion, Estado, UsuarioRegistro)
        VALUES
          (@BarberoID, @Nombre, @Apellido1, @Apellido2, @Telefono, @CorreoElectronico,
           @FechaNacimiento, @FechaContratacion, @Estado, @UsuarioRegistro)
      `);

    res.redirect('/barberos?msg=creado');
  } catch (err) {
    console.error('Error al agregar barbero:', err);
    const rs = await pool.request().query('SELECT * FROM Barberos ORDER BY Nombre, Apellido1');
    res.status(500).render('barberos', { 
      barberos: rs.recordset, titulo: 'Barberos',
      error: 'No se pudo crear el barbero', success: undefined
    });
  }
});

// EDITAR
router.post('/editar/:id', async (req, res) => {
  const { id } = req.params;
  const { Nombre, Apellido1, Apellido2, Telefono, CorreoElectronico, FechaNacimiento, Estado } = req.body;
  try {
    await poolConnect;
    await setUsuarioContext(req);

    await pool.request()
      .input('BarberoID',         sql.VarChar(15), id)
      .input('Nombre',            sql.VarChar(50), Nombre)
      .input('Apellido1',         sql.VarChar(30), Apellido1 || '')
      .input('Apellido2',         sql.VarChar(30), Apellido2 || '')
      .input('Telefono',          sql.VarChar(15), Telefono || '')
      .input('CorreoElectronico', sql.VarChar(320), CorreoElectronico || '')
      .input('FechaNacimiento',   sql.Date, FechaNacimiento || null)
      .input('Estado',            sql.Char(1), Estado || 'A')
      .query(`
        UPDATE Barberos
           SET Nombre=@Nombre,
               Apellido1=@Apellido1,
               Apellido2=@Apellido2,
               Telefono=@Telefono,
               CorreoElectronico=@CorreoElectronico,
               FechaNacimiento=@FechaNacimiento,
               Estado=@Estado
         WHERE BarberoID=@BarberoID
      `);

    res.redirect('/barberos?msg=actualizado');
  } catch (err) {
    console.error('Error al editar barbero:', err);
    res.status(500).send('Error al editar barbero');
  }
});

// ELIMINAR
router.post('/eliminar/:id', async (req, res) => {
  try {
    await poolConnect;
    await setUsuarioContext(req);

    await pool.request()
      .input('BarberoID', sql.VarChar(15), req.params.id)
      .query('DELETE FROM Barberos WHERE BarberoID=@BarberoID');

    res.redirect('/barberos?msg=eliminado');
  } catch (err) {
    console.error('Error al eliminar barbero:', err);
    res.status(500).send('Error al eliminar barbero');
  }
});

module.exports = router;

