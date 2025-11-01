// routes/reportes.js
const express = require('express');
const router = express.Router();
const { sql, pool, poolConnect } = require('../db/connection');

function parseRange(q) {
  const defEnd = new Date();
  const defStart = new Date(); defStart.setDate(defEnd.getDate() - 30);
  const from = q.desde ? new Date(q.desde) : defStart;
  const to   = q.hasta ? new Date(q.hasta) : defEnd;
  return { desde: from, hasta: to };
}

// CSV helper
function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => esc(r[h])).join(','));
  return lines.join('\n');
}

// =============== Página de reportes ===============
router.get('/', async (req, res) => {
  await poolConnect;

  const { desde, hasta } = parseRange(req.query);
  const hastaMasUno = new Date(hasta); hastaMasUno.setDate(hastaMasUno.getDate() + 1);

  const cid = (req.query.cliente || '').trim() || null;   // ClienteID (opcional)
  const bid = (req.query.barbero || '').trim() || null;   // BarberoID (solo aplica a Citas)

  try {
    // Catálogos para filtros
    const [clientesOpt, barberosOpt] = await Promise.all([
      pool.request().query(`
        SELECT ClienteID, (Nombre + ' ' + Apellido1) AS Nombre
        FROM Clientes WHERE Estado='A' ORDER BY Nombre, Apellido1
      `),
      pool.request().query(`
        SELECT BarberoID, (Nombre + ' ' + Apellido1) AS Nombre
        FROM Barberos WHERE Estado='A' ORDER BY Nombre, Apellido1
      `)
    ]);

    
    const R = () => pool.request()
      .input('d', sql.Date, desde)
      .input('h', sql.Date, hastaMasUno)
      .input('cid', sql.VarChar(15), cid);

    const kpisQ = R().query(`
      SELECT 
        COUNT(*) AS TotalVentas,
        ISNULL(SUM(MontoTotal),0) AS MontoTotal,
        CAST(CASE WHEN COUNT(*)=0 THEN 0 ELSE ISNULL(SUM(MontoTotal),0)*1.0/COUNT(*) END AS DECIMAL(10,2)) AS TicketPromedio
      FROM Ventas
      WHERE FechaVenta >= @d AND FechaVenta < @h
        AND (@cid IS NULL OR ClienteID=@cid)
    `);

    const porDiaQ = R().query(`
      SELECT CONVERT(date, FechaVenta) AS Dia, SUM(MontoTotal) AS Total
      FROM Ventas
      WHERE FechaVenta >= @d AND FechaVenta < @h
        AND (@cid IS NULL OR ClienteID=@cid)
      GROUP BY CONVERT(date, FechaVenta)
      ORDER BY Dia
    `);

    const topServQ = R().query(`
      SELECT TOP 5 s.Nombre AS Nombre, SUM(d.Subtotal) AS Total
      FROM DetalleVentas d
      JOIN Ventas v ON v.VentaID = d.VentaID
      JOIN Servicios s ON s.ServicioID = d.ServicioID
      WHERE v.FechaVenta >= @d AND v.FechaVenta < @h
        AND (@cid IS NULL OR v.ClienteID=@cid)
      GROUP BY s.Nombre
      ORDER BY Total DESC
    `);

    const topProdQ = R().query(`
      SELECT TOP 5 p.Nombre AS Nombre, SUM(d.Subtotal) AS Total, SUM(d.Cantidad) AS Cantidad
      FROM DetalleVentas d
      JOIN Ventas v ON v.VentaID = d.VentaID
      JOIN InventarioProductos p ON p.ProductoID = d.ProductoID
      WHERE v.FechaVenta >= @d AND v.FechaVenta < @h
        AND (@cid IS NULL OR v.ClienteID=@cid)
      GROUP BY p.Nombre
      ORDER BY Total DESC
    `);

    // Citas por estado (filtro por barbero y opcional por cliente)
    const citasQ = pool.request()
      .input('d', sql.Date, desde)
      .input('h', sql.Date, hastaMasUno)
      .input('bid', sql.VarChar(15), bid)
      .input('cid', sql.VarChar(15), cid)
      .query(`
        SELECT Estado, COUNT(*) AS Cnt
        FROM Citas
        WHERE Fecha >= @d AND Fecha < @h
          AND (@bid IS NULL OR BarberoID=@bid)
          AND (@cid IS NULL OR ClienteID=@cid)
        GROUP BY Estado
      `);

    const stockQ = pool.request().query(`
      SELECT TOP 10 ProductoID, Nombre, StockActual, StockMinimo
      FROM InventarioProductos
      WHERE StockActual <= StockMinimo
      ORDER BY (StockActual - StockMinimo) ASC, Nombre
    `);

    let bitacora = [];
    try {
      const b = await pool.request().query(`
        IF OBJECT_ID('dbo.Bitacora') IS NOT NULL
          SELECT TOP 50 * FROM dbo.Bitacora ORDER BY Fecha DESC;
        ELSE
          SELECT TOP 0 * FROM (VALUES (1)) AS x(i);
      `);
      bitacora = b.recordset;
    } catch (_) {}

    const [kpis, porDia, topServ, topProd, citas, stock] = await Promise.all([
      kpisQ, porDiaQ, topServQ, topProdQ, citasQ, stockQ
    ]);

    res.render('reportes', {
      titulo: 'Reportes',
      desde, hasta,
      clienteSel: cid, barberoSel: bid,
      clientesOpt: clientesOpt.recordset,
      barberosOpt: barberosOpt.recordset,
      kpis: kpis.recordset[0] || { TotalVentas: 0, MontoTotal: 0, TicketPromedio: 0 },
      porDia: porDia.recordset,
      topServ: topServ.recordset,
      topProd: topProd.recordset,
      citas: citas.recordset,
      stock: stock.recordset,
      bitacora
    });

  } catch (e) {
    console.error('Error en /reportes:', e);
    res.status(500).send('Error al cargar reportes');
  }
});

