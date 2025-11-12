const sql = require('mssql');

const config = {
  user: 'admin_barberia',
  password: 'barberia90',
  server: 'LAPTOP-TST07H1E\\SQLEXPRESS',
  database: 'Barberia',
  options: {
    trustServerCertificate: true
  }
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect().catch(err => {
  console.error('❌ Error al conectar a SQL Server:', err.message);
});

module.exports = { sql, pool, poolConnect };
