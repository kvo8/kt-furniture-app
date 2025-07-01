// ==========================================================
// === FILE: index.js (GIỮ NGUYÊN CODE CỦA BẠN VÀ THÊM TÍNH NĂNG) ===
// ==========================================================

// --- 1. IMPORT CÁC THƯ VIỆN ---
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const db = require('./database.js');

const app = express();
const saltRounds = 10;
const port = process.env.PORT || 3000;

// --- 2. CẤU HÌNH MIDDLEWARE (THEO ĐÚNG CẤU TRÚC CỦA BẠN) ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 

app.use(session({
    secret: 'mot-chuoi-bi-mat-rat-an-toan-va-duy-nhat-final-version',
    resave: false,
    saveUninitialized: false, // Để false là tốt nhất
    cookie: { 
        secure: false, 
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    } 
}));

// Cấu hình Multer để xử lý ĐA upload (Bản vẽ, Vật tư, Hình ảnh)
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/uploads/') },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)) }
});
const upload = multer({ storage: storage }).fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'drawingFile', maxCount: 1 },
    { name: 'materialsFile', maxCount: 1 }
]);

// Middleware "Người gác cổng"
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

// --- 3. CÁC API ENDPOINTS ---

// === A. CÁC API CÔNG KHAI ===

// API Đăng ký và tự động đăng nhập (Giữ nguyên code của bạn)
app.post("/api/users/register", (req, res) => {
    const { ho_ten, ma_nhan_vien, password } = req.body;
    if (!ho_ten || !ma_nhan_vien || !password) {
        return res.status(400).json({"error": "Vui lòng điền đầy đủ thông tin."});
    }
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) return res.status(500).json({"error": "Lỗi hệ thống."});
        const sql = 'INSERT INTO users (ho_ten, ma_nhan_vien, password) VALUES (?,?,?)';
        const params = [ho_ten, ma_nhan_vien, hash];
        db.run(sql, params, function (err) {
            if (err) return res.status(400).json({"error": "Mã nhân viên này đã tồn tại."});
            req.session.user = { id: this.lastID, name: ho_ten, employeeId: ma_nhan_vien };
            res.status(201).json({ "message": "Đăng ký thành công và đã tự động đăng nhập." });
        });
    });
});

// API Đăng nhập (Giữ nguyên code của bạn)
app.post("/api/users/login", (req, res) => {
    const { ma_nhan_vien, password } = req.body;
    const sql = "SELECT * FROM users WHERE ma_nhan_vien = ?";
    db.get(sql, [ma_nhan_vien], (err, user) => {
        if (err) return res.status(500).json({"error": "Lỗi server"});
        if (!user) return res.status(401).json({"error": "Mã nhân viên hoặc mật khẩu không đúng."});
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) return res.status(500).json({"error": "Lỗi server khi xác thực"});
            if (isMatch) {
                req.session.user = { id: user.id, name: user.ho_ten, employeeId: user.ma_nhan_vien };
                res.json({ "message": "Đăng nhập thành công" });
            } else {
                res.status(401).json({"error": "Mã nhân viên hoặc mật khẩu không đúng."});
            }
        });
    });
});

// API lấy thông tin 1 sản phẩm công khai, có gộp cả đánh giá (Nâng cấp)
// === Thay thế API GET /api/products/:id cũ ===
// === THAY THẾ API GET /api/products/:id CŨ BẰNG PHIÊN BẢN NÀY ===
app.get("/api/products/:id", (req, res) => {
    const requestedId = req.params.id;

    const findProductSql = "SELECT * FROM products WHERE id = ?";
    db.get(findProductSql, [requestedId], (err, product) => {
        if (err) return res.status(400).json({ "error": err.message });
        if (!product) return res.status(404).json({ error: "Sản phẩm không tồn tại" });

        if (product.parent_id) {
            // Nếu là sản phẩm "con", tìm thông tin của sản phẩm "cha"
            db.get(findProductSql, [product.parent_id], (err, parentProduct) => {
                if (err) return res.status(400).json({ "error": err.message });
                // Trả về thông tin của cha, nhưng thêm vào mã của con đã được quét
                res.json({ ...parentProduct, reviews: [], scanned_id: requestedId });
            });
        } else {
            // Nếu là sản phẩm "cha", lấy thêm thông tin review của nó
            const reviewsSql = "SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC";
            db.all(reviewsSql, [requestedId], (err, reviews) => {
                if (err) return res.status(400).json({ "error": err.message });
                // Trả về thông tin của chính nó, kèm theo reviews
                res.json({ ...product, reviews: reviews });
            });
        }
    });
});
// API để khách hàng gửi đánh giá mới
app.post("/api/products/:id/reviews", (req, res) => {
    const { rating, comment, author_name } = req.body;
    const sql = 'INSERT INTO reviews (product_id, rating, comment, author_name) VALUES (?,?,?,?)';
    const params = [req.params.id, rating, comment, author_name || 'Khách'];
    db.run(sql, params, function (err) {
        if (err){ return res.status(400).json({"error": err.message}); }
        res.status(201).json({ "message": "Gửi đánh giá thành công! Cảm ơn bạn." });
    });
});


