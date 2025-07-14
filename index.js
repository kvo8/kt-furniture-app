// =================================================================
// === FILE: index.js (PHIÊN BẢN HOÀN CHỈNH - FULL CHỨC NĂNG)     ===
// === Tích hợp Upload, Quản lý Sản phẩm, và Quản lý Nhân viên     ===
// =================================================================

// --- PHẦN 1: IMPORT CÁC THƯ VIỆN CẦN THIẾT ---
console.log("Initializing required libraries...");
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const db = require('./database.js');
const { Storage } = require('@google-cloud/storage');
console.log("Libraries initialized successfully.");

// --- PHẦN 2: KHỞI TẠO VÀ CẤU HÌNH EXPRESS APP ---
console.log("Configuring Express application...");
const app = express();
const saltRounds = 10;
const port = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- 2.1. Cấu hình Middleware Cơ Bản ---
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
console.log("Middleware configured successfully.");

// --- 2.2. Cấu hình Google Cloud Storage ---
const storageGCS = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'kt-cms-file-storage-20250710';
console.log(`GCS Bucket configured: ${bucketName}`);

// --- 2.3. Cấu hình Session ---
console.log("Configuring user session management...");
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-strong-secret-key-for-development',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));
console.log("Session management configured successfully.");


// =======================================================================
// === BẮT ĐẦU KHỐI CODE CẦN THAY THẾ ===
// =======================================================================
// --- 2.4. Cấu hình Multer (ĐÃ CẢI TIẾN) ---
// Bổ sung bộ lọc file để chỉ định rõ các định dạng được phép

const fileFilter = (req, file, cb) => {
    // Danh sách các loại file (MIME types) mà chúng ta cho phép
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
        'application/msword', // cho file .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // cho file .docx
        'application/vnd.ms-excel', // cho file .xls
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // cho file .xlsx
    ];

    if (allowedTypes.includes(file.mimetype)) {
        // Nếu loại file hợp lệ, cho phép upload
        cb(null, true);
    } else {
        // Nếu loại file không hợp lệ, từ chối và báo lỗi
        cb(new Error('Định dạng file không được hỗ trợ! Chỉ chấp nhận Word, Excel, PDF, và ảnh.'), false);
    }
};

const multerMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // Giữ nguyên giới hạn 15MB của bạn
    fileFilter: fileFilter                    // <-- ÁP DỤNG BỘ LỌC FILE MỚI
});

const textOnlyUpload = multer().none();
console.log("Multer configured with explicit file filter and size limits."); // Log đã được cập nhật

// =======================================================================
// === KẾT THÚC KHỐI CODE CẦN THAY THẾ ===
// =======================================================================


// --- 2.5. Middleware Tùy Chỉnh ---
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

/**
 * Ghi lại một hành động vào bảng activity_log
 * @param {string} activityType - Loại hành động (vd: 'CREATE_PRODUCT')
 * @param {string} details - Mô tả chi tiết hành động
 * @param {string} userName - Tên người thực hiện
 */
