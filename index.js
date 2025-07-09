// =================================================================
// === FILE: index.js (PHIÊN BẢN CUỐI CÙNG - TÍCH HỢP GCS)        ===
// === Giải quyết triệt để lỗi 413 bằng cách upload file trực tiếp ===
// === lên Google Cloud Storage.                                  ===
// =================================================================

// --- PHẦN 1: IMPORT CÁC THƯ VIỆN CẦN THIẾT ---
// Các thư viện này là nền tảng để xây dựng server
console.log("Initializing required libraries...");
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const db = require('./database.js');
const fs = require('fs');
// =======================================================================
// === BẮT ĐẦU PHẦN THÊM MỚI QUAN TRỌNG: THƯ VIỆN GOOGLE CLOUD STORAGE ===
// =======================================================================
// Thư viện này là bắt buộc để tương tác với GCS.
// Bạn cần chạy "npm install @google-cloud/storage" để cài đặt.
const { Storage } = require('@google-cloud/storage');
// =======================================================================
// === KẾT THÚC PHẦN THÊM MỚI QUAN TRỌNG =================================
// =======================================================================
console.log("Libraries initialized successfully.");

// --- PHẦN 2: KHỞI TẠO VÀ CẤU HÌNH EXPRESS APP ---
console.log("Configuring Express application...");
const app = express();
const saltRounds = 10;
const port = process.env.PORT || 3000;

// --- 2.1. Cấu hình Middleware Cơ Bản ---
app.use(cors());

// KHÔNG CẦN GIỚI HẠN LỚN NỮA, VÌ FILE KHÔNG ĐI QUA SERVER NÀY
// Với kiến trúc GCS, request gửi đến server chỉ chứa text và các đường link,
// nên rất nhẹ. Chúng ta có thể quay về giới hạn mặc định của Express.
// Việc xóa bỏ `limit: '50mb'` là cần thiết để áp dụng kiến trúc mới.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phục vụ các file tĩnh (HTML, CSS, JS phía client) từ thư mục 'public'
app.use(express.static('public'));
// Đường dẫn ảo '/uploads' này vẫn được giữ lại để phục vụ các file cũ
// đã được upload theo phương pháp cũ, đảm bảo tính tương thích ngược.
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
console.log("Middleware configured successfully.");


// =======================================================================
// === BẮT ĐẦU PHẦN THÊM MỚI QUAN TRỌNG: CẤU HÌNH GCS ===
// =======================================================================
// Khởi tạo một đối tượng Storage. Khi chạy trên Cloud Run, nó sẽ tự động
// sử dụng credentials của Service Account được gán cho dịch vụ.
const storageGCS = new Storage();
// !!! THAY THẾ BẰNG TÊN BUCKET CỦA BẠN.
// Bạn cần tạo một bucket trên Google Cloud Storage trước.
// Tên bucket phải là duy nhất trên toàn cầu.
const bucketName = 'kt-cms-final-578163175425'; // Thay thế bằng tên bucket của bạn
// =======================================================================
// === KẾT THÚC PHẦN THÊM MỚI QUAN TRỌNG =================================
// =======================================================================


// --- 2.2. Cấu hình Session ---
console.log("Configuring user session management...");
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-strong-secret-key-for-development-should-be-changed-in-production',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));
console.log("Session management configured successfully.");


// --- 2.3. Cấu hình Multer ---
// Với kiến trúc mới, Multer không còn dùng để xử lý file upload lớn nữa.
// Chúng ta dùng .none() để nó chỉ xử lý các trường text trong form.
// Mọi request liên quan đến sản phẩm giờ sẽ đi qua middleware này.
console.log("Configuring Multer for text-only fields...");
const textOnlyUpload = multer().none();
console.log("Multer configured successfully.");


// --- 2.4. Middleware Tùy Chỉnh ---
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};


// --- PHẦN 3: CÁC API ENDPOINTS ---
console.log("Defining API endpoints...");

// == A. CÁC API VỀ USER VÀ TRANG CHỦ ==
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.post("/api/users/register", async (req, res) => {
    const { ho_ten, ma_nhan_vien, password } = req.body;
    if (!ho_ten || !ma_nhan_vien || !password) {
        return res.status(400).json({ "error": "Vui lòng điền đầy đủ thông tin." });
    }
    try {
        const hash = await bcrypt.hash(password, saltRounds);
        const sql = 'INSERT INTO users (ho_ten, ma_nhan_vien, password) VALUES ($1, $2, $3) RETURNING id, ho_ten, ma_nhan_vien';
        const params = [ho_ten, ma_nhan_vien, hash];
        const result = await db.query(sql, params);
        const newUser = result.rows[0];
        req.session.user = { id: newUser.id, name: newUser.ho_ten, employeeId: newUser.ma_nhan_vien };
        res.status(201).json({ "message": "Đăng ký thành công và đã tự động đăng nhập." });
    } catch (err) {
        console.error("Registration error:", err.message);
        if (err.code === '23505') {
            return res.status(400).json({ "error": "Mã nhân viên này đã tồn tại." });
        }
        res.status(500).json({ "error": `Server error during registration: ${err.message}` });
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
        console.error("Login error:", err.message);
        res.status(500).json({ "error": `Server error during login: ${err.message}` });
    }
});
app.get("/api/me", isLoggedIn, (req, res) => { res.json(req.session.user); });


