// =================================================================
// === FILE: routes/products.js                                  ===
// === MODULE XỬ LÝ TẤT CẢ API LIÊN QUAN ĐẾN SẢN PHẨM           ===
// =================================================================

const express = require('express');
const router = express.Router();
const db = require('../database.js'); // Dùng '../' để đi ra khỏi thư mục routes
const { Storage } = require('@google-cloud/storage');

// --- Cấu hình Middleware ---
const multer = require('multer');
const textOnlyUpload = multer().none(); // Middleware để xử lý form chỉ chứa text

// Middleware kiểm tra đăng nhập (có thể import từ file chính nếu cần)
const isLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.status(401).json({ error: "Unauthorized. Vui lòng đăng nhập lại." });
};

// --- Cấu hình Google Cloud Storage ---
const storageGCS = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'kt-cms-final-578163175425';

/**
 * --- HÀM HỖ TRỢ XÓA FILE TRÊN GCS ---
 * @description Lấy danh sách URL từ một bản ghi sản phẩm và xóa từng file tương ứng trên GCS.
 * @param {object} product - Object sản phẩm lấy từ database.
 * @returns {Promise<void>}
 */
async function deleteFilesFromGCS(product) {
    console.log(`Bắt đầu quá trình xóa file GCS cho sản phẩm ID: ${product.id}`);
    const urlsToDelete = [];

    // Gom tất cả các URL từ các trường khác nhau vào một mảng
    ['imageUrls', 'drawingUrls', 'materialsUrls'].forEach(field => {
        if (product[field] && typeof product[field] === 'string') {
            try {
                const parsedUrls = JSON.parse(product[field]);
                if (Array.isArray(parsedUrls)) {
                    parsedUrls.forEach(item => {
                        // Lấy URL từ object hoặc chuỗi trực tiếp
                        const url = typeof item === 'object' ? item.url : item;
                        if (url) urlsToDelete.push(url);
                    });
                }
            } catch (e) {
                console.warn(`Cảnh báo: Không thể parse JSON cho trường ${field} của sản phẩm ${product.id}`);
            }
        }
    });

    if (urlsToDelete.length === 0) {
        console.log(`Không có file nào trên GCS cần xóa cho sản phẩm ${product.id}.`);
        return;
    }

    console.log(`Đang xóa ${urlsToDelete.length} file...`);
    const bucket = storageGCS.bucket(bucketName);
    
    // Thực hiện xóa song song tất cả các file
    const deletionPromises = urlsToDelete.map(async (url) => {
        try {
            // Tách tên file từ URL (ví dụ: https://storage.googleapis.com/bucket-name/folder/file.jpg -> folder/file.jpg)
            const fileName = url.split(`/${bucketName}/`)[1];
            if (fileName) {
                await bucket.file(fileName).delete();
                console.log(`SUCCESS: Đã xóa file ${fileName}`);
            }
        } catch (error) {
            // Bỏ qua lỗi nếu file không tồn tại (code 404)
            if (error.code === 404) {
                console.warn(`WARNING: File tại URL ${url} không tồn tại trên GCS, bỏ qua.`);
            } else {
                console.error(`ERROR: Lỗi khi xóa file tại URL ${url}:`, error.message);
                // Không ném lỗi để các file khác vẫn được tiếp tục xóa
            }
        }
    });

    await Promise.all(deletionPromises);
    console.log(`Hoàn tất quá trình xóa file cho sản phẩm ${product.id}.`);
}

// --- CÁC ROUTE API ---

// GET /api/products -> Lấy danh sách tất cả sản phẩm
router.get("/", isLoggedIn, async (req, res, next) => {
    try {
        const sql = "SELECT * FROM products ORDER BY created_at DESC";
        const { rows } = await db.query(sql);
        res.json({ products: rows });
    } catch (err) {
        next(err); // Chuyển lỗi đến middleware xử lý lỗi tập trung
    }
});

// GET /api/products/:id -> Lấy thông tin chi tiết một sản phẩm
router.get("/:id", async (req, res, next) => {
    try {
        const sql = `SELECT * FROM products WHERE id = $1`;
        const { rows } = await db.query(sql, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: "Sản phẩm không tồn tại" });
        }
        
        const product = rows[0];

        // Tự động chuyển đổi các trường JSON string từ DB thành array/object thật
        ['imageUrls', 'drawingUrls', 'materialsUrls'].forEach(field => {
            try {
                if (product[field] && typeof product[field] === 'string') {
                    product[field] = JSON.parse(product[field]);
                }
            } catch (e) {
                console.warn(`Lỗi parse JSON cho trường ${field} của sản phẩm ${product.id}. Trả về chuỗi gốc.`);
            }
        });
        
        res.json(product);
    } catch (err) {
        next(err);
    }
});

// POST /api/products -> Tạo sản phẩm mới
router.post("/", isLoggedIn, textOnlyUpload, async (req, res, next) => {
    try {
        const data = req.body;
        const user = req.session.user;
        
        // Validation cơ bản
        if (!data.id || !data.name_vi) {
            return res.status(400).json({ error: "Mã sản phẩm và Tên sản phẩm (VI) là bắt buộc." });
        }

        const sql = `
            INSERT INTO products (
                id, name_vi, name_en, collection_vi, collection_en, color_vi, color_en, 
                fabric_vi, fabric_en, wicker_vi, wicker_en, production_place,
                company, customer, specification, material_vi, material_en, aluminum_profile, 
                supplier, "imageUrls", "drawingUrls", "materialsUrls", other_details,
                created_by_name, created_by_id, parent_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        `;
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
            data.parent_id || null
        ];
        
        await db.query(sql, params);
        res.status(201).json({ message: "Lưu sản phẩm thành công!", id: data.id });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: `Lỗi: Mã sản phẩm '${data.id}' đã tồn tại.` });
        }
        next(err);
    }
});

// PUT /api/products/:id -> Cập nhật sản phẩm
router.put("/:id", isLoggedIn, textOnlyUpload, async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const fields = [];
        const values = [];
        let paramIndex = 1;

        const addField = (fieldName, value) => {
            const finalValue = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
            fields.push(`"${fieldName}" = $${paramIndex++}`);
            values.push(finalValue);
        };

        // Danh sách các trường cần cập nhật
        const updatableFields = [
            'name_vi', 'name_en', 'collection_vi', 'collection_en', 'color_vi', 'color_en',
            'fabric_vi', 'fabric_en', 'wicker_vi', 'wicker_en', 'production_place', 'company',
            'customer', 'specification', 'material_vi', 'material_en', 'aluminum_profile',
            'other_details', 'supplier', 'imageUrls', 'drawingUrls', 'materialsUrls'
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

// DELETE /api/products/:id -> Xóa sản phẩm
router.delete("/:id", isLoggedIn, async (req, res, next) => {
    const { id } = req.params;
    try {
        // Bước 1: Lấy thông tin sản phẩm để có danh sách file cần xóa
        const selectResult = await db.query('SELECT * FROM products WHERE id = $1', [id]);
        if (selectResult.rowCount === 0) {
            return res.status(404).json({ message: 'Không tìm thấy sản phẩm này để xóa.' });
        }
        const productToDelete = selectResult.rows[0];

        // Bước 2: Xóa các file liên quan trên GCS
        await deleteFilesFromGCS(productToDelete);

        // Bước 3: Xóa bản ghi sản phẩm khỏi database
        const deleteResult = await db.query('DELETE FROM products WHERE id = $1', [id]);
        
        res.status(200).json({ message: 'Sản phẩm và các file liên quan đã được xóa thành công.' });
    } catch (err) {
        next(err);
    }
});


module.exports = router;