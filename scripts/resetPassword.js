// scripts/resetPassword.js
const bcrypt = require('bcrypt');
const { sql, pool, poolConnect } = require('../db/connection');

(async () => {
  try {
    await poolConnect;
    const nueva = 'Jenny1992*'; // >= 8 chars
    const hash = await bcrypt.hash(nueva, 10);
    await pool.request()
      .input('hash', sql.VarBinary(128), Buffer.from(hash))
      .input('user', sql.VarChar(30), 'Jenny')
      .query('UPDATE Usuarios SET Contrasena=@hash WHERE NombreUsuario=@user');
    console.log('OK: contraseña actualizada.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();

//Para resetear la contraseña de un usuario
// usar node scripts/resetPassword.js
