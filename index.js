// ==========================================================
// === FILE: index.js (FINAL VERSION - FULL) ===
// ==========================================================

// --- PHẦN 1: IMPORT CÁC THƯ VIỆN CẦN THIẾT ---
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const db = require('./database.js');

// --- PHẦN 2: KHỞI TẠO VÀ CẤU HÌNH EXPRESS APP ---
const app = express();
const saltRounds = 10;
const port = process.env.PORT || 3000;

// --- 2.1. Cấu hình Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- 2.2. Cấu hình Session ---
app.use(session({
    secret: 'mot-chuoi-bi-mat-rat-an-toan-va-duy-nhat-final-version',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 
    } 
}));

// --- 2.3. Cấu hình Multer để Upload File ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/uploads/') },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)) }
});
const upload = multer({ storage: storage }).fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'drawingFile', maxCount: 1 },
    { name: 'materialsFile', maxCount: 1 }
]);

// --- 2.4. Middleware "Người Gác Cổng" Kiểm Tra Đăng Nhập ---
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

// --- PHẦN 3: CÁC API ENDPOINTS ---

// === A. CÁC API CÔNG KHAI ===
app.post("/api/users/register", (req, res) => {
    const { ho_ten, ma_nhan_vien, password } = req.body;
    if (!ho_ten || !ma_nhan_vien || !password) return res.status(400).json({"error": "Vui lòng điền đầy đủ thông tin."});
    
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

app.get("/api/products/:id", (req, res) => {
    const sql = "SELECT * FROM products WHERE id = ?";
    db.get(sql, [req.params.id], (err, product) => {
        if (err) return res.status(400).json({ "error": err.message });
        if (!product) return res.status(404).json({ error: "Sản phẩm không tồn tại" });
        res.json(product);
    });
});

// === B. CÁC API CẦN BẢO VỆ ===
app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

app.get("/api/products", isLoggedIn, (req, res) => {
    const sql = "SELECT * FROM products ORDER BY created_at DESC";
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(400).json({"error": err.message});
        res.json({ products: rows });
    });
});