// =============== Exportaciones CSV ===============
router.get('/export/csv', async (req, res) => {
  await poolConnect;
  const { tipo } = req.query; // 'porDia' | 'detalle' | 'citas'
  const { desde, hasta } = parseRange(req.query);
  const hastaMasUno = new Date(hasta); hastaMasUno.setDate(hastaMasUno.getDate() + 1);
  const cid = (req.query.cliente || '').trim() || null;
  const bid = (req.query.barbero || '').trim() || null;

  try {
    let rows = [];
    if (tipo === 'porDia') {
      const r = await pool.request()
        .input('d', sql.Date, desde).input('h', sql.Date, hastaMasUno).input('cid', sql.VarChar(15), cid)
        .query(`
          SELECT CONVERT(date, FechaVenta) AS Dia, SUM(MontoTotal) AS Total
          FROM Ventas
          WHERE FechaVenta >= @d AND FechaVenta < @h
            AND (@cid IS NULL OR ClienteID=@cid)
          GROUP BY CONVERT(date, FechaVenta)
          ORDER BY Dia
        `);
      rows = r.recordset;
    } else if (tipo === 'detalle') {
      
      const r = await pool.request()
        .input('d', sql.Date, desde).input('h', sql.Date, hastaMasUno).input('cid', sql.VarChar(15), cid)
        .query(`
          SELECT v.VentaID, v.FechaVenta, v.Cliente,
                 ISNULL(v.ServicioNombre, v.ProductoNombre) AS Concepto,
                 v.Cantidad, v.PrecioUnitario, v.Subtotal
          FROM vw_VentasDetalle v
          WHERE v.FechaVenta >= @d AND v.FechaVenta < @h
            AND (@cid IS NULL OR v.ClienteID=@cid)
          ORDER BY v.FechaVenta, v.VentaID
        `);
      rows = r.recordset;
    } else if (tipo === 'citas') {
      const r = await pool.request()
        .input('d', sql.Date, desde).input('h', sql.Date, hastaMasUno)
        .input('bid', sql.VarChar(15), bid).input('cid', sql.VarChar(15), cid)
        .query(`
          SELECT Estado, COUNT(*) AS Cantidad
          FROM Citas
          WHERE Fecha >= @d AND Fecha < @h
            AND (@bid IS NULL OR BarberoID=@bid)
            AND (@cid IS NULL OR ClienteID=@cid)
          GROUP BY Estado
          ORDER BY Estado
        `);
      rows = r.recordset;
    } else {
      return res.status(400).send('Tipo inválido');
    }

    const csv = toCSV(rows);
    const filename = `reporte_${tipo}_${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    console.error('CSV export error:', e);
    res.status(500).send('No se pudo exportar CSV');
  }
});

module.exports = router;

