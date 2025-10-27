// routes/productos.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { sql, pool, poolConnect } = require('../db/connection');

// --- uploads (opcional imagen) ---
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
  fileFilter: (_, file, cb) => {
    const ok = /jpg|jpeg|png|webp|gif$/i.test(path.extname(file.originalname));
    cb(ok ? null : new Error('Formato de imagen no permitido'), ok);
  },
});

// Genera IDs PRD001, PRD002...
function genID(n) {
  return 'PRD' + String(n).padStart(3, '0');
}
function toNum(v, digits = 2) {
  const n = Number(v);
  return isFinite(n) ? Number(n.toFixed(digits)) : 0;
}
function toInt(v) {
  const n = parseInt(v, 10);
  return isFinite(n) ? n : 0;
}
function toDateOrNull(v) {
  return v ? v : null; // acepta 'YYYY-MM-DD' o null
}

// ================= LISTAR (CRUD) =================
router.get('/', async (req, res) => {
  try {
    await poolConnect;
    const rs = await pool.request().query(`
      SELECT ProductoID, Nombre, Marca, Descripcion, PrecioVenta, Costo,
             StockActual, StockMinimo, FechaEntrada, FechaSalida, Imagen
      FROM InventarioProductos
      ORDER BY Nombre
    `);
    res.render('productos', { productos: rs.recordset });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error al listar productos');
  }
});

// ================= FORM NUEVO ====================
router.get('/nuevo', (_req, res) => {
  res.render('producto_form', { prod: null });
});

// ================= CREAR =========================
router.post('/nuevo', upload.single('Imagen'), async (req, res) => {
  try {
    await poolConnect;

    const {
      Nombre, Marca, Descripcion,
      PrecioVenta, Costo, StockActual, StockMinimo,
      FechaEntrada, FechaSalida
    } = req.body;

    // ID robusto
    const { recordset } = await pool.request().query(`
      SELECT ISNULL(MAX(CAST(SUBSTRING(ProductoID, 4, 10) AS INT)), 0) AS MaxNum
      FROM InventarioProductos
      WHERE ProductoID LIKE 'PRD%'
    `);
    const ProductoID = genID(recordset[0].MaxNum + 1);

    const imagenPath = req.file ? `/uploads/${req.file.filename}` : null;

    await pool.request()
      .input('ProductoID',   sql.VarChar(10), ProductoID)
      .input('Nombre',       sql.VarChar(50), (Nombre ?? '').toString())
      .input('Marca',        sql.VarChar(30), (Marca ?? '').toString())
      .input('Descripcion',  sql.VarChar(100), (Descripcion ?? '').toString())
      .input('PrecioVenta',  sql.Decimal(10,2), toNum(PrecioVenta))
      .input('Costo',        sql.Decimal(10,2), toNum(Costo))
      .input('StockActual',  sql.Int, toInt(StockActual))
      .input('StockMinimo',  sql.Int, toInt(StockMinimo))
      .input('FechaEntrada', sql.Date, toDateOrNull(FechaEntrada) || new Date())
      .input('FechaSalida',  sql.Date, toDateOrNull(FechaSalida))
      .input('Imagen',       sql.VarChar(255), imagenPath)
      .query(`
        INSERT INTO InventarioProductos
        (ProductoID, Nombre, Marca, Descripcion, PrecioVenta, Costo,
         StockActual, StockMinimo, FechaEntrada, FechaSalida, Imagen)
        VALUES
        (@ProductoID, @Nombre, @Marca, @Descripcion, @PrecioVenta, @Costo,
         @StockActual, @StockMinimo, @FechaEntrada, @FechaSalida, @Imagen)
      `);

    res.redirect('/productos');
  } catch (e) {
    console.error(e);
    res.status(500).send('Error al crear producto');
  }
});

// ================= FORM EDITAR ===================
router.get('/editar/:id', async (req, res) => {
  try {
    await poolConnect;
    const { id } = req.params;
    const rs = await pool.request().input('id', sql.VarChar(10), id)
      .query('SELECT * FROM InventarioProductos WHERE ProductoID = @id');
    res.render('producto_form', { prod: rs.recordset[0] || null });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error al cargar producto');
  }
});

