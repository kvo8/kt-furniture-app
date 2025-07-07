// === FILE: database.js (PHIÊN BẢN HOÀN CHỈNH CUỐI CÙNG) ===

// Import thư viện dotenv chỉ khi chạy ở local để đọc file .env
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
const { Pool } = require('pg');

let dbConfig;

// Nếu đang chạy trên môi trường Cloud Run (Google tự tạo biến này)
if (process.env.K_SERVICE) {
    console.log("Phát hiện môi trường Cloud Run. Dùng kết nối qua Socket.");
    dbConfig = {
        // Kết nối an toàn qua Unix Socket
        host: `/cloudsql/${process.env.DB_CONNECTION_NAME}`,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false }
    };
} else {
    // Nếu đang chạy ở máy tính local để gỡ lỗi
    console.log("Phát hiện môi trường Local. Dùng kết nối qua TCP (Proxy).");
    dbConfig = {
        host: process.env.DB_HOST,     // Sẽ đọc là '127.0.0.1' từ file .env
        port: process.env.DB_PORT,     // Sẽ đọc là 5432 từ file .env
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: false // Tắt SSL khi kết nối tới proxy ở local
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