app.post("/api/products", isLoggedIn, upload, (req, res) => {
    const data = req.body;
    const user = req.session.user;
    const imageUrl = req.files && req.files['productImage'] ? '/uploads/' + req.files['productImage'][0].filename : null;
    const drawingUrl = req.files && req.files['drawingFile'] ? '/uploads/' + req.files['drawingFile'][0].filename : null;
    const materialsUrl = req.files && req.files['materialsFile'] ? '/uploads/' + req.files['materialsFile'][0].filename : null;

    const sql = `
        INSERT INTO products (
            id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en, 
            fabric_vi, fabric_en, wicker_vi, wicker_en, production_place,
            company, customer, specification, material_vi, material_en, aluminum_profile, 
            imageUrl, drawingUrl, materialsUrl, other_details,
            created_by_name, created_by_id, parent_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;
    const params = [
        data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en,
        data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
        data.production_place, data.company, data.customer, data.specification,
        data.material_vi, data.material_en, data.aluminum_profile, imageUrl,
        drawingUrl, materialsUrl, data.other_details, user.name, user.id, 
        data.parent_id || null
    ];
    
    db.run(sql, params, function (err) {
        if (err) return res.status(400).json({"error": err.message});
        res.status(201).json({ "message": "Lưu sản phẩm thành công!", "id": data.id });
    });
});

app.put("/api/products/:id", isLoggedIn, upload, (req, res) => {
    const productId = req.params.id;
    const data = req.body;

    const imageUrl = req.files && req.files['productImage'] ? '/uploads/' + req.files['productImage'][0].filename : data.existingProductImage;
    const drawingUrl = req.files && req.files['drawingFile'] ? '/uploads/' + req.files['drawingFile'][0].filename : data.existingDrawingFile;
    const materialsUrl = req.files && req.files['materialsFile'] ? '/uploads/' + req.files['materialsFile'][0].filename : data.existingMaterialsFile;

    const sql = `
        UPDATE products SET 
            name_vi = ?, name_en = ?, collection_vi = ?, collection_en = ?, 
            color_vi = ?, color_en = ?, fabric_vi = ?, fabric_en = ?, wicker_vi = ?, wicker_en = ?,
            production_place = ?, company = ?, customer = ?, specification = ?, 
            material_vi = ?, material_en = ?, aluminum_profile = ?, 
            imageUrl = ?, drawingUrl = ?, materialsUrl = ?, 
            other_details = ?, parent_id = ?
        WHERE id = ?
    `;

    const params = [
        data.name_vi, data.name_en, data.collection_vi, data.collection_en,
        data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
        data.production_place, data.company, data.customer, data.specification,
        data.material_vi, data.material_en, data.aluminum_profile,
        imageUrl, drawingUrl, materialsUrl,
        data.other_details, data.parent_id || null,
        productId
    ];

    db.run(sql, params, function(err) {
        if (err) {
            console.error("Lỗi khi cập nhật sản phẩm:", err.message);
            return res.status(500).json({ error: "Lỗi server khi cập nhật sản phẩm.", details: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm với ID này để cập nhật." });
        }
        res.status(200).json({ message: "Cập nhật sản phẩm thành công!", id: productId });
    });
});

// =========================================================================
// === ▼▼▼ API ĐỂ LƯU VÀ XEM ĐÁNH GIÁ SẢN PHẨM ▼▼▼
// =========================================================================

// API để một người dùng bất kỳ gửi đánh giá cho sản phẩm (CÔNG KHAI)
app.post("/api/reviews", (req, res) => {
    const { productId, rating, comment, author_name } = req.body;

    if (!productId || !rating || !author_name) {
        return res.status(400).json({ error: "Vui lòng cung cấp đầy đủ thông tin bắt buộc (ID sản phẩm, Tên, Số sao)." });
    }

    const sql = `INSERT INTO reviews (product_id, rating, comment, author_name) VALUES (?, ?, ?, ?)`;
    const params = [productId, rating, comment || '', author_name];

    db.run(sql, params, function(err) {
        if (err) {
            console.error("Lỗi khi lưu đánh giá vào database:", err.message);
            return res.status(500).json({ error: "Lỗi server khi lưu đánh giá." });
        }

        res.status(201).json({ 
            message: "Gửi đánh giá thành công!", 
            reviewId: this.lastID 
        });
    });
});

// API để lấy tất cả đánh giá của một sản phẩm (CÔNG KHAI, không cần đăng nhập)
// ĐÃ XÓA `isLoggedIn` ra khỏi đây để khách hàng có thể xem
app.get("/api/products/:id/reviews", (req, res) => {
    const productId = req.params.id;
    const sql = "SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC";

    db.all(sql, [productId], (err, rows) => {
        if (err) {
            console.error("Lỗi khi lấy danh sách đánh giá:", err.message);
            return res.status(500).json({ error: "Lỗi server khi lấy đánh giá." });
        }
        
        res.json({ reviews: rows });
    });
});

// =========================================================================
// === ▲▲▲ KẾT THÚC CODE VỀ ĐÁNH GIÁ ▲▲▲
// =========================================================================


app.delete("/api/products/:id", isLoggedIn, (req, res) => {
    const sql = 'DELETE FROM products WHERE id = ?';
    db.run(sql, [req.params.id], function(err) {
        if (err) return res.status(500).json({ message: "Lỗi server khi xóa sản phẩm.", error: err.message });
        if (this.changes === 0) return res.status(404).json({ message: 'Không tìm thấy sản phẩm này để xóa.' });
        res.status(200).json({ message: 'Sản phẩm đã được xóa thành công.' });
    });
});

// --- PHẦN 4: KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    console.log(`Server đang chạy tại địa chỉ http://localhost:${port}`);
});// ==========================================================
// === FILE: index.js (FINAL VERSION - FULL) ===
// ==========================================================

