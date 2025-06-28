// ===================================
// === FILE: index.js (ĐÚNG 100%) ===
// ===================================
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const db = require('./database.js');
const app = express();

const saltRounds = 10;
const port = process.env.PORT || 3000;

// Middleware - Các công cụ hỗ trợ
app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- CÁC API ENDPOINTS ---

// API để lấy thông tin sản phẩm
app.get("/api/products/:id", (req, res) => {
    const sql = "SELECT * FROM products WHERE id = ?";
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(400).json({"error": err.message});
        }
        res.json(row || { message: "Không tìm thấy sản phẩm" });
    });
});

// API để thêm sản phẩm mới
app.post("/api/products", (req, res) => {
    const data = req.body;
    const sql = 'INSERT INTO products (id, name_vi, name_en, collection_vi, collection_en, company, customer, specification, material_vi, material_en, imageUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
    const params = [data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en, data.company, data.customer, data.specification, data.material_vi, data.material_en, data.imageUrl];
    db.run(sql, params, function (err) {
        if (err){
            return res.status(400).json({"error": err.message});
        }
        res.status(201).json({ "message": "success", "id": data.id });
    });
});

// === API ĐĂNG KÝ NHÂN VIÊN (ĐÚNG ĐỊA CHỈ) ===
app.post("/api/users/register", (req, res) => {
    const { ho_ten, ma_nhan_vien, password } = req.body;

    if (!ho_ten || !ma_nhan_vien || !password) {
        return res.status(400).json({"error": "Vui lòng điền đầy đủ thông tin."});
    }

    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            return res.status(500).json({"error": "Lỗi hệ thống khi xử lý mật khẩu."});
        }
        const sql = 'INSERT INTO users (ho_ten, ma_nhan_vien, password) VALUES (?,?,?)';
        const params = [ho_ten, ma_nhan_vien, hash];
        db.run(sql, params, function (err) {
            if (err) {
                return res.status(400).json({"error": "Mã nhân viên này đã tồn tại."});
            }
            res.status(201).json({ "message": "Đăng ký thành công, tài khoản đang chờ duyệt." });
        });
    });
});


// Khởi động server
app.listen(port, () => {
    console.log(`Server đang chạy tại địa chỉ http://localhost:${port}`);
});