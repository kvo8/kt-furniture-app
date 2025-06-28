const sqlite3 = require('sqlite3').verbose();
const DBSOURCE = "data.db";

const db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Đã kết nối tới database SQLite.');
        const sql = `
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
        db.run(sql, (err) => {
            if (err) {
                // Bảng đã tồn tại
            } else {
                console.log("Bảng 'products' đã sẵn sàng.");
            }
        });
    }
});

module.exports = db;