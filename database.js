// === FILE: database.js (Phiên bản chỉnh sửa cho Localhost) ===

// Import thư viện dotenv chỉ khi chạy ở local để đọc file .env
// Giữ lại phần này nếu bạn muốn dùng file .env, nhưng cấu hình bên dưới sẽ ưu tiên
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
const { Pool } = require('pg');

// Cấu hình để kết nối tới database PostgreSQL trên máy local của bạn
// Hãy thay đổi các giá trị bên dưới cho phù hợp với cài đặt của bạn
const dbConfig = {
    host: 'localhost',               // Hầu hết trường hợp sẽ là 'localhost'
    port: 5432,                       // Port mặc định của PostgreSQL
    database: 'ten_database_cua_ban', // <-- QUAN TRỌNG: Thay bằng tên database bạn đã tạo
    user: 'postgres',                 // <-- QUAN TRỌNG: Thay bằng user của bạn (thường là 'postgres')
    password: 'mat_khau_cua_ban'     // <-- QUAN TRỌNG: Thay bằng mật khẩu bạn đã đặt cho user trên
    // Khi kết nối ở local thì không cần SSL
};

const pool = new Pool(dbConfig);

// Kiểm tra kết nối khi khởi động
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Lỗi kết nối tới cơ sở dữ liệu:', err.stack);
    }
    client.release();
    console.log('✅ Kết nối cơ sở dữ liệu PostgreSQL thành công!');
});

pool.on('error', (err) => {
    console.error('Lỗi kết nối database không mong muốn', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};