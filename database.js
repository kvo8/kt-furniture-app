// === FILE: database.js (PHIÊN BẢN CUỐI CÙNG) ===

require('dotenv').config();
const { Pool } = require('pg');

let dbConfig;

// Nếu đang chạy trên môi trường Cloud Run
if (process.env.K_SERVICE) {
    console.log("Đang chạy trên môi trường Cloud Run. Dùng kết nối qua Socket.");
    dbConfig = {
        host: `/cloudsql/${process.env.DB_CONNECTION_NAME}`,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false }
    };
} else {
    // Nếu đang chạy ở máy tính local
    console.log("Đang chạy trên môi trường local. Dùng kết nối qua TCP.");
    dbConfig = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        // === SỬA LỖI Ở ĐÂY: Thêm dòng này để tắt SSL khi chạy local ===
        ssl: false
    };
}

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error('Lỗi kết nối database không mong muốn', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};