// --- PHẦN 1: IMPORT CÁC THƯ VIỆN CẦN THIẾT ---
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const db = require('./database.js');
const fs = require('fs'); // Thêm thư viện 'fs' để làm việc với file system

// --- PHẦN 2: KHỞI TẠO VÀ CẤU HÌNH EXPRESS APP ---
const app = express();
const saltRounds = 10;
const port = process.env.PORT || 3000;

// --- 2.1. Cấu hình Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === SỬA ĐỔI CHO RENDER (PHẦN 1/3) ===
// Phục vụ các file trong thư mục public (html, css, js)
app.use(express.static('public'));
// Phục vụ các file đã được upload từ ổ đĩa của Render
// URL sẽ là /uploads/filename.jpg, nhưng file thật nằm ở thư mục UPLOAD_DIR
app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'public/uploads'));


// === SỬA ĐỔI CHO RENDER (PHẦN 2/3) ===
// Cấu hình Session bảo mật hơn, đọc secret từ biến môi trường
app.use(session({
    secret: process.env.SESSION_SECRET || 'mot-chuoi-bi-mat-rat-an-toan-va-duy-nhat-final-version',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // 'true' khi deploy, 'false' khi ở localhost
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 
    } 
}));


// === SỬA ĐỔI CHO RENDER (PHẦN 3/3) ===
// Cấu hình Multer để dùng thư mục uploads trên ổ đĩa của Render
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'public/uploads');
// Đảm bảo thư mục upload tồn tại trước khi dùng
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir) },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)) }
});
const upload = multer({ storage: storage }).fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'drawingFile', maxCount: 1 },
    { name: 'materialsFile', maxCount: 1 }
]);

// --- 2.4. Middleware "Người Gác Cổng" Kiểm Tra Đăng Nhập ---
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

// --- PHẦN 3: CÁC API ENDPOINTS ---
// (Toàn bộ phần API của bạn từ đây trở xuống được giữ nguyên, không cần thay đổi)

// === A. CÁC API CÔNG KHAI ===
app.post("/api/users/register", (req, res) => {
    const { ho_ten, ma_nhan_vien, password } = req.body;
    if (!ho_ten || !ma_nhan_vien || !password) return res.status(400).json({"error": "Vui lòng điền đầy đủ thông tin."});
    
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

app.get("/api/products/:id", (req, res) => {
    const sql = "SELECT * FROM products WHERE id = ?";
    db.get(sql, [req.params.id], (err, product) => {
        if (err) return res.status(400).json({ "error": err.message });
        if (!product) return res.status(404).json({ error: "Sản phẩm không tồn tại" });
        res.json(product);
    });
});

// === B. CÁC API CẦN BẢO VỆ ===
app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

app.get("/api/products", isLoggedIn, (req, res) => {
    const sql = "SELECT * FROM products ORDER BY created_at DESC";
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(400).json({"error": err.message});
        res.json({ products: rows });
    });
});

