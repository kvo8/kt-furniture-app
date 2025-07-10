// =================================================================
// === FILE: index.js (PHIÊN BẢN CUỐI CÙNG - HOÀN THIỆN MỌI CHỨC NĂNG) ===
// === Giữ nguyên cấu trúc một file, không xóa, chỉ bổ sung           ===
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
console.log("Middleware configured successfully.");

// --- 2.2. Cấu hình Google Cloud Storage ---
const storageGCS = new Storage();
const bucketName = 'kt-cms-final-578163175425';
console.log(`GCS Bucket configured: ${bucketName}`);

// --- 2.3. Cấu hình Session ---
console.log("Configuring user session management...");
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-strong-secret-key-for-development-should-be-changed-in-production',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: IS_PRODUCTION,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 ngày
    }
}));
console.log("Session management configured successfully.");

// --- 2.4. Cấu hình Multer ---
const textOnlyUpload = multer().none();
console.log("Multer configured for text-only fields.");

// --- 2.5. Middleware Tùy Chỉnh ---
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

// --- PHẦN 3: CÁC API ENDPOINTS ---
console.log("Defining API endpoints...");

// == A. CÁC API VỀ USER VÀ TRANG CHỦ (GIỮ NGUYÊN) ==
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post("/api/users/register", async (req, res, next) => {
    try {
        const { ho_ten, ma_nhan_vien, password } = req.body;
        if (!ho_ten || !ma_nhan_vien || !password) {
            return res.status(400).json({ "error": "Vui lòng điền đầy đủ thông tin." });
        }
        const hash = await bcrypt.hash(password, saltRounds);
        const sql = 'INSERT INTO users (ho_ten, ma_nhan_vien, password) VALUES ($1, $2, $3) RETURNING id, ho_ten, ma_nhan_vien';
        const params = [ho_ten, ma_nhan_vien, hash];
        const result = await db.query(sql, params);
        const newUser = result.rows[0];
        req.session.user = { id: newUser.id, name: newUser.ho_ten, employeeId: newUser.ma_nhan_vien };
        res.status(201).json({ "message": "Đăng ký thành công và đã tự động đăng nhập." });
    } catch (err) {
        next(err); // Chuyển lỗi đến bộ xử lý lỗi tập trung
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
            req.session.user = { id: user.id, name: user.ho_ten, employeeId: user.ma_nhan_vien };
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

// == B. API CHO GOOGLE CLOUD STORAGE (GIỮ NGUYÊN) ==
app.post('/api/generate-upload-url', isLoggedIn, async (req, res, next) => {
    try {
        const { fileName, contentType } = req.body;
        if (!fileName || !contentType) {
            return res.status(400).json({ error: 'Cần có tên file và loại file.' });
        }
        const destFileName = `product-files/${Date.now()}-${fileName.replace(/\s/g, '_')}`;
        const options = {
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000,
            contentType: contentType,
        };
        const [url] = await storageGCS.bucket(bucketName).file(destFileName).getSignedUrl(options);
        res.status(200).json({
            uploadUrl: url,
            accessUrl: `https://storage.googleapis.com/${bucketName}/${destFileName}`
        });
    } catch (err) {
        next(err);
    }
});

// == C. CÁC API VỀ SẢN PHẨM ==

// READ ALL (GIỮ NGUYÊN)
app.get("/api/products", isLoggedIn, async (req, res, next) => {
    try {
        const sql = "SELECT * FROM products ORDER BY created_at DESC";
        const { rows } = await db.query(sql);
        res.json({ products: rows });
    } catch (err) {
        next(err);
    }
});

// READ ONE (GIỮ NGUYÊN)
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


// =======================================================================
// === BẮT ĐẦU PHẦN CẬP NHẬT QUAN TRỌNG CHO API CREATE & UPDATE SẢN PHẨM ===
// =======================================================================

// CREATE: Endpoint thêm sản phẩm mới
app.post("/api/products", isLoggedIn, textOnlyUpload, async (req, res, next) => {
    try {
        const data = req.body;
        const user = req.session.user;

        if (!data.id || !data.name_vi) {
             return res.status(400).json({ error: "Mã sản phẩm và Tên sản phẩm (VI) là bắt buộc." });
        }
        
        // GHI CHÚ: Đã thêm các trường mới vào câu lệnh SQL
        const sql = `
            INSERT INTO products (
                id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en, 
                fabric_vi, fabric_en, wicker_vi, wicker_en, production_place,
                company, customer, specification, material_vi, material_en, aluminum_profile, 
                supplier, "imageUrls", "drawingUrls", "materialsUrls", other_details,
                created_by_name, created_by_id, parent_id,
                height, width, length, packed_height, packed_width, packed_length
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32)
        `;
        // GHI CHÚ: Đã thêm các tham số mới, chuyển đổi sang null nếu không có giá trị
        const params = [
            data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en,
            data.color_vi, data.color_en, data.fabric_vi, data.fabric_en, data.wicker_vi, data.wicker_en,
            data.production_place, data.company, data.customer, data.specification,
            data.material_vi, data.material_en, data.aluminum_profile, 
            data.supplier || null,
            JSON.stringify(data.imageUrls || []),
            JSON.stringify(data.drawingUrls || []),
            JSON.stringify(data.materialsUrls || []),
            data.other_details || null, 
            user.name, user.id,
            data.parent_id || null,
            data.height || null, data.width || null, data.length || null,
            data.packed_height || null, data.packed_width || null, data.packed_length || null
        ];
        
        await db.query(sql, params);
        res.status(201).json({ message: "Lưu sản phẩm thành công!", id: data.id });
    } catch (err) {
        next(err);
    }
});


// UPDATE: Endpoint cập nhật sản phẩm
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
            values.push(finalValue === '' ? null : finalValue); // Chuyển chuỗi rỗng thành null
        };
        
        // GHI CHÚ: Đã thêm các trường mới vào danh sách cập nhật
        const updatableFields = [
            'name_vi', 'name_en', 'collection_vi', 'collection_en', 'color_vi', 'color_en',
            'fabric_vi', 'fabric_en', 'wicker_vi', 'wicker_en', 'production_place', 'company',
            'customer', 'specification', 'material_vi', 'material_en', 'aluminum_profile',
            'supplier', 'other_details', 'imageUrls', 'drawingUrls', 'materialsUrls',
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
        res.status(200).json({ message: "Cập nhật sản phẩm thành công!" });
    } catch (err) {
        next(err);
    }
});

