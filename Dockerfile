# ===================================================================
# === FILE: Dockerfile (ĐÃ SỬA LỖI VÀ TỐI ƯU CHO CLOUD RUN) ===
# ===================================================================

# --- GIAI ĐOẠN 1: BUILD DEPENDENCIES ---
# Mục tiêu của giai đoạn này là tạo ra một thư mục node_modules "sạch"
# chỉ chứa các package cần cho production.
FROM node:18 AS builder

WORKDIR /app

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

# Sao chép toàn bộ mã nguồn của bạn
COPY . .

# Mở cổng 8080. Google Cloud Run yêu cầu ứng dụng phải lắng nghe trên cổng
# được cung cấp qua biến môi trường PORT, và giá trị mặc định của nó là 8080.
EXPOSE 8080

# Lệnh để khởi chạy ứng dụng
CMD [ "node", "index.js" ]