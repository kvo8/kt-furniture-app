# ===================================================================
# === FILE: Dockerfile (PHIÊN BẢN CUỐI CÙNG - TỐI ƯU & PHÁ CACHE)  ===
# ===================================================================

# --- GIAI ĐOẠN 1: "BUILDER" (Xây dựng dependencies) ---
FROM node:18 AS builder
WORKDIR /app

# "PHÁ CACHE": Thay đổi giá trị này mỗi khi bạn muốn Cloud Build xây dựng lại từ đầu.
ARG CACHE_BUSTER=FINAL_GCS_VERSION_20250709

COPY package*.json ./
# Chỉ cài đặt các thư viện cần cho production, giúp giảm kích thước
RUN npm install --omit=dev


# --- GIAI ĐOẠN 2: "PRODUCTION" (Tạo image để chạy) ---
# Dùng image alpine để có kích thước nhỏ nhất
FROM node:18-alpine
WORKDIR /app

# Sao chép thư mục node_modules đã được build sạch sẽ từ giai đoạn 'builder'
COPY --from=builder /app/node_modules ./node_modules/

# Sao chép toàn bộ mã nguồn của bạn
COPY . .

# Mở cổng mà Cloud Run sẽ sử dụng
EXPOSE 8080

# Lệnh để khởi chạy ứng dụng
CMD [ "node", "index.js" ]
