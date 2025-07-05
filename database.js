// ==========================================================
// === FILE: database.js (Cập nhật để dùng PostgreSQL) ===
// ==========================================================

// Import thư viện 'pg'
const { Pool } = require('pg');

// Cấu hình kết nối database
// Mã này sẽ đọc các biến môi trường mà bạn sẽ thiết lập trên Cloud Run
const dbConfig = {
    // Khi chạy trên Cloud Run, nó sẽ dùng kết nối an toàn qua Unix Socket.
    // Biến DB_CONNECTION_NAME sẽ được Google Cloud tự động cung cấp.
    host: `/cloudsql/${process.env.DB_CONNECTION_NAME}`,
    database: process.env.DB_NAME || 'postgres', // Tên database, mặc định là 'postgres'
    user: process.env.DB_USER || 'postgres',     // Tên user, mặc định là 'postgres'
    password: process.env.DB_PASSWORD,           // Mật khẩu sẽ được đọc từ biến môi trường
    ssl: {
        rejectUnauthorized: false // Cần thiết cho một số kết nối
    }
};

// Tuy nhiên, nếu bạn chạy ứng dụng trên máy tính của mình (không phải production)
// nó sẽ cần kết nối qua IP Public.
// (Phần này dành cho việc kiểm thử nâng cao, bạn có thể bỏ qua nếu chỉ deploy)
if (process.env.NODE_ENV !== 'production') {
    dbConfig.host = process.env.DB_HOST; // IP Public của Cloud SQL Instance
}


// Tạo một "pool" kết nối. Pool giúp quản lý nhiều kết nối đến database
// một cách hiệu quả, tái sử dụng kết nối khi có thể để tăng hiệu năng.
const pool = new Pool(dbConfig);

// Ghi log khi kết nối thành công
pool.on('connect', () => {
    console.log('Đã tạo kết nối tới database PostgreSQL trên Cloud SQL.');
});

// Ghi log khi có lỗi
pool.on('error', (err) => {
    console.error('Lỗi kết nối database không mong muốn', err);
    process.exit(-1);
});


// Xuất (export) một object duy nhất có phương thức là 'query'.
// Các file khác (như index.js) sẽ gọi db.query(...) để thực thi lệnh SQL.
// Cú pháp này giúp mã nguồn của bạn gọn gàng và dễ quản lý hơn.
module.exports = {
    query: (text, params) => pool.query(text, params),
};
