const express = require('express');
const router = express.Router();
const { sql, pool, poolConnect } = require('../db/connection');

// Función para generar ID de cliente en formato CLIxxx
function generarIDCliente(numero) {
  return `CLI${numero.toString().padStart(3, '0')}`;
}

// Muestra formulario de agregar/editar cliente
router.get('/', async (req, res) => {
  try {
    await poolConnect;
    const result = await pool.request().query('SELECT * FROM Clientes');
    res.render('clientes', { clientes: result.recordset, clienteEditar: null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener los clientes');
  }
});

// Agrega cliente
router.post('/agregar', async (req, res) => {
  try {
    const { Nombre, Apellido1, Apellido2, Telefono, CorreoElectronico, FechaNacimiento, Direccion } = req.body;
    await poolConnect;
    const total = await pool.request().query('SELECT COUNT(*) AS total FROM Clientes');
    const nuevoNumero = total.recordset[0].total + 1;
    const nuevoID = generarIDCliente(nuevoNumero);

    await pool.request()
      .input('ClienteID', sql.VarChar, nuevoID)
      .input('Nombre', sql.VarChar, Nombre)
      .input('Apellido1', sql.VarChar, Apellido1)
      .input('Apellido2', sql.VarChar, Apellido2)
      .input('Telefono', sql.VarChar, Telefono)
      .input('CorreoElectronico', sql.VarChar, CorreoElectronico)
      .input('FechaNacimiento', sql.Date, FechaNacimiento)
      .input('Direccion', sql.VarChar, Direccion)
      .input('Estado', sql.Char, 'A')
      .input('FechaRegistro', sql.Date, new Date())
      .input('UsuarioRegistro', sql.VarChar, 'Cliente') 
      .query(`INSERT INTO Clientes (ClienteID, Nombre, Apellido1, Apellido2, Telefono, CorreoElectronico, FechaNacimiento, Direccion, Estado, FechaRegistro, UsuarioRegistro)
              VALUES (@ClienteID, @Nombre, @Apellido1, @Apellido2, @Telefono, @CorreoElectronico, @FechaNacimiento, @Direccion, @Estado, @FechaRegistro, @UsuarioRegistro)`);

    res.redirect('/clientes');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al registrar cliente');
  }
});

// Muestra cliente para editar
router.get('/editar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await poolConnect;
    const clientes = await pool.request().query('SELECT * FROM Clientes');
    const cliente = await pool.request()
      .input('ClienteID', sql.VarChar, id)
      .query('SELECT * FROM Clientes WHERE ClienteID = @ClienteID');

    res.render('clientes', { clientes: clientes.recordset, clienteEditar: cliente.recordset[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al cargar datos del cliente');
  }
});

// Actualiza cliente
router.post('/editar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre, Apellido1, Apellido2, Telefono, CorreoElectronico, FechaNacimiento, Direccion } = req.body;
    await poolConnect;

    await pool.request()
      .input('ClienteID', sql.VarChar, id)
      .input('Nombre', sql.VarChar, Nombre)
      .input('Apellido1', sql.VarChar, Apellido1)
      .input('Apellido2', sql.VarChar, Apellido2)
      .input('Telefono', sql.VarChar, Telefono)
      .input('CorreoElectronico', sql.VarChar, CorreoElectronico)
      .input('FechaNacimiento', sql.Date, FechaNacimiento)
      .input('Direccion', sql.VarChar, Direccion)
      .query(`UPDATE Clientes SET Nombre=@Nombre, Apellido1=@Apellido1, Apellido2=@Apellido2, Telefono=@Telefono,
              CorreoElectronico=@CorreoElectronico, FechaNacimiento=@FechaNacimiento, Direccion=@Direccion
              WHERE ClienteID=@ClienteID`);

    res.redirect('/clientes');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al actualizar cliente');
  }
});

// Elimina cliente
router.post('/eliminar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await poolConnect;
    await pool.request()
      .input('ClienteID', sql.VarChar, id)
      .query('DELETE FROM Clientes WHERE ClienteID = @ClienteID');

    res.redirect('/clientes');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al eliminar cliente');
  }
});

module.exports = router;

