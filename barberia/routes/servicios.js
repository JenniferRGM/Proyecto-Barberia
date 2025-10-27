// routes/servicios.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');             
const { sql, pool, poolConnect } = require('../db/connection');

// Asegura carpeta /public/uploads
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer (subida de imágenes)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const ok = /jpg|jpeg|png|webp|gif/i.test(path.extname(file.originalname));
    cb(ok ? null : new Error('Formato de imagen no permitido'), ok);
  }
});

function generarIDServicio(n) {
  return 'SER' + String(n).padStart(3, '0');
}

// MENÚ público
router.get('/menu', async (req, res) => {
  await poolConnect;
  const rs = await pool.request()
    .query(`SELECT ServicioID, Nombre, Descripcion, Precio, DuracionMinutos, Imagen
    FROM Servicios
    ORDER BY Nombre
  `);
  res.render('servicios_menu', { servicios: rs.recordset, titulo: 'Servicios' });
});

// API catálogo
router.get('/api', async (req, res) => {
  await poolConnect;
  const rs = await pool.request()
    .query(`SELECT ServicioID, Nombre, Descripcion, Precio, DuracionMinutos, Imagen
    FROM Servicios
    ORDER BY Nombre
  `);
  res.set('Cache-Control', 'no-store');
  res.json(rs.recordset);
});

// LISTA CRUD
router.get('/', async (req, res) => {
  await poolConnect;
  const rs = await pool.request().query(`
    SELECT ServicioID, Nombre, Descripcion, Precio, DuracionMinutos, Imagen
    FROM Servicios
    ORDER BY Nombre
  `);
  res.render('servicios', {
    servicios: rs.recordset,
    servicioEditar: null,
    titulo: 'Servicios',
    error: undefined,
    success: undefined
  });
});

// CARGAR PARA EDITAR
router.get('/editar/:id', async (req, res) => {
  await poolConnect;
  const [lista, sel] = await Promise.all([
    pool.request().query(`
      SELECT ServicioID, Nombre, Descripcion, Precio, DuracionMinutos, Imagen
      FROM Servicios
      ORDER BY Nombre
    `),
    pool.request()
      .input('id', sql.VarChar(10), req.params.id)
      .query(`
        SELECT ServicioID, Nombre, Descripcion, Precio, DuracionMinutos, Imagen
        FROM Servicios
        WHERE ServicioID = @id
      `)
  ]);

  res.render('servicios', {
    servicios: lista.recordset,
    servicioEditar: sel.recordset[0] || null,
    titulo: 'Servicios',
    error: undefined,
    success: undefined
  });
});

// AGREGAR (usa el name exacto del <input>: 'Imagen')
router.post('/agregar', upload.single('Imagen'), async (req, res) => {
  try {
    const { Nombre, Descripcion, Precio, DuracionMinutos } = req.body;
    await poolConnect;

    const maxRes = await pool.request().query(`
      SELECT ISNULL(MAX(CAST(SUBSTRING(ServicioID, 4, 10) AS INT)), 0) AS MaxNum
      FROM Servicios
      WHERE ServicioID LIKE 'SER%'
    `);
    const nextNum = maxRes.recordset[0].MaxNum + 1;
    const nuevoID = generarIDServicio(nextNum);

    const imagenPath = req.file ? `/uploads/${req.file.filename}` : null;

    await pool.request()
      .input('ServicioID', sql.VarChar(10), nuevoID)
      .input('Nombre', sql.VarChar(50), (Nombre ?? '').toString())
      .input('Descripcion', sql.VarChar(sql.MAX), (Descripcion ?? '').toString())
      .input('Precio', sql.Decimal(10, 2), parseFloat(Precio))
      .input('DuracionMinutos', sql.Int, parseInt(DuracionMinutos, 10))
      .input('Imagen', sql.VarChar(255), imagenPath)
      .query(`
        INSERT INTO Servicios (ServicioID, Nombre, Descripcion, Precio, DuracionMinutos, Imagen)
        VALUES (@ServicioID, @Nombre, @Descripcion, @Precio, @DuracionMinutos, @Imagen)
      `);

    res.redirect('/servicios');
  } catch (e) {
    console.error('Error al agregar servicio:', e);
    res.status(500).send('Error al agregar servicio');
  }
});

// EDITAR (también con multer)
router.post('/editar/:id', upload.single('Imagen'), async (req, res) => {
  try {
    const { id } = req.params;
    const { Nombre, Descripcion, Precio, DuracionMinutos } = req.body;
    await poolConnect;

    // Traer imagen actual
    const actual = await pool.request()
      .input('id', sql.VarChar(10), id)
      .query('SELECT Imagen FROM Servicios WHERE ServicioID=@id');

    const imagenAnterior = actual.recordset[0]?.Imagen || null;

    // Si suben una nueva, borro la anterior y uso la nueva;
    // si no, dejo la anterior
    let imagenFinal = imagenAnterior;
    if (req.file) {
      const nuevaWeb = `/uploads/${req.file.filename}`;

      // borrar archivo físico
      if (imagenAnterior) {
        const fullOld = path.join(__dirname, '..', 'public', imagenAnterior.replace(/^\//, ''));
        if (fs.existsSync(fullOld)) {
          try { fs.unlinkSync(fullOld); } catch (_) {}
        }
      }
      imagenFinal = nuevaWeb;
    }

    await pool.request()
      .input('ServicioID', sql.VarChar(10), id)
      .input('Nombre', sql.VarChar(50), (Nombre ?? '').toString())
      .input('Descripcion', sql.VarChar(sql.MAX), (Descripcion ?? '').toString())
      .input('Precio', sql.Decimal(10, 2), parseFloat(Precio))
      .input('DuracionMinutos', sql.Int, parseInt(DuracionMinutos, 10))
      .input('Imagen', sql.VarChar(255), imagenFinal)
      .query(`
        UPDATE Servicios
           SET Nombre=@Nombre,
               Descripcion=@Descripcion,
               Precio=@Precio,
               DuracionMinutos=@DuracionMinutos,
               Imagen=@Imagen
         WHERE ServicioID=@ServicioID
      `);

    res.redirect('/servicios');
  } catch (e) {
    console.error('Error al editar servicio:', e);
    res.status(500).send('Error al editar servicio');
  }
});

// ELIMINAR
router.post('/eliminar/:id', async (req, res) => {
  await poolConnect;

  // También borra la imagen física
  const img = await pool.request()
    .input('id', sql.VarChar(10), req.params.id)
    .query('SELECT Imagen FROM Servicios WHERE ServicioID=@id');
  const anterior = img.recordset[0]?.Imagen;
  if (anterior) {
    const full = path.join(__dirname, '..', 'public', anterior.replace(/^\//, ''));
    if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch (_) {} }
  }

  await pool.request()
    .input('id', sql.VarChar(10), req.params.id)
    .query('DELETE FROM Servicios WHERE ServicioID=@id');
  res.redirect('/servicios');
});

module.exports = router;