// =======================================================================
// === BẮT ĐẦU PHẦN THÊM MỚI QUAN TRỌNG: API TẠO SIGNED URL CHO UPLOAD ===
// =======================================================================
// Endpoint này sẽ tạo ra một đường link đặc biệt, có thời hạn, cho phép
// trình duyệt upload thẳng một file lên GCS mà không cần đi qua server này.
app.post('/api/generate-upload-url', isLoggedIn, async (req, res) => {
    try {
        const { fileName, contentType } = req.body;
        if (!fileName || !contentType) {
            return res.status(400).json({ error: 'Cần có tên file và loại file.' });
        }

        // Tạo một đường dẫn file duy nhất trên GCS để tránh ghi đè
        const destFileName = `product-files/${Date.now()}-${fileName.replace(/\s/g, '_')}`;

        const options = {
            version: 'v4',
            action: 'write', // Cho phép ghi (upload) file
            expires: Date.now() + 15 * 60 * 1000, // Link có hiệu lực trong 15 phút
            contentType: contentType,
        };

        // Tạo một "signed URL" từ GCS
        const [url] = await storageGCS.bucket(bucketName).file(destFileName).getSignedUrl(options);
        
        // Trả về 2 URL cho frontend:
        // 1. uploadUrl: Dùng để thực hiện việc upload (PUT request)
        // 2. accessUrl: Dùng để lưu vào database và truy cập file sau này
        res.status(200).json({
            uploadUrl: url,
            accessUrl: `https://storage.googleapis.com/${bucketName}/${destFileName}`
        });
    } catch (err) {
        console.error('Lỗi khi tạo signed URL:', err.stack);
        res.status(500).json({ error: 'Không thể tạo link upload. Vui lòng kiểm tra lại cấu hình bucket và quyền truy cập.' });
    }
});
// =======================================================================
// === KẾT THÚC PHẦN THÊM MỚI ==========================================
// =======================================================================


// == B. CÁC API VỀ SẢN PHẨM (ĐÃ SỬA LẠI ĐỂ DÙNG URL TỪ GCS) ==

