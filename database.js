// === FILE: database.js (PHIÊN BẢN CHO SIDECAR PROXY) ===

require('dotenv').config(); // Vẫn giữ để chạy local
const { Pool } = require('pg');

// Luôn kết nối tới localhost vì proxy sẽ luôn chạy bên cạnh
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: false // Luôn tắt SSL khi kết nối tới proxy
};

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error('Lỗi kết nối database không mong muốn', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};