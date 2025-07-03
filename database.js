// ===================================
// === FILE: database.js (Đã cập nhật với parent_id) ===
// ===================================

// Import thư viện sqlite3
const sqlite3 = require('sqlite3').verbose();

// === THAY ĐỔI DUY NHẤT ĐỂ CHẠY TRÊN RENDER ===
// Ưu tiên lấy đường dẫn từ biến môi trường của Render, 
// nếu không có (tức là đang chạy ở máy bạn) thì dùng file "data.db" như cũ.
const DBSOURCE = process.env.DB_PATH || "data.db";

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
            
            // Lệnh SQL để tạo bảng 'products' với ĐẦY ĐỦ CÁC CỘT
            const productsTableSql = `
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY, 
                name_vi TEXT, 
                name_en TEXT, 
                collection_vi TEXT, 
                collection_en TEXT, 
                color_vi TEXT, 
                color_en TEXT,
                fabric_vi TEXT,
                fabric_en TEXT,
                wicker_vi TEXT,
                wicker_en TEXT,
                production_place TEXT,
                company TEXT, 
                customer TEXT, 
                specification TEXT, 
                material_vi TEXT, 
                material_en TEXT, 
                aluminum_profile TEXT,
                imageUrl TEXT,
                drawingUrl TEXT,
                materialsUrl TEXT,
                other_details TEXT,
                created_by_name TEXT,
                created_by_id INTEGER,
                parent_id TEXT,  /* <-- CỘT MỚI ĐÃ ĐƯỢC THÊM VÀO ĐÂY */
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;

            // Chạy lệnh tạo bảng 'products'
            db.run(productsTableSql, (err) => {
                if (err) {
                    console.error("Lỗi khi tạo bảng products:", err.message);
                } else {
                    console.log("Bảng 'products' đã sẵn sàng.");
                }
            });

            // Lệnh SQL để tạo bảng 'users'
            const usersTableSql = `
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                ho_ten TEXT NOT NULL, 
                ma_nhan_vien TEXT NOT NULL UNIQUE, 
                password TEXT NOT NULL, 
                is_approved INTEGER DEFAULT 0, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;

            // Chạy lệnh tạo bảng 'users'
            db.run(usersTableSql, (err) => {
                if (err) {
                    console.error("Lỗi khi tạo bảng users:", err.message);
                } else {
                    console.log("Bảng 'users' đã sẵn sàng.");
                }
            });

            // Lệnh SQL để tạo bảng 'reviews'
            const reviewsTableSql = `
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT NOT NULL,
                rating INTEGER NOT NULL,
                comment TEXT,
                author_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;

            // Chạy lệnh tạo bảng 'reviews'
            db.run(reviewsTableSql, (err) => {
                if (err) {
                    console.error("Lỗi khi tạo bảng reviews:", err.message);
                } else {
                    console.log("Bảng 'reviews' đã sẵn sàng.");
                }
            });
        });
    }
});

// Xuất (export) đối tượng 'db' để các file khác trong dự án có thể sử dụng
module.exports = db;