async function logActivity(activityType, details, userName) {
    try {
        const sql = `INSERT INTO activity_log (activity_type, details, user_name) VALUES ($1, $2, $3)`;
        await db.query(sql, [activityType, details, userName]);
        console.log(`Activity logged: [${activityType}] by ${userName}`);
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
}


// --- PHẦN 3: CÁC API ENDPOINTS ---
console.log("Defining API endpoints...");

// == A. CÁC API VỀ USER VÀ TRANG CHỦ ==
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GHI CHÚ: API Đăng ký đã được cập nhật để tự động thêm chức vụ
app.post("/api/users/register", async (req, res, next) => {
    try {
        const { ho_ten, ma_nhan_vien, password } = req.body;
        if (!ho_ten || !ma_nhan_vien || !password || ma_nhan_vien.length < 2) {
            return res.status(400).json({ "error": "Vui lòng điền đầy đủ và chính xác thông tin." });
        }

        const positionMap = {
            'GD': 'Giám Đốc', 'IT': 'IT', 'KT': 'Kỹ Thuật',
            'VT': 'Vật Tư', 'SX': 'Sản Xuất', 'NS': 'Nhân Sự', 'KD': 'Kinh Doanh'
        };
        const positionCode = ma_nhan_vien.slice(-2).toUpperCase();
        const chuc_vu = positionMap[positionCode] || 'Nhân Viên';

        const hash = await bcrypt.hash(password, saltRounds);
        const sql = 'INSERT INTO users (ho_ten, ma_nhan_vien, password, chuc_vu) VALUES ($1, $2, $3, $4) RETURNING id, ho_ten, ma_nhan_vien';
        const params = [ho_ten, ma_nhan_vien, hash, chuc_vu];
        
        const result = await db.query(sql, params);
        const newUser = result.rows[0];
        req.session.user = { id: newUser.id, name: newUser.ho_ten, employeeId: newUser.ma_nhan_vien };

        await logActivity('NEW_USER', `Nhân viên mới '${ho_ten}' đã được tạo.`, 'Hệ thống');
        res.status(201).json({ "message": "Đăng ký thành công và đã tự động đăng nhập." });
    } catch (err) {
        next(err);
    }
});

app.post("/api/users/login", async (req, res, next) => {
    try {
        const { ma_nhan_vien, password } = req.body;
        const sql = "SELECT * FROM users WHERE ma_nhan_vien = $1";
        const { rows } = await db.query(sql, [ma_nhan_vien]);
        const user = rows[0];
        if (!user) {
            return res.status(401).json({ "error": "Mã nhân viên hoặc mật khẩu không đúng." });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            req.session.user = { id: user.id, name: user.ho_ten, employeeId: user.ma_nhan_vien, position: user.chuc_vu };
            res.json({ "message": "Đăng nhập thành công" });
        } else {
            res.status(401).json({ "error": "Mã nhân viên hoặc mật khẩu không đúng." });
        }
    } catch (err) {
        next(err);
    }
});

app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

// GHI CHÚ: API mới để lấy danh sách tất cả nhân viên
app.get("/api/users", isLoggedIn, async (req, res, next) => {
    try {
        const sql = "SELECT id, ho_ten, ma_nhan_vien, chuc_vu FROM users ORDER BY id ASC";
        const { rows } = await db.query(sql);
        res.json({ users: rows });
    } catch (err) {
        next(err);
    }
});

// GHI CHÚ: API mới để xóa một nhân viên
app.delete("/api/users/:id", isLoggedIn, async (req, res, next) => {
    try {
        if (req.session.user && req.session.user.id == req.params.id) {
            return res.status(403).json({ error: "Bạn không thể tự xóa tài khoản của chính mình." });
        }
        const sql = 'DELETE FROM users WHERE id = $1 RETURNING ho_ten';
        const result = await db.query(sql, [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng này để xóa.' });
        }
        const deletedUserName = result.rows[0].ho_ten;
        await logActivity('DELETE_USER', `Nhân viên '${deletedUserName}' (ID: ${req.params.id}) đã bị xóa.`, req.session.user.name);
        res.status(200).json({ message: 'Người dùng đã được xóa thành công.' });
    } catch (err) {
        next(err);
    }
});


// == B. API UPLOAD ==
app.post('/api/upload-direct', isLoggedIn, multerMemory.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file nào được gửi lên.' });
        }
        const bucket = storageGCS.bucket(bucketName);
        const originalName = req.file.originalname.replace(/\s/g, '_');
        const blobName = `product-files/${Date.now()}-${originalName}`;
        const blob = bucket.file(blobName);
        
        const blobStream = blob.createWriteStream({ resumable: false, contentType: req.file.mimetype });
        blobStream.on('error', err => next(err));
        blobStream.on('finish', () => {
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
            res.status(200).json({ accessUrl: publicUrl });
        });
        blobStream.end(req.file.buffer);
    } catch (error) {
        next(error);
    }
});

// == C. CÁC API VỀ SẢN PHẨM ==
app.get("/api/products", isLoggedIn, async (req, res, next) => {
    try {
        const sql = "SELECT * FROM products ORDER BY created_at DESC";
        const { rows } = await db.query(sql);
        res.json({ products: rows });
    } catch (err) {
        next(err);
    }
});

