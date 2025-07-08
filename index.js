// =================================================================
// === FILE: index.js (PHIÊN BẢN HOÀN THIỆN NHẤT - 08/07/2025)     ===
// === Tích hợp mọi sửa lỗi và bổ sung chú thích chi tiết         ===
// =================================================================

// --- PHẦN 1: IMPORT CÁC THƯ VIỆN CẦN THIẾT ---
// Các thư viện này là nền tảng để xây dựng server
console.log("Initializing required libraries...");
const express = require('express');        // Framework chính để xây dựng web server
const cors = require('cors');              // Middleware cho phép Cross-Origin Resource Sharing
const bcrypt = require('bcryptjs');        // Thư viện để mã hóa mật khẩu
const session = require('express-session');// Middleware để quản lý phiên làm việc của người dùng
const multer = require('multer');          // Middleware chuyên xử lý upload file
const path = require('path');              // Module của Node.js để làm việc với đường dẫn file
const db = require('./database.js');       // File kết nối cơ sở dữ liệu PostgreSQL của bạn
const fs = require('fs');                  // Module của Node.js để làm việc với hệ thống file
console.log("Libraries initialized successfully.");

// --- PHẦN 2: KHỞI TẠO VÀ CẤU HÌNH EXPRESS APP ---
console.log("Configuring Express application...");
const app = express();                     // Khởi tạo một ứng dụng Express
const saltRounds = 10;                     // Yếu tố chi phí cho việc mã hóa mật khẩu, tăng tính bảo mật
const port = process.env.PORT || 3000;     // Sử dụng cổng do môi trường (Cloud Run) cung cấp, hoặc cổng 3000 ở local

// --- 2.1. Cấu hình Middleware Cơ Bản ---
// Middleware là các hàm chạy tuần tự cho mỗi request đến server.
app.use(cors());                           // Cho phép các request từ tên miền khác (ví dụ: từ frontend)

// ==========================================================================================
// === BẮT ĐẦU PHẦN SỬA LỖI QUAN TRỌNG NHẤT: TĂNG GIỚI HẠN KÍCH THƯỚC REQUEST (SỬA LỖI 413) ===
// ==========================================================================================
// Mặc định, Express chỉ cho phép request rất nhỏ (khoảng 100kb).
// Khi upload file, request sẽ lớn hơn nhiều và gây ra lỗi "413 Content Too Large".
// Chúng ta cần tăng giới hạn này lên một con số hợp lý, ví dụ 50 megabytes.
console.log("Applying request body size limit to 50mb to allow file uploads...");
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));
// ==========================================================================================
// === KẾT THÚC PHẦN SỬA LỖI QUAN TRỌNG NHẤT ==============================================
// ==========================================================================================

// Phục vụ các file tĩnh (HTML, CSS, JS phía client) từ thư mục 'public'
app.use(express.static('public'));

// Tạo một đường dẫn ảo '/uploads' để truy cập các file đã được upload trong thư mục 'public/uploads'
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
console.log("Middleware configured successfully.");


// --- 2.2. Cấu hình Session ---
// Session dùng để lưu trạng thái đăng nhập của người dùng.
console.log("Configuring user session management...");
app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-strong-secret-key-for-development-should-be-changed-in-production',
    resave: false,             // Không lưu lại session nếu không có gì thay đổi
    saveUninitialized: true,   // Lưu session mới ngay cả khi chưa có dữ liệu
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Chỉ gửi cookie qua HTTPS khi deploy
        httpOnly: true,                                // Ngăn JavaScript ở client truy cập vào cookie, tăng bảo mật
        maxAge: 24 * 60 * 60 * 1000                    // Thời gian sống của cookie: 1 ngày
    }
}));
console.log("Session management configured successfully.");


