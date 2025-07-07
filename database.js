// === FILE: database.js (Phiên bản cuối cùng - Kết nối qua Public IP) ===

// Import thư viện dotenv chỉ khi chạy ở local để đọc file .env
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
const { Pool } = require('pg');

// Cấu hình duy nhất, luôn dùng IP để kết nối
const dbConfig = {
    host: process.env.DB_HOST,         // Sẽ đọc Public IP khi deploy, hoặc 127.0.0.1 khi chạy local
    port: process.env.DB_PORT || 5432, // Port mặc định của PostgreSQL
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // Khi kết nối qua Public IP từ Cloud Run, nên bật SSL
    ssl: {
        rejectUnauthorized: false
    }
};

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error('Lỗi kết nối database không mong muốn', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};