// ================= EDITAR ========================
router.post('/editar/:id', upload.single('Imagen'), async (req, res) => {
  try {
    await poolConnect;
    const { id } = req.params;
    const {
      Nombre, Marca, Descripcion,
      PrecioVenta, Costo, StockActual, StockMinimo,
      FechaEntrada, FechaSalida
    } = req.body;

    // imagen actual
    const act = await pool.request()
      .input('id', sql.VarChar(10), id)
      .query('SELECT Imagen FROM InventarioProductos WHERE ProductoID=@id');

    const anterior = act.recordset[0]?.Imagen || null;
    let imagenFinal = anterior;

    if (req.file) {
      const nueva = `/uploads/${req.file.filename}`;
      // borra archivo anterior
      if (anterior) {
        const fullOld = path.join(__dirname, '..', 'public', anterior.replace(/^\//, ''));
        if (fs.existsSync(fullOld)) { try { fs.unlinkSync(fullOld); } catch(_){} }
      }
      imagenFinal = nueva;
    }

    await pool.request()
      .input('ProductoID',   sql.VarChar(10), id)
      .input('Nombre',       sql.VarChar(50), (Nombre ?? '').toString())
      .input('Marca',        sql.VarChar(30), (Marca ?? '').toString())
      .input('Descripcion',  sql.VarChar(100), (Descripcion ?? '').toString())
      .input('PrecioVenta',  sql.Decimal(10,2), toNum(PrecioVenta))
      .input('Costo',        sql.Decimal(10,2), toNum(Costo))
      .input('StockActual',  sql.Int, toInt(StockActual))
      .input('StockMinimo',  sql.Int, toInt(StockMinimo))
      .input('FechaEntrada', sql.Date, toDateOrNull(FechaEntrada) || new Date())
      .input('FechaSalida',  sql.Date, toDateOrNull(FechaSalida))
      .input('Imagen',       sql.VarChar(255), imagenFinal)
      .query(`
        UPDATE InventarioProductos
           SET Nombre=@Nombre, Marca=@Marca, Descripcion=@Descripcion,
               PrecioVenta=@PrecioVenta, Costo=@Costo,
               StockActual=@StockActual, StockMinimo=@StockMinimo,
               FechaEntrada=@FechaEntrada, FechaSalida=@FechaSalida,
               Imagen=@Imagen
         WHERE ProductoID=@ProductoID
      `);

    res.redirect('/productos');
  } catch (e) {
    console.error(e);
    res.status(500).send('Error al actualizar producto');
  }
});

// ================= ELIMINAR ======================
router.post('/eliminar/:id', async (req, res) => {
  try {
    await poolConnect;
    const { id } = req.params;

    // referenciado por ventas
    const ref = await pool.request()
      .input('id', sql.VarChar(10), id)
      .query('SELECT TOP 1 1 FROM DetalleVentas WHERE ProductoID=@id');
    if (ref.recordset.length) {
      return res.status(400).send('No se puede eliminar: el producto tiene ventas asociadas.');
    }

    // borra imagen física si existe
    const img = await pool.request().input('id', sql.VarChar(10), id)
      .query('SELECT Imagen FROM InventarioProductos WHERE ProductoID=@id');
    const anterior = img.recordset[0]?.Imagen;
    if (anterior) {
      const full = path.join(__dirname, '..', 'public', anterior.replace(/^\//, ''));
      if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch(_){} }
    }

    await pool.request().input('id', sql.VarChar(10), id)
      .query('DELETE FROM InventarioProductos WHERE ProductoID = @id');

    res.redirect('/productos');
  } catch (e) {
    console.error(e);
    res.status(500).send('Error al eliminar producto');
  }
});

// ===== JSON simple (otras páginas pueden consumirlo) =====
router.get('/json', async (_req, res) => {
  await poolConnect;
  const rs = await pool.request().query(`
    SELECT ProductoID, Nombre, PrecioVenta AS Precio, StockActual, Imagen
    FROM InventarioProductos
    ORDER BY Nombre
  `);
  res.set('Cache-Control', 'no-store');
  res.json(rs.recordset);
});

// ===== Menú público (cards) y API para refrescar =====
router.get('/menu', async (_req, res) => {
  await poolConnect;
  const rs = await pool.request().query(`
    SELECT ProductoID, Nombre, Descripcion, PrecioVenta AS Precio, StockActual, Imagen
    FROM InventarioProductos
    ORDER BY Nombre
  `);
  res.render('productos_menu', { productos: rs.recordset, titulo: 'Productos' });
});

router.get('/api', async (_req, res) => {
  await poolConnect;
  const rs = await pool.request().query(`
    SELECT ProductoID, Nombre, Descripcion, PrecioVenta AS Precio, StockActual, Imagen
    FROM InventarioProductos
    ORDER BY Nombre
  `);
  res.set('Cache-Control', 'no-store');
  res.json(rs.recordset);
});

module.exports = router;

