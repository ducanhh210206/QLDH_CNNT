const mysql = require('mysql2/promise');
const fs = require('node:fs');

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'mysql-7b63f20-qldh-demo.b.aivencloud.com', port: 14586,
      database: 'order_management', user: process.env.OMDRS_DIAG_USER,
      password: process.env.OMDRS_DIAG_PASSWORD, connectTimeout: 5000,
      ssl: { rejectUnauthorized: true, verifyIdentity: true, ca: fs.readFileSync(process.env.OMDRS_DIAG_CA, 'utf8') }
    });
    const [rows] = await connection.query("SELECT CURRENT_USER() AS user_name, @@server_uuid AS server_uuid, (SELECT COUNT(*) FROM schema_migrations WHERE version='005_product_edit') AS migration_ok");
    console.log('KET_NOI_THANH_CONG');
    console.log('Tai khoan: ' + rows[0].user_name);
    console.log('UUID: ' + rows[0].server_uuid);
    console.log('Migration 005: ' + rows[0].migration_ok);
  } catch (error) {
    console.log('KET_NOI_THAT_BAI');
    console.log('Ma loi: ' + (/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'UNKNOWN'));
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
})();
