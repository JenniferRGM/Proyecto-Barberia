// routes/pagos.js
const express = require('express');
const router = express.Router();
const { sql, pool, poolConnect } = require('../db/connection');

function genIDPago(n){ return `PAG${n.toString().padStart(3,'0')}`; }

router.get('/', async (req,res)=>{
  await poolConnect;
  const rs = await pool.request().query(`
    SELECT p.PagoID, p.VentaID, p.Monto, p.MetodoPago, p.FechaPago,
           v.MontoTotal, c.Nombre + ' ' + c.Apellido1 AS Cliente
    FROM Pagos p
    JOIN Ventas v ON v.VentaID = p.VentaID
    JOIN Clientes c ON c.ClienteID = v.ClienteID
    ORDER BY p.FechaPago DESC
  `);
  res.render('pagos', { pagos: rs.recordset });
});

router.get('/nuevo', async (req,res)=>{
  await poolConnect;
  const ventas = await pool.request().query(`
    SELECT v.VentaID, v.MontoTotal, c.Nombre + ' ' + c.Apellido1 AS Cliente
    FROM Ventas v JOIN Clientes c ON c.ClienteID=v.ClienteID
    ORDER BY v.FechaVenta DESC
  `);
  res.render('pago_nuevo', { ventas: ventas.recordset });
});

router.post('/nuevo', async (req,res)=>{
  await poolConnect;
  const { VentaID, Monto, MetodoPago, FechaPago } = req.body;
  const c = await pool.request().query('SELECT COUNT(*) total FROM Pagos');
  const PagoID = genIDPago(c.recordset[0].total + 1);

  await pool.request()
    .input('PagoID', sql.VarChar, PagoID)
    .input('VentaID', sql.VarChar, VentaID)
    .input('Monto', sql.Decimal(10,2), Number(Monto))
    .input('MetodoPago', sql.VarChar, MetodoPago)
    .input('FechaPago', sql.Date, FechaPago || new Date())
    .query('INSERT INTO Pagos(PagoID, VentaID, Monto, MetodoPago, FechaPago) VALUES(@PagoID,@VentaID,@Monto,@MetodoPago,@FechaPago)');

  res.redirect('/pagos');
});

router.get('/venta/:id', async (req,res)=>{
  await poolConnect;
  const { id } = req.params;
  const [cab, pagos] = await Promise.all([
    pool.request().input('id', sql.VarChar, id).query(`
      SELECT v.VentaID, v.MontoTotal, c.Nombre + ' ' + c.Apellido1 AS Cliente
      FROM Ventas v JOIN Clientes c ON c.ClienteID = v.ClienteID WHERE v.VentaID=@id
    `),
    pool.request().input('id', sql.VarChar, id).query(`
      SELECT PagoID, Monto, MetodoPago, FechaPago FROM Pagos WHERE VentaID=@id ORDER BY FechaPago DESC
    `)
  ]);
  const totalPagado = pagos.recordset.reduce((a,x)=>a + Number(x.Monto), 0);
  const saldo = Number(cab.recordset[0]?.MontoTotal || 0) - totalPagado;
  res.render('pagos_venta', { venta: cab.recordset[0], pagos: pagos.recordset, totalPagado, saldo });
});

module.exports = router;