// --- 2.3. Cấu hình Multer để Upload File ---
// Multer sẽ xử lý dữ liệu form multipart/form-data, tách riêng file và các trường dữ liệu khác.
console.log("Configuring Multer for file uploads...");
const uploadDir = path.join(__dirname, 'public/uploads');
// Kiểm tra và tạo thư mục 'uploads' nếu nó chưa tồn tại
if (!fs.existsSync(uploadDir)) {
    console.log(`Upload directory not found. Creating '${uploadDir}'...`);
    fs.mkdirSync(uploadDir, { recursive: true });
}
// Định nghĩa nơi lưu trữ và cách đặt tên file
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir) },
    filename: (req, file, cb) => {
        // Đặt tên file là thời gian hiện tại (timestamp) + đuôi file gốc để đảm bảo tên là duy nhất
        const uniqueFilename = Date.now() + path.extname(file.originalname);
        cb(null, uniqueFilename);
    }
});
// Tạo middleware upload của Multer, cho phép nhận file từ các field được chỉ định
const upload = multer({
    storage: storage,
    // Thêm giới hạn file size ở đây nếu cần, ví dụ: limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
}).fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'drawingFile', maxCount: 1 },
    { name: 'materialsFile', maxCount: 1 }
]);
console.log("Multer configured successfully.");

// --- 2.4. Middleware Tùy Chỉnh ---

// Middleware Kiểm Tra Đăng Nhập: Bảo vệ các API yêu cầu xác thực.
const isLoggedIn = (req, res, next) => {
    // Nếu trong session có thông tin user, nghĩa là đã đăng nhập -> cho phép đi tiếp
    if (req.session && req.session.user) {
        next();
    } else {
        // Nếu chưa đăng nhập, trả về lỗi 401 (Unauthorized)
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

// Middleware Xử Lý Lỗi Upload Của Multer: Ngăn server bị crash khi upload file lỗi.
const handleUploadMiddleware = (req, res, next) => {
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error("A Multer error occurred during upload:", err.message);
            return res.status(400).json({ error: `Lỗi khi upload file: ${err.message}.` });
        } else if (err) {
            console.error("An unknown error occurred during upload:", err.message);
            return res.status(500).json({ error: `Đã xảy ra lỗi không mong muốn khi upload: ${err.message}` });
        }
        // Nếu không có lỗi, chuyển sang middleware tiếp theo trong chuỗi
        next();
    });
};


// --- PHẦN 3: CÁC API ENDPOINTS ---
// Đây là nơi định nghĩa các đường dẫn API mà frontend sẽ gọi đến.
console.log("Defining API endpoints...");

// == A. CÁC API VỀ USER VÀ TRANG CHỦ ==

// Endpoint gốc, phục vụ trang đăng nhập/đăng ký
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint đăng ký người dùng mới
app.post("/api/users/register", async (req, res) => {
    const { ho_ten, ma_nhan_vien, password } = req.body;
    if (!ho_ten || !ma_nhan_vien || !password) {
        return res.status(400).json({ "error": "Vui lòng điền đầy đủ thông tin." });
    }
    try {
        // Mã hóa mật khẩu bằng bcrypt để tăng cường bảo mật trước khi lưu vào DB
        const hash = await bcrypt.hash(password, saltRounds);
        const sql = 'INSERT INTO users (ho_ten, ma_nhan_vien, password) VALUES ($1, $2, $3) RETURNING id, ho_ten, ma_nhan_vien';
        const params = [ho_ten, ma_nhan_vien, hash];
        const result = await db.query(sql, params);
        const newUser = result.rows[0];
        // Tự động đăng nhập cho người dùng mới bằng cách lưu thông tin vào session
        req.session.user = { id: newUser.id, name: newUser.ho_ten, employeeId: newUser.ma_nhan_vien };
        res.status(201).json({ "message": "Đăng ký thành công và đã tự động đăng nhập." });
    } catch (err) {
        console.error("Registration error:", err.message);
        // Bắt lỗi cụ thể khi mã nhân viên đã tồn tại
        if (err.code === '23505') { // Lỗi của PostgreSQL khi vi phạm ràng buộc UNIQUE
            return res.status(400).json({ "error": "Mã nhân viên này đã tồn tại." });
        }
        res.status(500).json({ "error": `Server error during registration: ${err.message}` });
    }
});

