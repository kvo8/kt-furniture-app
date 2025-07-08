# ===================================================================
# === FILE: Dockerfile (PHIÊN BẢN CUỐI CÙNG - CHÚ THÍCH CHI TIẾT)   ===
# === Tác giả: Gemini (dựa trên code của người dùng và tối ưu)      ===
# === Mục đích: Xây dựng một container image nhẹ, bảo mật và hiệu   ===
# === quả cho ứng dụng Node.js trên Google Cloud Run.             ===
# ===================================================================

# -------------------------------------------------------------------
# --- GIAI ĐOẠN 1: "BUILDER" (Giai đoạn Xây dựng)                  ---
# -------------------------------------------------------------------
# Mục tiêu của giai đoạn này là tạo ra một thư mục node_modules "sạch"
# chỉ chứa các package cần thiết cho môi trường production.
# Chúng ta dùng một image Node.js đầy đủ (không phải alpine) để đảm bảo
# mọi công cụ build cần thiết đều có sẵn.
FROM node:18 AS builder

# Thiết lập thư mục làm việc bên trong container.
# Mọi lệnh sau đó sẽ được thực thi trong thư mục /app này.
WORKDIR /app

# =================================================================
# === "PHÁ CACHE": DÒNG LỆNH QUAN TRỌNG NHẤT ĐỂ SỬA LỖI DEPLOY ===
# =================================================================
# Lệnh ARG này định nghĩa một biến chỉ tồn tại trong lúc build.
# Bằng cách thay đổi giá trị của nó mỗi khi bạn muốn deploy một cách "sạch sẽ",
# bạn sẽ "ép" Google Cloud Build phải bỏ qua bộ nhớ đệm (cache) cũ
# và xây dựng lại toàn bộ image từ đầu.
# Đây là chìa khóa để đảm bảo file index.js mới nhất của bạn được sử dụng.
# HÃY THAY ĐỔI GIÁ TRỊ NÀY MỖI KHI BẠN GẶP LỖI DEPLOY "CỨNG ĐẦU".
ARG CACHE_BUSTER=FINAL_VERSION_202507081603

# Sao chép các file quản lý thư viện vào trước.
# Docker sẽ cache lại lớp (layer) này. Nếu các file này không thay đổi,
# Docker sẽ không cần chạy lại "npm install", giúp build nhanh hơn.
COPY package*.json ./

# Chạy lệnh npm install để cài đặt các thư viện.
# Cờ "--omit=dev" là một tối ưu quan trọng: nó chỉ cài các thư viện
# trong mục "dependencies" của package.json và bỏ qua các thư viện
# trong "devDependencies" (thường là các công cụ chỉ dùng để phát triển).
# Điều này giúp thư mục node_modules cuối cùng nhẹ hơn rất nhiều.
RUN npm install --omit=dev


# -------------------------------------------------------------------
# --- GIAI ĐOẠN 2: "PRODUCTION" (Giai đoạn Chạy ứng dụng)          ---
# -------------------------------------------------------------------
# Bây giờ, chúng ta bắt đầu xây dựng image cuối cùng sẽ được chạy trên Cloud Run.
# Chúng ta dùng một image Node.js gọn nhẹ dựa trên Alpine Linux.
# "node:18-alpine" nhỏ hơn rất nhiều so với "node:18", giúp giảm chi phí
# lưu trữ và tăng tốc độ khởi động.
FROM node:18-alpine

# Thiết lập thư mục làm việc bên trong container production.
WORKDIR /app

# Sao chép thư mục node_modules đã được build sạch sẽ từ giai đoạn 'builder'.
# Đây là "phép màu" của multi-stage build: chúng ta chỉ lấy kết quả cuối cùng
# (thư mục node_modules đã được tối ưu) từ giai đoạn trước, mà không cần
# mang theo bất kỳ file tạm hay công cụ build nào.
COPY --from=builder /app/node_modules ./node_modules/

# Sao chép toàn bộ mã nguồn của bạn (bao gồm index.js, các file html, css...)
# vào thư mục làm việc của container.
# Dòng này được đặt sau cùng để tận dụng cache của Docker. Nếu bạn chỉ
# thay đổi code trong index.js, Docker sẽ không cần build lại các lớp ở trên.
COPY . .

# Mở cổng 8080. Đây là một chỉ dẫn cho Docker biết rằng container này
# sẽ lắng nghe trên cổng 8080.
# Google Cloud Run yêu cầu ứng dụng phải lắng nghe trên cổng được cung cấp
# qua biến môi trường PORT, và giá trị mặc định của nó chính là 8080.
EXPOSE 8080

# Lệnh để khởi chạy ứng dụng của bạn khi container bắt đầu.
# Nó sẽ thực thi lệnh "node index.js".
# Dùng dạng JSON ["node", "index.js"] được khuyến khích hơn là dạng chuỗi.
CMD [ "node", "index.js" ]

# --- KẾT THÚC FILE DOCKERFILE ---
