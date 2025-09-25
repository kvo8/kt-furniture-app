// =================================================================
// === FILE: index.js (PHIÊN BẢN CHỈNH SỬA CHO RENDER/PRODUCTION) ===
// === Lưu ý: File upload cục bộ vẫn hoạt động NHƯNG không bền vững ===
// =================================================================

// --- PHẦN 1: IMPORT CÁC THƯ VIỆN CẦN THIẾT ---
// Ghi log ra console để theo dõi quá trình khởi tạo server
console.log("Initializing required libraries...");
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Thêm thư viện File System để xử lý file trên máy
const db = require('./database.js'); // Đảm bảo file database.js đã được cấu hình SSL cho Render
console.log("Libraries initialized successfully.");

// --- PHẦN 2: KHỞI TẠO VÀ CẤU HÌNH EXPRESS APP ---
console.log("Configuring Express application...");
const app = express();
const saltRounds = 10; // Số vòng lặp để mã hóa mật khẩu, tăng tính bảo mật
const port = process.env.PORT || 3000; // Sử dụng cổng do Render cung cấp
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- 2.1. Cấu hình Middleware Cơ Bản ---
// Middleware là các hàm chạy ở giữa request và response để xử lý các tác vụ chung
app.use(cors()); // Cho phép các request từ domain khác (cần thiết cho API)
app.use(express.json({ limit: '15mb' })); // Cho phép server đọc dữ liệu JSON gửi lên, giới hạn 15MB
app.use(express.urlencoded({ extended: true, limit: '15mb' })); // Cho phép server đọc dữ liệu từ form, giới hạn 15MB
app.use(express.static('public')); // Phục vụ các file tĩnh (HTML, CSS, JS) từ thư mục 'public'
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'))); // Tạo một đường dẫn ảo cho thư mục uploads
console.log("Middleware configured successfully.");

// --- 2.2. (ĐÃ XÓA) Cấu hình Google Cloud Storage ---
// Giữ nguyên: Phần này đã được xóa bỏ để chuyển sang lưu trữ trên máy local.

// --- 2.3. Cấu hình Session ---
// Session dùng để lưu trữ thông tin đăng nhập của người dùng
console.log("Configuring user session management...");
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-strong-secret-key-for-development', // Chuỗi bí mật phải được đặt trong biến môi trường
    resave: false, // Không lưu lại session nếu không có gì thay đổi
    saveUninitialized: true, // Lưu session mới ngay cả khi chưa có dữ liệu
    cookie: {
        secure: IS_PRODUCTION, // Chỉ gửi cookie qua HTTPS ở môi trường production (Bắt buộc với Render)
        httpOnly: true, // Ngăn JavaScript phía client truy cập vào cookie
        maxAge: 24 * 60 * 60 * 1000 // Thời gian sống của cookie (24 giờ)
    }
}));
console.log("Session management configured successfully.");

// --- 2.4. Cấu hình Multer (Thư viện xử lý upload file) ---
// Bổ sung bộ lọc file để chỉ định rõ các định dạng được phép
const fileFilter = (req, file, cb) => {
    // Danh sách các loại file (MIME types) mà chúng ta cho phép
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif',
        'application/pdf',
        'application/msword', // cho file .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // cho file .docx
        'application/vnd.ms-excel', // cho file .xls
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // cho file .xlsx
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true); // Nếu loại file hợp lệ, cho phép upload
    } else {
        // Nếu loại file không hợp lệ, từ chối và báo lỗi
        cb(new Error('Định dạng file không được hỗ trợ! Chỉ chấp nhận Word, Excel, PDF, và ảnh.'), false);
    }
};

// Cấu hình Multer để LƯU FILE VÀO THƯ MỤC 'public/uploads' trên máy
const storageDisk = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'public/uploads/';
        // Đảm bảo thư mục tồn tại, nếu chưa có thì tự động tạo
        // CHÚ Ý: Trên Render, thư mục này là tạm thời và sẽ bị xóa khi server restart.
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Tạo ra một tên file mới không bị trùng lặp để tránh ghi đè file
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Tạo middleware upload để sử dụng trong các API
const uploadToDisk = multer({
    storage: storageDisk,
    limits: { fileSize: 50 * 1024 * 1024 }, // Giữ nguyên giới hạn 50MB
    fileFilter: fileFilter
});

