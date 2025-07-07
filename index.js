// === FILE: index.js (Phiên bản Gốc Ổn Định) ===

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const db = require('./database.js');
const fs = require('fs');

const app = express();
const saltRounds = 10;
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Dùng lại session mặc định
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
    }
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
        req.session.user = { id: result.rows[0].id, name: ho_ten, employeeId: ma_nhan_vien };
        res.status(201).json({ "message": "Đăng ký thành công và đã tự động đăng nhập." });
    } catch (err) {
        console.error("Lỗi đăng ký:", err.message);
        if (err.code === '23505') {
            return res.status(400).json({ "error": "Mã nhân viên này đã tồn tại." });
        }
        res.status(500).json({ "error": err.message }); // Giữ lại để gỡ lỗi
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
        res.status(500).json({ "error": err.message }); // Giữ lại để gỡ lỗi
    }
});

app.get("/api/me", isLoggedIn, (req, res) => {
    res.json(req.session.user);
});

app.listen(port, () => {
    console.log(`Server đang lắng nghe trên cổng ${port}`);
});