// READ ALL & READ ONE (Giữ nguyên)
app.get("/api/products", isLoggedIn, async (req, res) => {
    const sql = "SELECT * FROM products ORDER BY created_at DESC";
    try {
        const { rows } = await db.query(sql);
        res.json({ products: rows });
    } catch (err) {
        console.error("Error fetching product list:", err.message);
        res.status(500).json({ "error": err.message });
    }
});
app.get("/api/products/:id", async (req, res) => {
    const sql = `
        SELECT
            id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en,
            fabric_vi, fabric_en, wicker_vi, wicker_en, production_place,
            company, customer, specification, material_vi, material_en, aluminum_profile,
            other_details, created_by_name, created_by_id, parent_id, created_at,
            "imageUrl", "drawingUrl", "materialsUrl"
        FROM products WHERE id = $1
    `;
    try {
        const { rows } = await db.query(sql, [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Sản phẩm không tồn tại" });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error("Error fetching product by ID:", err.message);
        res.status(500).json({ "error": err.message });
    }
});


// CREATE: Endpoint thêm sản phẩm mới (ĐÃ SỬA)
// Middleware giờ là textOnlyUpload, không còn xử lý file nữa.
app.post("/api/products", isLoggedIn, textOnlyUpload, async (req, res) => {
    // req.body bây giờ chứa cả dữ liệu text và các URL file từ GCS
    const data = req.body;
    const user = req.session.user;
    
    // Các URL này được frontend gửi lên sau khi đã upload thành công lên GCS
   // Chuyển đổi chuỗi từ textarea (nếu có) thành mảng, hoặc nhận mảng trực tiếp
const imageUrls = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : (req.body.imageUrls || '').split('\n').filter(link => link.trim() !== '');
const drawingUrls = Array.isArray(req.body.drawingUrls) ? req.body.drawingUrls : (req.body.drawingUrls || '').split('\n').filter(link => link.trim() !== '');
const materialsUrls = Array.isArray(req.body.materialsUrls) ? req.body.materialsUrls : (req.body.materialsUrls || '').split('\n').filter(link => link.trim() !== '');

// ... và trong câu lệnh SQL, bạn sẽ dùng các biến mảng này
// Ví dụ: '..., "imageUrl", ...' và trong params là '..., imageUrls, ...'
    const sql = `
        INSERT INTO products (
            id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en, 
            fabric_vi, fabric_en, wicker_vi, wicker_en, production_place,
            company, customer, specification, material_vi, material_en, aluminum_profile, 
            "imageUrl", "drawingUrl", supplier_vi, supplier_en, "materialsUrl", other_details,
            created_by_name, created_by_id, parent_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
    `;
    const params = [
        data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en,
        data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
        data.production_place, data.company, data.customer, data.specification,
        data.material_vi, data.material_en, data.aluminum_profile, imageUrl,
        drawingUrl, data.supplier, materialsUrl, data.other_details, user.name, user.id,
        data.parent_id || null
    ];

    try {
        await db.query(sql, params);
        res.status(201).json({ "message": "Lưu sản phẩm thành công!", "id": data.id });
    } catch (err) {
        console.error("Error inserting product into DB:", err.stack);
        if (err.code === '23505') {
             return res.status(400).json({ "error": `Lỗi: Mã sản phẩm '${data.id}' đã tồn tại.` });
        }
        res.status(500).json({ "error": `Lỗi khi lưu vào cơ sở dữ liệu: ${err.message}` });
    }
});


// UPDATE: Endpoint cập nhật sản phẩm (ĐÃ SỬA)
app.put("/api/products/:id", isLoggedIn, textOnlyUpload, async (req, res) => {
    const { id } = req.params;
    const data = req.body;

    // Các URL này cũng được gửi lên từ frontend
    const imageUrl = data.imageUrl || data.existingImageUrl;
    const drawingUrl = data.drawingUrl || data.existingDrawingUrl;
    const materialsUrl = data.materialsUrl || data.existingMaterialsUrl;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    const addField = (fieldName, value) => {
        fields.push(`"${fieldName}" = $${paramIndex++}`);
        values.push(value);
    };

    // Thêm các trường text
    addField('name_vi', data.name_vi);
    addField('name_en', data.name_en);
    addField('collection_vi', data.collection_vi);
    addField('collection_en', data.collection_en);
    addField('color_vi', data.color_vi);
    addField('color_en', data.color_en);
    addField('fabric_vi', data.fabric_vi);
    addField('fabric_en', data.fabric_en);
    addField('wicker_vi', data.wicker_vi);
    addField('wicker_en', data.wicker_en);
    addField('production_place', data.production_place);
    addField('company', data.company);
    addField('customer', data.customer);
    addField('specification', data.specification);
    addField('supplier', data.supplier);
    addField('material_vi', data.material_vi);
    addField('material_en', data.material_en);
    addField('aluminum_profile', data.aluminum_profile);
    addField('other_details', data.other_details);

    // Thêm các trường URL file
    addField('imageUrl', imageUrl);
    addField('drawingUrl', drawingUrl);
    addField('materialsUrl', materialsUrl);

    values.push(id);
    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex}`;

    try {
        const result = await db.query(sql, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm để cập nhật." });
        }
        res.status(200).json({ message: "Cập nhật sản phẩm thành công!" });
    } catch (err) {
        console.error("Database UPDATE error:", err.stack);
        res.status(500).json({ error: `Lỗi khi cập nhật CSDL: ${err.message}` });
    }
});


// DELETE: Endpoint xóa sản phẩm (Giữ nguyên)
app.delete("/api/products/:id", isLoggedIn, async (req, res) => {
    const sql = 'DELETE FROM products WHERE id = $1';
    try {
        const result = await db.query(sql, [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm này để xóa.' });
        }
        res.status(200).json({ message: 'Sản phẩm đã được xóa thành công.' });
    } catch (err) {
        console.error("Error deleting product:", err.message);
        return res.status(500).json({ message: "Lỗi server khi xóa sản phẩm.", error: err.message });
    }
});

// == C. CÁC API VỀ REVIEWS == (Giữ nguyên)
app.post("/api/reviews", async (req, res) => {
    const { productId, rating, comment, author_name } = req.body;
    if (!productId || !rating || !author_name) {
        return res.status(400).json({ error: "Vui lòng cung cấp đầy đủ thông tin bắt buộc." });
    }
    const sql = `INSERT INTO reviews (product_id, rating, comment, author_name) VALUES ($1, $2, $3, $4) RETURNING id`;
    const params = [productId, rating, comment || '', author_name];
    try {
        const result = await db.query(sql, params);
        res.status(201).json({ message: "Gửi đánh giá thành công!", reviewId: result.rows[0].id });
    } catch (err) {
        console.error("Error saving review:", err.message);
        return res.status(500).json({ error: "Lỗi server khi lưu đánh giá." });
    }
});
app.get("/api/products/:id/reviews", async (req, res) => {
    const sql = "SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC";
    try {
        const { rows } = await db.query(sql, [req.params.id]);
        res.json({ reviews: rows });
    } catch (err) {
        console.error("Error fetching reviews:", err.message);
        return res.status(500).json({ error: "Lỗi server khi lấy đánh giá." });
    }
});

console.log("API Endpoints defined successfully.");

// == D. ENDPOINT CHẨN ĐOÁN ==
const APP_VERSION = "12.0_GCS_FINAL_ULTIMATE";
app.get("/api/version", (req, res) => {
    res.status(200).json({
        status: "success",
        version: APP_VERSION,
        note: "This version uses Google Cloud Storage for file uploads. All systems should be operational.",
        server_time: new Date().toISOString()
    });
});

// --- PHẦN 4: KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    console.log(`===================================================`);
    console.log(`🚀 SERVER IS RUNNING (VERSION ${APP_VERSION}) ON PORT ${port}`);
    console.log(`===================================================`);
});
