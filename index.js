// ==========================================================
// === FILE: index.js (Đã đúng và sẵn sàng để hoạt động) ===
// ==========================================================

// --- PHẦN 1: IMPORT CÁC THƯ VIỆN CẦN THIẾT ---
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const db = require('./database.js');
const fs = require('fs');

// --- PHẦN 2: KHỞI TẠO VÀ CẤU HÌNH EXPRESS APP ---
const app = express();
const saltRounds = 10;
const port = process.env.PORT || 3000;

// --- 2.1. Cấu hình Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ các file tĩnh từ thư mục 'public'. Dòng này đã đúng.
app.use(express.static('public'));

// Phục vụ các file đã upload.
app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'public/uploads'));

// --- 2.2. Cấu hình Session ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'mot-chuoi-bi-mat-rat-an-toan-va-duy-nhat-final-version',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// --- 2.3. Cấu hình Multer để Upload File ---
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
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

// === A. CÁC API CÔNG KHAI ===

app.post("/api/users/register", async (req, res) => {
    const { ho_ten, ma_nhan_vien, password } = req.body;
    if (!ho_ten || !ma_nhan_vien || !password) {
        return res.status(400).json({ "error": "Vui lòng điền đầy đủ thông tin." });
    }

    try {
        const hash = await bcrypt.hash(password, saltRounds);
        const sql = 'INSERT INTO users (ho_ten, ma_nhan_vien, password) VALUES ($1, $2, $3) RETURNING id';
        const params = [ho_ten, ma_nhan_vien, hash];
        
        const result = await db.query(sql, params);
        const newUser = result.rows[0];

        req.session.user = { id: newUser.id, name: ho_ten, employeeId: ma_nhan_vien };
        res.status(201).json({ "message": "Đăng ký thành công và đã tự động đăng nhập." });

    } catch (err) {
        console.error("Lỗi đăng ký:", err.message);
        if (err.code === '23505') {
            return res.status(400).json({ "error": "Mã nhân viên này đã tồn tại." });
        }
        res.status(500).json({ "error": "Lỗi hệ thống khi đăng ký." });
    }
});

app.post("/api/users/login", async (req, res) => {
    const { ma_nhan_vien, password } = req.body;
    const sql = "SELECT * FROM users WHERE ma_nhan_vien = $1";

    try {
        const { rows } = await db.query(sql, [ma_nhan_vien]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ "error": "Mã nhân viên hoặc mật khẩu không đúng." });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {
            req.session.user = { id: user.id, name: user.ho_ten, employeeId: user.ma_nhan_vien };
            res.json({ "message": "Đăng nhập thành công" });
        } else {
            res.status(401).json({ "error": "Mã nhân viên hoặc mật khẩu không đúng." });
        }
    } catch (err) {
        console.error("Lỗi đăng nhập:", err.message);
        res.status(500).json({ "error": "Lỗi hệ thống khi đăng nhập." });
    }
});

app.get("/api/products/:id", async (req, res) => {
    const sql = "SELECT * FROM products WHERE id = $1";
    try {
        const { rows } = await db.query(sql, [req.params.id]);
        const product = rows[0];

        if (!product) {
            return res.status(404).json({ error: "Sản phẩm không tồn tại" });
        }
        res.json(product);
    } catch (err) {
        console.error("Lỗi lấy sản phẩm theo ID:", err.message);
        res.status(500).json({ "error": err.message });
    }
});

// === B. CÁC API CẦN BẢO VỆ ===
app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

app.get("/api/products", isLoggedIn, async (req, res) => {
    const sql = "SELECT * FROM products ORDER BY created_at DESC";
    try {
        const { rows } = await db.query(sql);
        res.json({ products: rows });
    } catch (err) {
        console.error("Lỗi lấy danh sách sản phẩm:", err.message);
        res.status(500).json({ "error": err.message });
    }
});

