const express = require('express');
const cors = require('cors');
const app = express();
const db = require('./database.js');

app.use(cors());
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;

app.get("/api/products/:id", (req, res) => {
    const sql = "SELECT * FROM products WHERE id = ?";
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(400).json({"error": err.message});
        }
        res.json(row || { message: "Không tìm thấy sản phẩm" });
    });
});

app.post("/api/products", (req, res) => {
    const data = req.body;
    const sql = 'INSERT INTO products (id, name_vi, name_en, collection_vi, collection_en, company, customer, specification, material_vi, material_en, imageUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
    const params = [data.id, data.name_vi, data.name_en, data.collection_vi, data.collection_en, data.company, data.customer, data.specification, data.material_vi, data.material_en, data.imageUrl];

    db.run(sql, params, function (err) {
        if (err){
            return res.status(400).json({"error": err.message});
        }
        res.status(201).json({ "message": "success", "id": data.id });
    });
});

app.listen(port, () => {
    console.log(`Server đang chạy tại địa chỉ http://localhost:${port}`);
});