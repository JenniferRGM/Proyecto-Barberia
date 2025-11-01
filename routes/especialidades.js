const express = require('express');
const router = express.Router();
const { sql, pool, poolConnect } = require('../db/connection');

// ============ CRUD de Especialidades ============

// LISTA + FORMULARIO (crear / editar)
router.get('/', async (req, res) => {
  await poolConnect;
  const rs = await pool.request().query(`
    SELECT EspecialidadID, Codigo, Nombre
    FROM Especialidades
    ORDER BY Codigo
  `);
  res.render('especialidades', {
    especialidades: rs.recordset,
    espEditar: null,
    titulo: 'Especialidades'
  });
});

// Cargar una especialidad para editar
router.get('/editar/:id', async (req, res) => {
  await poolConnect;
  const [lista, sel] = await Promise.all([
    pool.request().query(`SELECT EspecialidadID, Codigo, Nombre FROM Especialidades ORDER BY Codigo`),
    pool.request().input('id', sql.Int, req.params.id)
       .query(`SELECT EspecialidadID, Codigo, Nombre FROM Especialidades WHERE EspecialidadID=@id`)
  ]);
  res.render('especialidades', {
    especialidades: lista.recordset,
    espEditar: sel.recordset[0] || null,
    titulo: 'Especialidades'
  });
});

// Crear
router.post('/agregar', async (req, res) => {
  const { Nombre } = req.body;
  await poolConnect;
  await pool.request()
    .input('Nombre', sql.VarChar(50), Nombre)
    .query(`INSERT INTO Especialidades (Nombre) VALUES (@Nombre)`);
  res.redirect('/especialidades');
});

// Editar
router.post('/editar/:id', async (req, res) => {
  const { Nombre } = req.body;
  await poolConnect;
  await pool.request()
    .input('id', sql.Int, req.params.id)
    .input('Nombre', sql.VarChar(50), Nombre)
    .query(`UPDATE Especialidades SET Nombre=@Nombre WHERE EspecialidadID=@id`);
  res.redirect('/especialidades');
});

// ============ Asignación Especialidades ⇄ Barbero ============

// Mostrar checkboxes para un barbero
router.get('/barbero/:barberoId', async (req, res) => {
  const { barberoId } = req.params;
  const success = req.query.ok === '1';

  await poolConnect;

  const [todas, asignadas] = await Promise.all([
    pool.request().query(`
      SELECT EspecialidadID, Codigo, Nombre 
      FROM Especialidades ORDER BY Codigo
      `),
    pool.request()
      .input('b', sql.VarChar(15), barberoId)
      .query(`SELECT EspecialidadID FROM EspecialidadesBarbero WHERE BarberoID=@b`)
  ]);

  const setAsignadas = new Set(asignadas.recordset.map(r => r.EspecialidadID));

  res.render('barbero_especialidades', {
    barberoId,
    especialidades: todas.recordset,
    setAsignadas,
    success,
    titulo: 'Especialidades del barbero'
  });
});

// Guardar asignaciones
router.post('/barbero/:barberoId', async (req, res) => {
  const { barberoId } = req.params;

  // Puede venir un string (un solo checkbox) o un array o undefined (ninguno marcado)
  let seleccion = req.body['especialidades'] || [];
  if (!Array.isArray(seleccion)) seleccion = [seleccion];
  
  const ids = seleccion.map(n => parseInt(n, 10)).filter(n => !isNaN(n));

  await poolConnect;

  // Transacción correcta con mssql
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();

    // Borrar las que tenía
    await new sql.Request(tx)
      .input('b', sql.VarChar(15), barberoId)
      .query(`DELETE FROM EspecialidadesBarbero WHERE BarberoID=@b`);

    // Inserto las nuevas
    for (const espId of ids) {
      await new sql.Request(tx)
        .input('b', sql.VarChar(15), barberoId)
        .input('e', sql.Int, espId)
        .query(`INSERT INTO EspecialidadesBarbero (BarberoID, EspecialidadID) VALUES (@b, @e)`);
    }

    await tx.commit();
    res.redirect(`/especialidades/barbero/${barberoId}?ok=1`);
  } catch (e) {
    await tx.rollback();
    console.error('Error asignando especialidades:', e);
    res.status(500).send('Error al asignar especialidades');
  }
});

module.exports = router;

