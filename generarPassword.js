const bcrypt = require('bcrypt');

async function generarHash() {
  try {
    const hashed = await bcrypt.hash('admin123', 10);
    console.log('Hash generado:', hashed);
  } catch (err) {
    console.error('Error al generar el hash:', err);
  }
}

generarHash();