app.post("/api/products", isLoggedIn, upload, (req, res) => {
    const data = req.body;
    const user = req.session.user;
    const imageUrl = req.files && req.files['productImage'] ? '/uploads/' + req.files['productImage'][0].filename : null;
    const drawingUrl = req.files && req.files['drawingFile'] ? '/uploads/' + req.files['drawingFile'][0].filename : null;
    const materialsUrl = req.files && req.files['materialsFile'] ? '/uploads/' + req.files['materialsFile'][0].filename : null;

    const sql = `
        INSERT INTO products (
            id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en, 
            fabric_vi, fabric_en, wicker_vi, wicker_en, production_place,
            company, customer, specification, material_vi, material_en, aluminum_profile, 
            imageUrl, drawingUrl, materialsUrl, other_details,
            created_by_name, created_by_id, parent_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;
    const params = [
        data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en,
        data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
        data.production_place, data.company, data.customer, data.specification,
        data.material_vi, data.material_en, data.aluminum_profile, imageUrl,
        drawingUrl, materialsUrl, data.other_details, user.name, user.id, 
        data.parent_id || null
    ];
    
    db.run(sql, params, function (err) {
        if (err) return res.status(400).json({"error": err.message});
        res.status(201).json({ "message": "Lưu sản phẩm thành công!", "id": data.id });
    });
});

app.put("/api/products/:id", isLoggedIn, upload, (req, res) => {
    const productId = req.params.id;
    const data = req.body;

    const imageUrl = req.files && req.files['productImage'] ? '/uploads/' + req.files['productImage'][0].filename : data.existingProductImage;
    const drawingUrl = req.files && req.files['drawingFile'] ? '/uploads/' + req.files['drawingFile'][0].filename : data.existingDrawingFile;
    const materialsUrl = req.files && req.files['materialsFile'] ? '/uploads/' + req.files['materialsFile'][0].filename : data.existingMaterialsFile;

    const sql = `
        UPDATE products SET 
            name_vi = ?, name_en = ?, collection_vi = ?, collection_en = ?, 
            color_vi = ?, color_en = ?, fabric_vi = ?, fabric_en = ?, wicker_vi = ?, wicker_en = ?,
            production_place = ?, company = ?, customer = ?, specification = ?, 
            material_vi = ?, material_en = ?, aluminum_profile = ?, 
            imageUrl = ?, drawingUrl = ?, materialsUrl = ?, 
            other_details = ?, parent_id = ?
        WHERE id = ?
    `;

    const params = [
        data.name_vi, data.name_en, data.collection_vi, data.collection_en,
        data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
        data.production_place, data.company, data.customer, data.specification,
        data.material_vi, data.material_en, data.aluminum_profile,
        imageUrl, drawingUrl, materialsUrl,
        data.other_details, data.parent_id || null,
        productId
    ];

    db.run(sql, params, function(err) {
        if (err) {
            console.error("Lỗi khi cập nhật sản phẩm:", err.message);
            return res.status(500).json({ error: "Lỗi server khi cập nhật sản phẩm.", details: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm với ID này để cập nhật." });
        }
        res.status(200).json({ message: "Cập nhật sản phẩm thành công!", id: productId });
    });
});

app.post("/api/reviews", (req, res) => {
    const { productId, rating, comment, author_name } = req.body;
    if (!productId || !rating || !author_name) {
        return res.status(400).json({ error: "Vui lòng cung cấp đầy đủ thông tin bắt buộc (ID sản phẩm, Tên, Số sao)." });
    }
    const sql = `INSERT INTO reviews (product_id, rating, comment, author_name) VALUES (?, ?, ?, ?)`;
    const params = [productId, rating, comment || '', author_name];
    db.run(sql, params, function(err) {
        if (err) {
            console.error("Lỗi khi lưu đánh giá vào database:", err.message);
            return res.status(500).json({ error: "Lỗi server khi lưu đánh giá." });
        }
        res.status(201).json({ 
            message: "Gửi đánh giá thành công!", 
            reviewId: this.lastID 
        });
    });
});

app.get("/api/products/:id/reviews", (req, res) => {
    const productId = req.params.id;
    const sql = "SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC";
    db.all(sql, [productId], (err, rows) => {
        if (err) {
            console.error("Lỗi khi lấy danh sách đánh giá:", err.message);
            return res.status(500).json({ error: "Lỗi server khi lấy đánh giá." });
        }
        res.json({ reviews: rows });
    });
});

app.delete("/api/products/:id", isLoggedIn, (req, res) => {
    const sql = 'DELETE FROM products WHERE id = ?';
    db.run(sql, [req.params.id], function(err) {
        if (err) return res.status(500).json({ message: "Lỗi server khi xóa sản phẩm.", error: err.message });
        if (this.changes === 0) return res.status(404).json({ message: 'Không tìm thấy sản phẩm này để xóa.' });
        res.status(200).json({ message: 'Sản phẩm đã được xóa thành công.' });
    });
});

// --- PHẦN 4: KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    console.log(`Server đang chạy tại địa chỉ http://localhost:${port}`);
});