// Import thư viện sqlite3
const sqlite3 = require('sqlite3').verbose();

// Tên file database. Nó sẽ tự được tạo ra trong thư mục dự án.
const DBSOURCE = "data.db";

// Tạo và mở kết nối đến database
const db = new sqlite3.Database(DBSOURCE, (err) => {
    // Nếu có lỗi khi kết nối
    if (err) {
      console.error(err.message);
      throw err;
    } 
    // Nếu kết nối thành công
    else {
        console.log('Đã kết nối tới database SQLite.');
        
        // Sử dụng db.serialize để đảm bảo các lệnh được thực thi tuần tự
        db.serialize(() => {
            // Lệnh SQL để tạo bảng 'products'
            const createProductsTableSql = `
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name_vi TEXT,
                name_en TEXT,
                collection_vi TEXT,
                collection_en TEXT,
                company TEXT,
                customer TEXT,
                specification TEXT,
                material_vi TEXT,
                material_en TEXT,
                imageUrl TEXT
            )`;

            // Chạy lệnh tạo bảng 'products'
            db.run(createProductsTableSql, (err) => {
                if (err) {
                    // Nếu có lỗi, ví dụ bảng đã tồn tại với cấu trúc khác
                    console.error("Lỗi khi tạo bảng products:", err.message);
                } else {
                    console.log("Bảng 'products' đã sẵn sàng.");
                }
            });

            // Lệnh SQL để tạo bảng 'users'
            const createUserTableSql = `
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ho_ten TEXT NOT NULL,
                ma_nhan_vien TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                is_approved INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;

            // Chạy lệnh tạo bảng 'users'
            db.run(createUserTableSql, (err) => {
                if (err) {
                    console.error("Lỗi khi tạo bảng users:", err.message);
                } else {
                    console.log("Bảng 'users' đã sẵn sàng.");
                }
            });
        });
    }
});

// Xuất (export) đối tượng 'db' để các file khác trong dự án có thể sử dụng
module.exports = db;