app.get("/api/products/:id", async (req, res, next) => {
    try {
        const sql = `SELECT * FROM products WHERE id = $1`;
        const { rows } = await db.query(sql, [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Sản phẩm không tồn tại" });
        }
        const product = rows[0];
        ['imageUrls', 'drawingUrls', 'materialsUrls'].forEach(field => {
            try {
                if (product[field] && typeof product[field] === 'string') {
                    product[field] = JSON.parse(product[field]);
                }
            } catch (e) { /* Bỏ qua nếu parse lỗi */ }
        });
        res.json(product);
    } catch (err) {
        next(err);
    }
});

app.post("/api/products", isLoggedIn, textOnlyUpload, async (req, res, next) => {
    try {
        const data = req.body;
        const user = req.session.user;
        if (!data.id || !data.name_vi) {
             return res.status(400).json({ error: "Mã sản phẩm và Tên sản phẩm (VI) là bắt buộc." });
        }
        const sql = `
            INSERT INTO products (id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en, fabric_vi, fabric_en, wicker_vi, wicker_en, production_place, company, customer, specification, material_vi, material_en, aluminum_profile, supplier, "imageUrls", "drawingUrls", "materialsUrls", other_details, created_by_name, created_by_id, parent_id, height, width, length, packed_height, packed_width, packed_length) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)`;
        const params = [
            data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en,
            data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
            data.production_place, data.company, data.customer, data.specification,
            data.material_vi, data.material_en, data.aluminum_profile, 
            data.supplier || null, JSON.stringify(data.imageUrls || []), JSON.stringify(data.drawingUrls || []),
            JSON.stringify(data.materialsUrls || []), data.other_details || null, 
            user.name, user.id, data.parent_id || null,
            data.height || null, data.width || null, data.length || null,
            data.packed_height || null, data.packed_width || null, data.packed_length || null
        ];
        await db.query(sql, params);
        await logActivity('CREATE_PRODUCT', `Sản phẩm '${data.name_vi}' (ID: ${data.id}) đã được tạo.`, user.name);
        res.status(201).json({ message: "Lưu sản phẩm thành công!", id: data.id });
    } catch (err) {
        next(err);
    }
});

app.put("/api/products/:id", isLoggedIn, textOnlyUpload, async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const fields = [];
        const values = [];
        let paramIndex = 1;
        const addField = (fieldName, value) => {
            const finalValue = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
            fields.push(`"${fieldName}" = $${paramIndex++}`);
            values.push(finalValue === '' ? null : finalValue);
        };
        const updatableFields = [
            'name_vi', 'name_en', 'collection_vi', 'collection_en', 'color_vi', 'color_en', 'fabric_vi', 'fabric_en', 
            'wicker_vi', 'wicker_en', 'production_place', 'company', 'customer', 'specification', 'material_vi', 'material_en', 
            'aluminum_profile', 'supplier', 'other_details', 'imageUrls', 'drawingUrls', 'materialsUrls',
            'height', 'width', 'length', 'packed_height', 'packed_width', 'packed_length'
        ];
        updatableFields.forEach(field => {
            if (data[field] !== undefined) {
                addField(field, data[field]);
            }
        });
        if (fields.length === 0) {
            return res.status(400).json({ message: "Không có dữ liệu nào được gửi để cập nhật." });
        }
        values.push(id);
        const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
        const result = await db.query(sql, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm để cập nhật." });
        }
        await logActivity('EDIT_PRODUCT', `Sản phẩm ID: ${id} đã được cập nhật.`, req.session.user.name);
        res.status(200).json({ message: "Cập nhật sản phẩm thành công!" });
    } catch (err) {
        next(err);
    }
});

