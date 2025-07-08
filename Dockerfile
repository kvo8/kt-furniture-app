# ===================================================================
# === FILE: Dockerfile (PHIÊN BẢN CUỐI CÙNG - ĐÃ "PHÁ CACHE")     ===
# ===================================================================

# --- GIAI ĐOẠN 1: BUILD DEPENDENCIES ---
# Mục tiêu của giai đoạn này là tạo ra một thư mục node_modules "sạch"
# chỉ chứa các package cần cho production.
FROM node:18 AS builder

WORKDIR /app

# =================================================================
# === "PHÁ CACHE": THÊM DÒNG NÀY ĐỂ BUỘC BUILD LẠI TỪ ĐẦU ===
# === Giá trị này là một chuỗi ngẫu nhiên, bạn có thể thay đổi nó mỗi khi muốn "phá cache" ===
ARG CACHE_BUSTER=FORCE_REBUILD_202507081505
# =================================================================

# Chỉ sao chép file package.json và package-lock.json
COPY package*.json ./

# Chạy npm install để build thư mục node_modules
# --omit=dev đảm bảo chỉ cài các thư viện trong "dependencies", bỏ qua "devDependencies"
RUN npm install --omit=dev


# --- GIAI ĐOẠN 2: PRODUCTION IMAGE ---
# Bắt đầu từ một image Node.js gọn nhẹ (alpine) để image cuối cùng có dung lượng nhỏ
FROM node:18-alpine

WORKDIR /app

# Sao chép thư mục node_modules đã được build sạch sẽ từ giai đoạn 'builder'
COPY --from=builder /app/node_modules ./node_modules/

# Sao chép toàn bộ mã nguồn của bạn (bao gồm cả file index.js mới nhất)
COPY . .

# Mở cổng 8080. Google Cloud Run yêu cầu ứng dụng phải lắng nghe trên cổng
# được cung cấp qua biến môi trường PORT, và giá trị mặc định của nó là 8080.
EXPOSE 8080

# Lệnh để khởi chạy ứng dụng
CMD [ "node", "index.js" ]