// Cấu hình Multer cho các request chỉ chứa dữ liệu text (không có file)
const textOnlyUpload = multer().none();
console.log("Multer configured for local disk storage with size limits (50MB).");

// --- 2.5. Middleware Tùy Chỉnh ---
// Middleware để kiểm tra xem người dùng đã đăng nhập hay chưa
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next(); // Nếu đã đăng nhập, cho phép đi tiếp
    } else {
        // Nếu chưa đăng nhập, trả về lỗi 401 Unauthorized
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

/**
 * Ghi lại một hành động vào bảng activity_log trong database
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
// Đây là nơi định nghĩa các đường dẫn API mà frontend sẽ gọi đến
console.log("Defining API endpoints...");

// == A. CÁC API VỀ USER VÀ TRANG CHỦ ==
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Đăng ký tài khoản mới
app.post("/api/users/register", async (req, res, next) => {
    try {
        const { ho_ten, ma_nhan_vien, password } = req.body;
        if (!ho_ten || !ma_nhan_vien || !password || ma_nhan_vien.length < 2) {
            return res.status(400).json({ "error": "Vui lòng điền đầy đủ và chính xác thông tin." });
        }
        const positionMap = { 'GD': 'Giám Đốc', 'IT': 'IT', 'KT': 'Kỹ Thuật', 'VT': 'Vật Tư', 'SX': 'Sản Xuất', 'NS': 'Nhân Sự', 'KD': 'Kinh Doanh' };
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

// API Đăng nhập
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

// API Lấy thông tin người dùng đang đăng nhập
app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

// API Lấy danh sách tất cả nhân viên
app.get("/api/users", isLoggedIn, async (req, res, next) => {
    try {
        const sql = "SELECT id, ho_ten, ma_nhan_vien, chuc_vu FROM users ORDER BY id ASC";
        const { rows } = await db.query(sql);
        res.json({ users: rows });
    } catch (err) {
        next(err);
    }
});

// API Xóa một nhân viên
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
// API xử lý việc upload file và lưu vào thư mục local
app.post('/api/upload-direct', isLoggedIn, uploadToDisk.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Không có file nào được gửi lên.' });
    }
    // File đã được Multer lưu lại. LƯU Ý: File này là tạm thời trên Render!
    // Ví dụ: /uploads/file-1668888888-xyz.jpg
    const accessUrl = `/uploads/${req.file.filename}`;
    res.status(200).json({ accessUrl: accessUrl });
});

// == C. CÁC API VỀ SẢN PHẨM ==
// API Lấy danh sách tất cả sản phẩm
app.get("/api/products", isLoggedIn, async (req, res, next) => {
    try {
        const sql = "SELECT * FROM products ORDER BY created_at DESC";
        const { rows } = await db.query(sql);
        res.json({ products: rows });
    } catch (err) {
        next(err);
    }
});

// API Lấy thông tin chi tiết của một sản phẩm
app.get("/api/products/:id", async (req, res, next) => {
    try {
        const sql = `SELECT * FROM products WHERE id = $1`;
        const { rows } = await db.query(sql, [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: "Sản phẩm không tồn tại" });
        }
        const product = rows[0];
        // Chuyển đổi các trường JSON từ text về lại dạng mảng
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

// API Thêm sản phẩm
app.post("/api/products", isLoggedIn, textOnlyUpload, async (req, res, next) => {
    console.log("--- Bắt đầu xử lý API: THÊM SẢN PHẨM MỚI (PHIÊN BẢN TỰ ĐỘNG) ---");
    console.log("Dữ liệu thô nhận được từ req.body:", req.body);
    try {
        const data = req.body;
        const user = req.session.user;
        if (!data.id || !data.name_vi) {
            return res.status(400).json({ error: "Mã sản phẩm và Tên sản phẩm (VI) là bắt buộc." });
        }
        const productData = {
            ...data,
            created_by_name: user.name,
            created_by_id: user.id,
            created_at: new Date()
        };
        ['imageUrls', 'drawingUrls', 'materialsUrls'].forEach(field => {
            if (productData[field] && Array.isArray(productData[field])) {
                productData[field] = JSON.stringify(productData[field]);
            }
        });
        for (const key in productData) {
            if (productData[key] === '') {
                productData[key] = null;
            }
        }
        const fields = Object.keys(productData).map(key => `"${key}"`).join(', ');
        const placeholders = Object.keys(productData).map((_, i) => `$${i + 1}`).join(', ');
        const values = Object.values(productData);
        const sql = `INSERT INTO products (${fields}) VALUES (${placeholders})`;
        await db.query(sql, values);
        await logActivity('CREATE_PRODUCT', `Sản phẩm '${data.name_vi}' (ID: ${data.id}) đã được tạo.`, user.name);
        console.log(`--- Sản phẩm ${data.id} đã được tạo và lưu vào database thành công. ---`);
        res.status(201).json({ message: "Lưu sản phẩm thành công!", id: data.id });
    } catch (err) {
        console.error("!!! LỖI NGHIÊM TRỌNG KHI THÊM SẢN PHẨM !!!");
        console.error("Chi tiết lỗi:", err);
        next(err);
    }
});

// API Sửa sản phẩm
app.put("/api/products/:id", isLoggedIn, textOnlyUpload, async (req, res, next) => {
    console.log(`--- Bắt đầu xử lý API: CẬP NHẬT SẢN PHẨM ID: ${req.params.id} ---`);
    try {
        const { id } = req.params;
        const data = req.body;
        delete data.id;
        delete data.created_at;
        delete data.created_by_id;
        delete data.created_by_name;
        ['imageUrls', 'drawingUrls', 'materialsUrls'].forEach(field => {
            if (data[field] && Array.isArray(data[field])) {
                data[field] = JSON.stringify(data[field]);
            }
        });
        for (const key in data) {
            if (data[key] === '') {
                data[key] = null;
            }
        }
        const fieldsToUpdate = Object.keys(data);
        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ message: "Không có dữ liệu nào được gửi để cập nhật." });
        }
        const setString = fieldsToUpdate.map((key, i) => `"${key}" = $${i + 1}`).join(', ');
        const values = fieldsToUpdate.map(key => data[key]);
        values.push(id);
        const sql = `UPDATE products SET ${setString} WHERE id = $${fieldsToUpdate.length + 1}`;
        const result = await db.query(sql, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Không tìm thấy sản phẩm để cập nhật." });
        }
        await logActivity('EDIT_PRODUCT', `Sản phẩm ID: ${id} đã được cập nhật.`, req.session.user.name);
        res.status(200).json({ message: "Cập nhật sản phẩm thành công!" });
    } catch (err) {
        console.error(`!!! LỖI NGHIÊM TRỌNG KHI CẬP NHẬT SẢN PHẨM ${req.params.id}:`, err);
        next(err);
    }
});

// Hàm xóa file được lưu trên máy local
async function deleteLocalFiles(product) {
    // === ĐIỀU CHỈNH QUAN TRỌNG CHO RENDER/PRODUCTION ===
    if (IS_PRODUCTION) {
        console.log(`[RENDER DEPLOYMENT] Bỏ qua xóa file cục bộ cho sản phẩm ID: ${product.id}. File sẽ tự động bị xóa khi container restart.`);
        return;
    }
    // === KẾT THÚC ĐIỀU CHỈNH ===

    console.log(`Bắt đầu quá trình xóa file local cho sản phẩm ID: ${product.id}`);
    const urlsToDelete = [];
    ['imageUrls', 'drawingUrls', 'materialsUrls'].forEach(field => {
        if (product[field] && typeof product[field] === 'string') {
            try {
                const parsedUrls = JSON.parse(product[field]);
                if (Array.isArray(parsedUrls)) {
                    parsedUrls.forEach(item => {
                        const url = (typeof item === 'object' && item.url) ? item.url : item;
                        if (url) {
                            urlsToDelete.push(url);
                        }
                    });
                }
            } catch (e) { 
                console.error(`Lỗi khi parse JSON cho trường ${field}:`, e);
            }
        }
    });

    if (urlsToDelete.length === 0) {
        console.log(`Không có file nào cần xóa cho sản phẩm ${product.id}.`);
        return;
    }

    const deletionPromises = urlsToDelete.map(relativeUrl => {
        return new Promise((resolve) => {
            // Chuyển đổi từ URL (vd: /uploads/file.jpg) thành đường dẫn file trên hệ thống (vd: public/uploads/file.jpg)
            const fileName = path.basename(relativeUrl);
            const filePath = path.join(__dirname, 'public', 'uploads', fileName);

            fs.unlink(filePath, (err) => {
                if (err && err.code !== 'ENOENT') { // Bỏ qua nếu lỗi là "file không tồn tại"
                    console.error(`ERROR: Lỗi khi xóa file ${filePath}:`, err.message);
                } else if (err) {
                    console.log(`INFO: File không tồn tại để xóa: ${filePath}`);
                }
                else {
                    console.log(`SUCCESS: Đã xóa file ${filePath}`);
                }
                resolve(); // Luôn luôn resolve để Promise.all không bị dừng giữa chừng
            });
        });
    });

    await Promise.all(deletionPromises);
    console.log(`Hoàn tất quá trình xóa file cho sản phẩm ${product.id}.`);
}

// API Xóa sản phẩm
app.delete("/api/products/:id", isLoggedIn, async (req, res, next) => {
    const { id } = req.params;
    try {
        const selectResult = await db.query('SELECT "imageUrls", "drawingUrls", "materialsUrls", id FROM products WHERE id = $1', [id]);
        if (selectResult.rowCount === 0) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm này để xóa.' });
        }
        const productToDelete = selectResult.rows[0];
        
        // Gọi hàm xóa file local mới thay vì hàm xóa trên GCS
        // HÀM NÀY ĐÃ ĐƯỢC ĐIỀU CHỈNH để bỏ qua việc xóa trong môi trường Production
        await deleteLocalFiles(productToDelete);

        await db.query('DELETE FROM products WHERE id = $1', [id]);
        await logActivity('DELETE_PRODUCT', `Sản phẩm ID: ${id} đã bị xóa.`, req.session.user.name);
        res.status(200).json({ message: 'Sản phẩm và các file liên quan đã được xóa thành công.' });
    } catch (err) {
        next(err);
    }
});

// == D. CÁC API VỀ REVIEWS ==
// API Thêm đánh giá
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

// API Lấy đánh giá của sản phẩm
app.get("/api/products/:id/reviews", async (req, res, next) => {
    try {
        const sql = "SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC";
        const { rows } = await db.query(sql, [req.params.id]);
        res.json({ reviews: rows });
    } catch (err) {
        next(err);
    }
});

// == E. CÁC API VỀ TIN NHẮN NỘI BỘ ==
// API Gửi tin nhắn
app.post("/api/messages", isLoggedIn, async (req, res, next) => {
    console.log("--- Bắt đầu xử lý yêu cầu GỬI TIN NHẮN MỚI ---");
    try {
        const { recipient_employee_id, title, body } = req.body;
        const sender = req.session.user;
        if (!recipient_employee_id || !title || !body) {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ Mã nhân viên người nhận, tiêu đề và nội dung." });
        }
        if (sender.employeeId === recipient_employee_id) {
            return res.status(400).json({ error: "Bạn không thể gửi tin nhắn cho chính mình." });
        }
        const recipientResult = await db.query('SELECT id, ho_ten FROM users WHERE ma_nhan_vien = $1', [recipient_employee_id]);
        if (recipientResult.rowCount === 0) {
            return res.status(404).json({ error: `Không tìm thấy nhân viên với mã '${recipient_employee_id}'.` });
        }
        const recipient = recipientResult.rows[0];
        const sql = 'INSERT INTO messages (sender_id, sender_name, recipient_id, title, body) VALUES ($1, $2, $3, $4, $5)';
        const params = [sender.id, sender.name, recipient.id, title, body];
        await db.query(sql, params);
        await logActivity('NEW_MESSAGE', `Người dùng '${sender.name}' đã gửi tin nhắn đến '${recipient.ho_ten}'`, sender.name);
        res.status(201).json({ message: "Gửi tin nhắn thành công!" });
    } catch (err) {
        next(err);
    }
});

// API Lấy danh sách tin nhắn
app.get("/api/messages", isLoggedIn, async (req, res, next) => {
    try {
        const currentUserId = req.session.user.id;
        const sql = "SELECT * FROM messages WHERE recipient_id = $1 ORDER BY created_at DESC";
        const { rows } = await db.query(sql, [currentUserId]);
        res.json({ messages: rows });
    } catch (err) {
        next(err);
    }
});

// API Đánh dấu tin nhắn đã đọc
app.put("/api/messages/:id/read", isLoggedIn, async (req, res, next) => {
    const messageId = req.params.id;
    const currentUserId = req.session.user.id;
    try {
        const sql = 'UPDATE messages SET is_read = TRUE WHERE id = $1 AND recipient_id = $2';
        const result = await db.query(sql, [messageId, currentUserId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Không tìm thấy tin nhắn hoặc bạn không có quyền thực hiện." });
        }
        res.status(200).json({ message: "Đã đánh dấu là đã đọc." });
    } catch (err) {
        next(err);
    }
});

// == F. API NHẬT KÝ HOẠT ĐỘNG ==
app.get("/api/activity-log", isLoggedIn, async (req, res, next) => {
    try {
        const sql = "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20";
        const { rows } = await db.query(sql);
        res.json({ activities: rows });
    } catch (err) {
        next(err);
    }
});


// =======================================================================
// === BẮT ĐẦU KHỐI CODE MỚI: API CHO BẢNG TIN THÔNG BÁO ===
// =======================================================================
console.log("Defining Announcement Board API endpoints...");

// API 1: Tải tất cả bài đăng trên bảng tin
app.get('/api/announcements', isLoggedIn, async (req, res, next) => {
    try {
        // 1. Lấy tất cả bài đăng, tương tự như cũ
        const postsQuery = `
            SELECT 
                a.id, a.content, a.image_url, a.created_at,
                u.ho_ten AS author_name 
            FROM announcements a
            JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC;
        `;
        const postsResult = await db.query(postsQuery);
        const posts = postsResult.rows;

        // Nếu không có bài đăng nào thì trả về mảng rỗng luôn
        if (posts.length === 0) {
            return res.json([]);
        }

        // 2. Lấy tất cả bình luận và tên người bình luận trong một query duy nhất
        const commentsQuery = `
            SELECT 
                c.id, c.announcement_id, c.content, c.created_at,
                u.ho_ten AS author_name
            FROM comments c
            JOIN users u ON c.user_id = u.id
            ORDER BY c.created_at ASC;
        `;
        const commentsResult = await db.query(commentsQuery);
        const comments = commentsResult.rows;

        // 3. Tạo một map để nhóm các bình luận theo ID của bài đăng (announcement_id)
        const commentsMap = {};
        comments.forEach(comment => {
            const postId = comment.announcement_id;
            if (!commentsMap[postId]) {
                commentsMap[postId] = [];
            }
            commentsMap[postId].push(comment);
        });

        // 4. Gắn mảng bình luận vào mỗi bài đăng tương ứng
        posts.forEach(post => {
            post.comments = commentsMap[post.id] || []; // Gán mảng bình luận, nếu không có thì gán mảng rỗng
        });

        // 5. Trả về dữ liệu hoàn chỉnh cho frontend
        res.json(posts);

    } catch (error) {
        console.error('Lỗi khi tải bài đăng và bình luận:', error);
        next(error);
    }
});

// API 2: Tạo bài đăng mới (có xử lý upload ảnh)
app.post('/api/announcements', isLoggedIn, uploadToDisk.single('image'), async (req, res, next) => {
    const { content } = req.body;
    const userId = req.session.user.id;
    let imageUrl = null; // Mặc định là không có ảnh

    if (!content) {
        return res.status(400).json({ error: 'Nội dung không được để trống' });
    }

    try {
        // Nếu có file ảnh được gửi lên, Multer đã tự động lưu nó
        if (req.file) {
            // Lấy đường dẫn tới file đã lưu trên local (tạm thời trên Render)
            imageUrl = `/uploads/${req.file.filename}`;
        }
        
        // Sau khi có URL ảnh (hoặc không), lưu thông tin vào database
        const query = 'INSERT INTO announcements (user_id, content, image_url) VALUES ($1, $2, $3)';
        await db.query(query, [userId, content, imageUrl]);
        
        await logActivity('NEW_ANNOUNCEMENT', `Người dùng '${req.session.user.name}' đã tạo một thông báo mới.`, req.session.user.name);
        res.status(201).json({ message: 'Đăng bài thành công' });
    } catch (error) {
        console.error('Lỗi khi tạo bài đăng:', error);
        next(error);
    }
});


// API 3: Thêm bình luận mới vào một bài đăng
app.post('/api/announcements/:id/comments', isLoggedIn, async (req, res, next) => {
    const announcementId = req.params.id;
    const { content } = req.body;
    const userId = req.session.user.id;

    if (!content) {
        return res.status(400).json({ error: 'Nội dung bình luận không được để trống' });
    }

    try {
        const query = 'INSERT INTO comments (announcement_id, user_id, content) VALUES ($1, $2, $3)';
        await db.query(query, [announcementId, userId, content]);
        
        await logActivity('NEW_COMMENT', `Người dùng '${req.session.user.name}' đã bình luận về một thông báo.`, req.session.user.name);
        res.status(201).json({ message: 'Bình luận thành công' });
    } catch (error) {
        console.error('Lỗi khi bình luận:', error);
        next(error);
    }
});

// API 4: API tổng hợp cho chuông thông báo (đã có logic)
app.get('/api/notifications', isLoggedIn, async (req, res, next) => {
    try {
        const currentUserId = req.session.user.id;
        
        // Lấy tin nhắn chưa đọc
        const msgSql = "SELECT id, sender_name, title, created_at FROM messages WHERE recipient_id = $1 AND is_read = FALSE ORDER BY created_at DESC";
        const msgResult = await db.query(msgSql, [currentUserId]);

        // Lấy bài đăng mới (ví dụ: trong 24 giờ qua)
        const annSql = `
            SELECT a.id, u.ho_ten as author_name, a.created_at 
            FROM announcements a 
            JOIN users u ON a.user_id = u.id 
            WHERE a.created_at > NOW() - INTERVAL '24 hours' 
            ORDER BY a.created_at DESC`;
        const annResult = await db.query(annSql);

        // Lấy hoạt động gần đây
        const actSql = "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 5";
        const actResult = await db.query(actSql);

        res.json({
            unread_messages: msgResult.rows,
            new_announcements: annResult.rows,
            recent_activities: actResult.rows
        });
    } catch(error) {
        console.error('Lỗi khi lấy thông báo tổng hợp:', error);
        next(error);
    }
});

// =======================================================================
// === KẾT THÚC KHỐI CODE MỚI: API CHO BẢNG TIN THÔNG BÁO ===
// =======================================================================


// == G. ENDPOINT CHẨN ĐOÁN ==
const APP_VERSION = "19.0_ANNOUNCEMENT_INTEGRATED_RENDER"; // Đổi tên phiên bản để nhận biết
app.get("/api/version", (req, res) => {
    res.status(200).json({
        status: "OK",
        version: APP_VERSION,
        // Cập nhật chú thích để phản ánh môi trường Render
        note: IS_PRODUCTION 
            ? "This version runs on RENDER.COM. File storage is temporary (ephemeral)."
            : "This version runs on LOCALHOST and uses local file storage.",
        server_time: new Date().toISOString()
    });
});

// --- PHẦN 4: MIDDLEWARE XỬ LÝ LỖI TẬP TRUNG ---
// Đây là nơi tất cả các lỗi từ các hàm async sẽ được chuyển đến
app.use((err, req, res, next) => {
    console.error("💥 MỘT LỖI NGHIÊM TRỌNG ĐÃ XẢY RA 💥");
    console.error(err.stack); // In ra toàn bộ dấu vết lỗi để debug
    // Xử lý lỗi trùng lặp dữ liệu từ database (unique constraint)
    if (err.code === '23505') {
        return res.status(409).json({
            status: 'error',
            message: 'Dữ liệu bị trùng lặp. Vui lòng kiểm tra lại Mã sản phẩm hoặc Mã nhân viên.',
            details: err.detail
        });
    }
    // Xử lý lỗi file quá lớn từ Multer
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File quá lớn. Vui lòng chọn file dưới 50MB.' });
    }
    // Xử lý lỗi định dạng file không hợp lệ từ Multer
    if (err.message.includes('Định dạng file không được hỗ trợ')) {
        return res.status(415).json({ error: err.message });
    }
    // Xử lý tất cả các lỗi 500 khác
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