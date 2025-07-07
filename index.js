// ==========================================================
// === FILE: index.js (Phiên bản Hoàn Chỉnh) ===
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

// THÊM MỚI: Import thư viện để lưu session vào database
const pgSession = require('connect-pg-simple')(session);

// --- PHẦN 2: KHỞI TẠO VÀ CẤU HÌNH EXPRESS APP ---
const app = express();
const saltRounds = 10;
const port = process.env.PORT || 3000;

// --- 2.1. Cấu hình Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// THÊM MỚI: Tạo một "kho" lưu session trong database PostgreSQL
const sessionStore = new pgSession({
    pool: db.pool, // Sử dụng connection pool từ file database.js của bạn
    tableName: 'user_sessions' // Tên của bảng sẽ được dùng để lưu session
});

// --- 2.2. Cấu hình Session ---
// Cập nhật để sử dụng kho lưu session mới, ổn định hơn
app.use(session({
    store: sessionStore, // Chỉ định nơi lưu session mới
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Đây là lựa chọn tốt nhất cho production
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // Session tồn tại trong 1 ngày
    }
}));

// --- 2.3. Cấu hình Multer để Upload File ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage }).fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'drawingFile', maxCount: 1 },
    { name: 'materialsFile', maxCount: 1 }
]);

// --- 2.4. Middleware Kiểm Tra Đăng Nhập ---
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

// --- PHẦN 3: CÁC API ENDPOINTS ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Đăng ký
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
        // Gán thông tin user vào session
        req.session.user = { id: result.rows[0].id, name: ho_ten, employeeId: ma_nhan_vien };
        res.status(201).json({ "message": "Đăng ký thành công và đã tự động đăng nhập." });
    } catch (err) {
        console.error("Lỗi đăng ký:", err.message);
        if (err.code === '23505') {
            return res.status(400).json({ "error": "Mã nhân viên này đã tồn tại." });
        }
        res.status(500).json({ "error": "Lỗi hệ thống khi đăng ký." });
    }
});

// Đăng nhập
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
            // Gán thông tin user vào session
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

// Lấy thông tin user hiện tại
app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

// ... (Bạn có thể thêm lại các API cho products và reviews ở đây) ...

// --- PHẦN 4: KHỞI ĐỘNG SERVER ---
app.listen(port, () => {
    console.log(`Server đang lắng nghe trên cổng ${port}`);
});