async function deleteFilesFromGCS(product) {
    console.log(`Bắt đầu quá trình xóa file GCS cho sản phẩm ID: ${product.id}`);
    const urlsToDelete = [];
    ['imageUrls', 'drawingUrls', 'materialsUrls'].forEach(field => {
        if (product[field] && typeof product[field] === 'string') {
            try {
                const parsedUrls = JSON.parse(product[field]);
                if (Array.isArray(parsedUrls)) {
                    parsedUrls.forEach(item => {
                        const url = typeof item === 'object' ? item.url : item;
                        if (url) urlsToDelete.push(url);
                    });
                }
            } catch (e) { /* Bỏ qua */ }
        }
    });
    if (urlsToDelete.length === 0) {
        console.log(`Không có file nào trên GCS cần xóa cho sản phẩm ${product.id}.`);
        return;
    }
    const bucket = storageGCS.bucket(bucketName);
    const deletionPromises = urlsToDelete.map(async (url) => {
        try {
            const fileName = url.split(`/${bucketName}/`)[1];
            if (fileName) {
                await bucket.file(fileName).delete();
                console.log(`SUCCESS: Đã xóa file ${fileName}`);
            }
        } catch (error) {
            if (error.code !== 404) {
                console.error(`ERROR: Lỗi khi xóa file tại URL ${url}:`, error.message);
            }
        }
    });
    await Promise.all(deletionPromises);
    console.log(`Hoàn tất quá trình xóa file cho sản phẩm ${product.id}.`);
}
app.delete("/api/products/:id", isLoggedIn, async (req, res, next) => {
    const { id } = req.params;
    try {
        const selectResult = await db.query('SELECT "imageUrls", "drawingUrls", "materialsUrls", id FROM products WHERE id = $1', [id]);
        if (selectResult.rowCount === 0) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm này để xóa.' });
        }
        const productToDelete = selectResult.rows[0];
        await deleteFilesFromGCS(productToDelete);
        await db.query('DELETE FROM products WHERE id = $1', [id]);
        await logActivity('DELETE_PRODUCT', `Sản phẩm ID: ${id} đã bị xóa.`, req.session.user.name);
        res.status(200).json({ message: 'Sản phẩm và các file liên quan đã được xóa thành công.' });
    } catch (err) {
        next(err);
    }
});

// == D. CÁC API VỀ REVIEWS ==
app.post("/api/reviews", async (req, res, next) => {
    try {
        const { productId, rating, comment, author_name } = req.body;
        if (!productId || !rating || !author_name) {
            return res.status(400).json({ error: "Vui lòng cung cấp đầy đủ thông tin bắt buộc." });
        }
        const sql = `INSERT INTO reviews (product_id, rating, comment, author_name) VALUES ($1, $2, $3, $4) RETURNING id`;
        const result = await db.query(sql, [productId, rating, comment || '', author_name]);
        await logActivity('NEW_REVIEW', `Sản phẩm ID: ${productId} có một đánh giá mới từ '${author_name}'.`, 'Khách hàng');
        res.status(201).json({ message: "Gửi đánh giá thành công!", reviewId: result.rows[0].id });
    } catch (err) {
        next(err);
    }
});

app.get("/api/products/:id/reviews", async (req, res, next) => {
    try {
        const sql = "SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC";
        const { rows } = await db.query(sql, [req.params.id]);
        res.json({ reviews: rows });
    } catch (err) {
        next(err);
    }
});

// == E. API NHẬT KÝ HOẠT ĐỘNG ==
app.get("/api/activity-log", isLoggedIn, async (req, res, next) => {
    try {
        const sql = "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20";
        const { rows } = await db.query(sql);
        res.json({ activities: rows });
    } catch (err) {
        next(err);
    }
});

// == F. ENDPOINT CHẨN ĐOÁN ==
const APP_VERSION = "17.0_FULL_FEATURES";
app.get("/api/version", (req, res) => {
    res.status(200).json({
        status: "OK",
        version: APP_VERSION,
        note: "This version includes direct upload, full product fields, and activity logging.",
        server_time: new Date().toISOString()
    });
});

// --- PHẦN 4: MIDDLEWARE XỬ LÝ LỖI TẬP TRUNG ---
app.use((err, req, res, next) => {
    console.error("💥 MỘT LỖI NGHIÊM TRỌNG ĐÃ XẢY RA 💥");
    console.error(err.stack);
    if (err.code === '23505') {
        return res.status(409).json({
            status: 'error',
            message: 'Dữ liệu bị trùng lặp. Vui lòng kiểm tra lại Mã sản phẩm hoặc Mã nhân viên.',
            details: err.detail
        });
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File quá lớn. Vui lòng chọn file dưới 15MB.' });
    }
    // GHI CHÚ: Xử lý lỗi từ fileFilter của Multer
    if (err.message === 'Định dạng file không được hỗ trợ! Chỉ chấp nhận Word, Excel, PDF, và ảnh.') {
        return res.status(415).json({ error: err.message });
    }
    res.status(500).json({
        status: 'error',
        message: 'Một lỗi không mong muốn đã xảy ra trên server.',
        error_details: err.message
    });
});

// --- PHẦN 5: KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    console.log(`===================================================`);
    console.log(`🚀 SERVER IS RUNNING (VERSION ${APP_VERSION}) ON PORT ${port}`);
    console.log(`===================================================`);
});