// === B. CÁC API CẦN BẢO VỆ (PHẢI ĐĂNG NHẬP MỚI DÙNG ĐƯỢC) ===

// API để kiểm tra phiên đăng nhập
app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

// API lấy danh sách tất cả sản phẩm
app.get("/api/products", isLoggedIn, (req, res) => {
    const sql = "SELECT * FROM products ORDER BY created_at DESC";
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(400).json({"error": err.message});
        res.json({ products: rows });
    });
});

// API thêm sản phẩm mới (sửa lại để nhận nhiều file)
// === Thay thế API POST /api/products cũ ===
app.post("/api/products", isLoggedIn, upload, (req, res) => {
    const data = req.body;
    const user = req.session.user;

    const imageUrl = req.files['productImage'] ? '/uploads/' + req.files['productImage'][0].filename : '';
    const drawingUrl = req.files['drawingFile'] ? '/uploads/' + req.files['drawingFile'][0].filename : '';
    const materialsUrl = req.files['materialsFile'] ? '/uploads/' + req.files['materialsFile'][0].filename : '';

    const sql = `
        INSERT INTO products (
            id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en, 
            fabric_vi, fabric_en, wicker_vi, wicker_en, production_place,
            company, customer, specification, material_vi, material_en, aluminum_profile, 
            imageUrl, drawingUrl, materialsUrl, other_details,
            created_by_name, created_by_id, parent_id /* Thêm cột mới */
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) /* Thêm một dấu ? */
    `;
    
    const params = [
        data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en,
        data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
        data.production_place, data.company, data.customer, data.specification,
        data.material_vi, data.material_en, data.aluminum_profile, imageUrl,
        drawingUrl, materialsUrl, data.other_details,
        user.name, user.id, data.parent_id // Thêm parent_id vào đây
    ];
    
    db.run(sql, params, function (err) {
        if (err){ return res.status(400).json({"error": err.message}); }
        res.status(201).json({ "message": "Lưu sản phẩm thành công!", "id": data.id });
    });
});

// API xóa sản phẩm
app.delete("/api/products/:id", isLoggedIn, (req, res) => {
    const sql = 'DELETE FROM products WHERE id = ?';
    db.run(sql, req.params.id, function (err) {
        if (err) return res.status(400).json({"error": err.message});
        res.json({ "message": "deleted", changes: this.changes });
    });
});

// API để cập nhật (SỬA) một sản phẩm
app.put("/api/products/:id", isLoggedIn, upload, (req, res) => {
    const data = req.body;
    let imageUrl = req.files['productImage'] ? '/uploads/' + req.files['productImage'][0].filename : data.existingImageUrl;
    let drawingUrl = req.files['drawingFile'] ? '/uploads/' + req.files['drawingFile'][0].filename : data.existingDrawingUrl;
    let materialsUrl = req.files['materialsFile'] ? '/uploads/' + req.files['materialsFile'][0].filename : data.existingMaterialsUrl;

    const sql = `
        UPDATE products SET name_vi = ?, name_en = ?, collection_vi = ?, collection_en = ?, color_vi = ?, color_en = ?, fabric_vi = ?, fabric_en = ?, wicker_vi = ?, wicker_en = ?, production_place = ?, company = ?, customer = ?, specification = ?, material_vi = ?, material_en = ?, aluminum_profile = ?, imageUrl = ?, drawingUrl = ?, materialsUrl = ?, other_details = ? WHERE id = ?
    `;
    const params = [
        data.name_vi, data.name_en, data.collection_vi, data.collection_en, data.color_vi, data.color_en,
        data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en, data.production_place,
        data.company, data.customer, data.specification, data.material_vi, data.material_en,
        data.aluminum_profile, imageUrl, drawingUrl, materialsUrl, data.other_details,
        req.params.id
    ];
    
    db.run(sql, params, function (err) {
        if (err) { return res.status(400).json({ "error": err.message }); }
        res.json({ "message": "Cập nhật sản phẩm thành công!", "id": req.params.id });
    });
});

// --- 4. KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    console.log(`Server đang chạy tại địa chỉ http://localhost:${port}`);
});