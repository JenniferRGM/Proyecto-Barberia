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

    const esCliente = req.session?.rol === 'cliente' && req.session?.clienteId;

    let query  = "SELECT * FROM Clientes WHERE Estado = 'A'";
    const reqDb = pool.request();

    // Si es CLIENTE, solo ver su propio registro
    if (esCliente) {
      query += " AND ClienteID = @clid";
      reqDb.input('clid', sql.VarChar(15), req.session.clienteId);
    }

    const result = await reqDb.query(query);

    res.render('clientes', {
      clientes: result.recordset,
      clienteEditar: null
    });
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
     await poolConnect;

    const { id } = req.params;
    const esCliente = req.session?.rol === 'cliente' && req.session?.clienteId;

     // 1) Valida que un cliente no pueda editar otro cliente
     if (esCliente && req.session.clienteId !== id) {
      return res.status(403).send('No autorizado');
    }
    // 2) Obtiene el cliente a editar
    const qCliente = await pool.request()
      .input('id', sql.VarChar(15), id)
      .query("SELECT * FROM Clientes WHERE ClienteID = @id AND Estado = 'A'");

    // 3) Obtiene lista de clientes según rol
    let queryLista = "SELECT * FROM Clientes WHERE Estado = 'A'";
    let reqLista = pool.request();

    if (esCliente) {
      queryLista += " AND ClienteID = @clid";
      reqLista.input('clid', sql.VarChar(15), req.session.clienteId);
    }

    const clientes = await reqLista.query(queryLista);
     // 4) Muestra vista
    res.render('clientes', {
      clientes: clientes.recordset,
      clienteEditar: qCliente.recordset[0] || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al obtener el cliente');
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
      .query("UPDATE Clientes SET Estado = 'I' WHERE ClienteID = @ClienteID");

    res.redirect('/clientes');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al eliminar cliente');
  }
});

module.exports = router;

