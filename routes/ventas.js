// routes/ventas.js
const express = require('express');
const router = express.Router();
const { sql, pool, poolConnect } = require('../db/connection');

function genIDVenta(n){ return `VEN${String(n).padStart(3,'0')}`; }
function genIDDet(n){ return `DET${String(n).padStart(4,'0')}`; }

// ---------------- Listado ----------------
router.get('/', async (req,res)=>{
  await poolConnect;
  const rs = await pool.request().query(`
    SELECT v.VentaID, v.ClienteID,
           c.Nombre + ' ' + c.Apellido1 AS Cliente,
           v.MontoTotal, v.FechaVenta
    FROM Ventas v
    JOIN Clientes c ON c.ClienteID = v.ClienteID
    ORDER BY v.FechaVenta DESC, v.VentaID DESC
  `);
  res.render('ventas', { ventas: rs.recordset });
});

// ------------- Form: Nueva venta ----------
router.get('/nueva', async (req, res) => {
  try {
    await poolConnect;

    const selProducto = req.query.producto || null;
    const selServicio = req.query.servicio || null;

    const [clientesRs, serviciosRs, productosRs] = await Promise.all([
      pool.request()
        .input('estado', sql.Char(1), 'A')
        .query(`
          SELECT ClienteID, Nombre, Apellido1
          FROM Clientes
          WHERE Estado = @estado
          ORDER BY Nombre, Apellido1
        `),

      pool.request()
        .query(`
          SELECT ServicioID, Nombre, Precio, DuracionMinutos
          FROM Servicios
          ORDER BY Nombre
        `),

      // Enviar también el stock
      pool.request()
        .query(`
          SELECT ProductoID, Nombre, PrecioVenta AS Precio, StockActual
          FROM InventarioProductos
          ORDER BY Nombre
        `)
    ]);

    res.render('venta_nueva', { 
      clientes: clientesRs.recordset, 
      servicios: serviciosRs.recordset, 
      productos: productosRs.recordset, 
      selProducto,
      selServicio
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al cargar datos para nueva venta');
  }
});

// ------- Crear venta con detalle (TX) -----
router.post('/nueva', async (req,res)=>{
  await poolConnect;

  const { ClienteID } = req.body;
  // lineas puede venir como objeto o array; normalizamos:
  let lineas = req.body.lineas || [];
  if (!Array.isArray(lineas)) {
    // cuando hay una sola línea, viene como objeto
    lineas = [lineas];
  }

  if (!ClienteID) return res.status(400).send('Cliente requerido');
  if (!lineas.length) return res.status(400).send('Debe ingresar al menos una línea');

  const tx = pool.transaction();
  await tx.begin();
  try {
    // Generar VentaID (simple; si borras filas, mejor usa MAX SUBSTRING)
    const c = await tx.request().query('SELECT COUNT(*) total FROM Ventas');
    const VentaID = genIDVenta(c.recordset[0].total + 1);

    // Cabecera (total temporal)
    await tx.request()
      .input('VentaID',   sql.VarChar(10), VentaID)
      .input('ClienteID', sql.VarChar(15), ClienteID)
      .input('MontoTotal',sql.Decimal(10,2), 0)
      .input('FechaVenta',sql.Date, new Date())
      .query(`
        INSERT INTO Ventas (VentaID, ClienteID, MontoTotal, FechaVenta)
        VALUES (@VentaID, @ClienteID, @MontoTotal, @FechaVenta)
      `);

    // Base para DetalleID
    const cnt = await tx.request().query('SELECT COUNT(*) total FROM DetalleVentas');
    let corr = cnt.recordset[0].total;

    let total = 0;

    for (const l of lineas) {
      const tipo = String(l?.tipo || '').toLowerCase();
      const id   = l?.id || null;
      const cant = Math.max(1, Number(l?.cantidad || 1));

      if (!id) continue;

      let servicioID = null;
      let productoID = null;
      let precioUnit = 0;

      if (tipo === 'servicio') {
        // Precio oficial del servicio
        const s = await tx.request()
          .input('id', sql.VarChar(10), id)
          .query(`SELECT Precio FROM Servicios WHERE ServicioID = @id`);
        if (!s.recordset[0]) throw new Error(`Servicio no existe (${id})`);
        precioUnit = Number(s.recordset[0].Precio || 0);
        servicioID = id;

      } else if (tipo === 'producto') {
        // Intentar descuento de stock de forma atómica
        // 1) Obtener precio actual
        const p = await tx.request()
          .input('id', sql.VarChar(10), id)
          .query(`SELECT PrecioVenta, StockActual FROM InventarioProductos WHERE ProductoID = @id`);
        const prod = p.recordset[0];
        if (!prod) throw new Error(`Producto no existe (${id})`);

        // 2) Descontar si hay stock suficiente
        const upd = await tx.request()
          .input('id', sql.VarChar(10), id)
          .input('cant', sql.Int, cant)
          .query(`
            UPDATE InventarioProductos WITH (ROWLOCK, UPDLOCK)
               SET StockActual = StockActual - @cant
             WHERE ProductoID = @id AND StockActual >= @cant;
            SELECT @@ROWCOUNT AS ok;
          `);
        const ok = upd.recordset[0]?.ok || 0;
        if (!ok) throw new Error(`Stock insuficiente para el producto ${id}`);

        precioUnit = Number(prod.PrecioVenta || 0);
        productoID = id;

      } else {
        // Tipo inválido, ignora
        continue;
      }

      const subtotal = Number((cant * precioUnit).toFixed(2));
      total += subtotal;

      const DetalleID = genIDDet(++corr);
      await tx.request()
        .input('DetalleID',      sql.VarChar(10), DetalleID)
        .input('VentaID',        sql.VarChar(10), VentaID)
        .input('ServicioID',     sql.VarChar(10), servicioID)
        .input('ProductoID',     sql.VarChar(10), productoID)
        .input('Cantidad',       sql.Int, cant)
        .input('PrecioUnitario', sql.Decimal(10,2), precioUnit)
        .input('Subtotal',       sql.Decimal(10,2), subtotal)
        .query(`
          INSERT INTO DetalleVentas
            (DetalleID, VentaID, ServicioID, ProductoID, Cantidad, PrecioUnitario, Subtotal)
          VALUES
            (@DetalleID, @VentaID, @ServicioID, @ProductoID, @Cantidad, @PrecioUnitario, @Subtotal)
        `);
    }

    // Actualizar total real
    await tx.request()
      .input('VentaID', sql.VarChar(10), VentaID)
      .input('Total',   sql.Decimal(10,2), Number(total.toFixed(2)))
      .query(`UPDATE Ventas SET MontoTotal = @Total WHERE VentaID = @VentaID`);

    await tx.commit();
    res.redirect('/ventas');
  } catch(e) {
    console.error(e);
    await tx.rollback();
    res.status(400).send(e.message || 'Error al crear la venta');
  }
});

// ------------- Detalle de venta ----------
router.get('/:id', async (req,res)=>{
  await poolConnect;
  const { id } = req.params;
  const [cab, det] = await Promise.all([
    pool.request().input('id', sql.VarChar(10), id).query(`
      SELECT v.VentaID, v.FechaVenta, v.MontoTotal,
             c.ClienteID, c.Nombre + ' ' + c.Apellido1 AS Cliente
      FROM Ventas v
      JOIN Clientes c ON c.ClienteID = v.ClienteID
      WHERE v.VentaID = @id
    `),
    pool.request().input('id', sql.VarChar(10), id).query(`
      SELECT d.*,
             s.Nombre AS ServicioNombre,
             p.Nombre AS ProductoNombre
      FROM DetalleVentas d
      LEFT JOIN Servicios           s ON s.ServicioID  = d.ServicioID
      LEFT JOIN InventarioProductos p ON p.ProductoID  = d.ProductoID
      WHERE d.VentaID = @id
      ORDER BY d.DetalleID
    `)
  ]);
  res.render('venta_detalle', { venta: cab.recordset[0], detalle: det.recordset });
});

module.exports = router;