app.post("/api/products", isLoggedIn, upload, async (req, res) => {
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
    `;
    const params = [
        data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en,
        data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
        data.production_place, data.company, data.customer, data.specification,
        data.material_vi, data.material_en, data.aluminum_profile, imageUrl,
        drawingUrl, materialsUrl, data.other_details, user.name, user.id,
        data.parent_id || null
    ];

    try {
        await db.query(sql, params);
        res.status(201).json({ "message": "Lưu sản phẩm thành công!", "id": data.id });
    } catch (err) {
        console.error("Lỗi khi thêm sản phẩm:", err.message);
        res.status(400).json({ "error": err.message });
    }
});

app.put("/api/products/:id", isLoggedIn, upload, async (req, res) => {
    const productId = req.params.id;
    const data = req.body;

    const imageUrl = req.files && req.files['productImage'] ? '/uploads/' + req.files['productImage'][0].filename : data.existingProductImage;
    const drawingUrl = req.files && req.files['drawingFile'] ? '/uploads/' + req.files['drawingFile'][0].filename : data.existingDrawingFile;
    const materialsUrl = req.files && req.files['materialsFile'] ? '/uploads/' + req.files['materialsFile'][0].filename : data.existingMaterialsFile;

    const sql = `
        UPDATE products SET 
            name_vi = $1, name_en = $2, collection_vi = $3, collection_en = $4, 
            color_vi = $5, color_en = $6, fabric_vi = $7, fabric_en = $8, wicker_vi = $9, wicker_en = $10,
            production_place = $11, company = $12, customer = $13, specification = $14, 
            material_vi = $15, material_en = $16, aluminum_profile = $17, 
            imageUrl = $18, drawingUrl = $19, materialsUrl = $20, 
            other_details = $21, parent_id = $22
        WHERE id = $23
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

    try {
        const result = await db.query(sql, params);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm với ID này để cập nhật." });
        }
        res.status(200).json({ message: "Cập nhật sản phẩm thành công!", id: productId });
    } catch (err) {
        console.error("Lỗi khi cập nhật sản phẩm:", err.message);
        return res.status(500).json({ error: "Lỗi server khi cập nhật sản phẩm.", details: err.message });
    }
});

app.post("/api/reviews", async (req, res) => {
    const { productId, rating, comment, author_name } = req.body;
    if (!productId || !rating || !author_name) {
        return res.status(400).json({ error: "Vui lòng cung cấp đầy đủ thông tin bắt buộc (ID sản phẩm, Tên, Số sao)." });
    }
    const sql = `INSERT INTO reviews (product_id, rating, comment, author_name) VALUES ($1, $2, $3, $4) RETURNING id`;
    const params = [productId, rating, comment || '', author_name];

    try {
        const result = await db.query(sql, params);
        res.status(201).json({
            message: "Gửi đánh giá thành công!",
            reviewId: result.rows[0].id
        });
    } catch (err) {
        console.error("Lỗi khi lưu đánh giá vào database:", err.message);
        return res.status(500).json({ error: "Lỗi server khi lưu đánh giá." });
    }
});

app.get("/api/products/:id/reviews", async (req, res) => {
    const productId = req.params.id;
    const sql = "SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC";

    try {
        const { rows } = await db.query(sql, [productId]);
        res.json({ reviews: rows });
    } catch (err) {
        console.error("Lỗi khi lấy danh sách đánh giá:", err.message);
        return res.status(500).json({ error: "Lỗi server khi lấy đánh giá." });
    }
});

app.delete("/api/products/:id", isLoggedIn, async (req, res) => {
    const sql = 'DELETE FROM products WHERE id = $1';
    try {
        const result = await db.query(sql, [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm này để xóa.' });
        }
        res.status(200).json({ message: 'Sản phẩm đã được xóa thành công.' });
    } catch (err) {
        console.error("Lỗi khi xóa sản phẩm:", err.message);
        return res.status(500).json({ message: "Lỗi server khi xóa sản phẩm.", error: err.message });
    }
});


// Route này sẽ gửi file index.html trong thư mục "public" về cho trình duyệt
// khi người dùng truy cập vào trang chủ. Dòng này đã đúng.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- PHẦN 4: KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    // Thông báo này sẽ hiển thị trong log của Cloud Run
    console.log(`Server đang lắng nghe trên cổng ${port}`);
});