// Endpoint đăng nhập
app.post("/api/users/login", async (req, res) => {
    const { ma_nhan_vien, password } = req.body;
    const sql = "SELECT * FROM users WHERE ma_nhan_vien = $1";
    try {
        const { rows } = await db.query(sql, [ma_nhan_vien]);
        const user = rows[0];
        // Kiểm tra xem user có tồn tại không
        if (!user) {
            return res.status(401).json({ "error": "Mã nhân viên hoặc mật khẩu không đúng." });
        }
        // So sánh mật khẩu người dùng nhập với hash đã lưu trong DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            // Nếu khớp, lưu thông tin vào session để xác thực các request sau
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

// Endpoint lấy thông tin user đang đăng nhập (dùng cho việc kiểm tra trạng thái ở frontend)
app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

// == B. CÁC API VỀ SẢN PHẨM ==

// Endpoint lấy danh sách tất cả sản phẩm
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

// Endpoint lấy thông tin chi tiết 1 sản phẩm
app.get("/api/products/:id", async (req, res) => {
    // Dùng ALIAS và dấu ngoặc kép để đảm bảo tên cột luôn đúng, bất kể database case-sensitive hay không
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

// Endpoint thêm sản phẩm mới
app.post("/api/products", isLoggedIn, handleUploadMiddleware, async (req, res) => {
    const data = req.body;
    const user = req.session.user;
    
    // Sử dụng optional chaining (?.) để kiểm tra sự tồn tại của file một cách an toàn
    const imageUrl = req.files?.productImage?.[0] ? '/uploads/' + req.files.productImage[0].filename : null;
    const drawingUrl = req.files?.drawingFile?.[0] ? '/uploads/' + req.files.drawingFile[0].filename : null;
    const materialsUrl = req.files?.materialsFile?.[0] ? '/uploads/' + req.files.materialsFile[0].filename : null;

    // Câu lệnh SQL này phải khớp với tên cột trong DB (đã được sửa bằng ALTER TABLE)
    const sql = `
        INSERT INTO products (
            id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en, 
            fabric_vi, fabric_en, wicker_vi, wicker_en, production_place,
            company, customer, specification, material_vi, material_en, aluminum_profile, 
            "imageUrl", "drawingUrl", "materialsUrl", other_details,
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
        console.error("Error inserting product into DB:", err.stack); // Dùng err.stack để có log chi tiết hơn
        if (err.code === '23505' && err.constraint === 'products_pkey') {
             return res.status(400).json({ "error": `Lỗi: Mã sản phẩm '${data.id}' đã tồn tại trong hệ thống.` });
        }
        // Trả về lỗi chi tiết từ DB để dễ dàng gỡ lỗi hơn
        res.status(500).json({ "error": `Lỗi khi lưu vào cơ sở dữ liệu: ${err.message}` });
    }
});

// Endpoint xóa sản phẩm
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

// == C. CÁC API VỀ REVIEWS ==

// Endpoint thêm đánh giá mới
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

// Endpoint lấy danh sách đánh giá của một sản phẩm
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

// =======================================================================
// === BẮT ĐẦU PHẦN THÊM MỚI ĐỂ CHẨN ĐOÁN LỖI ============================
// =======================================================================
// Đây là endpoint đặc biệt giúp bạn kiểm tra xem phiên bản code mới nhất đã được deploy thành công hay chưa.
const APP_VERSION = "5.0_FINAL_CHECK";

app.get("/api/version", (req, res) => {
    console.log(`Version check requested. Current version: ${APP_VERSION}`);
    res.status(200).json({
        status: "success",
        message: "KT-CMS-FINAL Service is running.",
        version: APP_VERSION,
        note: "If you see this version, the latest index.js is deployed correctly.",
        server_time: new Date().toISOString()
    });
});
// =======================================================================
// === KẾT THÚC PHẦN THÊM MỚI ĐỂ CHẨN ĐOÁN LỖI ============================
// =======================================================================

// --- PHẦN 4: KHỞI ĐỘNG SERVER ---
// Lắng nghe các request đến trên cổng đã định nghĩa
app.listen(port, () => {
    console.log(`===================================================`);
    console.log(`🚀 SERVER IS RUNNING (VERSION ${APP_VERSION}) ON PORT ${port}`);
    console.log(`===================================================`);
});

// --- KẾT THÚC FILE ---