// ========================================================
// === KẾT THÚC PHẦN CẬP NHẬT                             ===
// ========================================================

// --- NÂNG CẤP LỚN: API XÓA SẢN PHẨM VÀ FILE TRÊN GCS ---
/**
 * Hàm hỗ trợ xóa file trên GCS từ một sản phẩm
 * @param {object} product - Object sản phẩm từ DB
 */
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
        
        res.status(200).json({ message: 'Sản phẩm và các file liên quan đã được xóa thành công.' });
    } catch (err) {
        next(err);
    }
});

// == D. CÁC API VỀ REVIEWS (GIỮ NGUYÊN) ==
app.post("/api/reviews", async (req, res, next) => {
    try {
        const { productId, rating, comment, author_name } = req.body;
        if (!productId || !rating || !author_name) {
            return res.status(400).json({ error: "Vui lòng cung cấp đầy đủ thông tin bắt buộc." });
        }
        const sql = `INSERT INTO reviews (product_id, rating, comment, author_name) VALUES ($1, $2, $3, $4) RETURNING id`;
        const result = await db.query(sql, [productId, rating, comment || '', author_name]);
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
console.log("API Endpoints defined successfully.");

// == E. ENDPOINT CHẨN ĐOÁN ==
const APP_VERSION = "15.0_ALL_FIELDS_FINAL"; // Cập nhật phiên bản
app.get("/api/version", (req, res) => {
    res.status(200).json({
        status: "OK",
        version: APP_VERSION,
        note: "This is a complete, single-file, and stable version with enhanced features including all new fields.",
        server_time: new Date().toISOString()
    });
});

// --- PHẦN 4: MIDDLEWARE XỬ LÝ LỖI TẬP TRUNG ---
app.use((err, req, res, next) => {
    console.error("💥 MỘT LỖI NGHIÊM TRỌNG ĐÃ XẢY RA 💥");
    console.error(err.stack);

    if (err.code === '23505') { // Lỗi trùng lặp dữ liệu
        return res.status(409).json({
            status: 'error',
            message: 'Dữ liệu bị trùng lặp. Vui lòng kiểm tra lại Mã sản phẩm.',
            details: err.detail
        });
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