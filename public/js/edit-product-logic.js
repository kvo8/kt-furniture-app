// File: /public/js/edit-product-logic.js

/**
 * @file Script dành riêng cho trang edit-product.html
 * @description Xử lý việc tải dữ liệu sản phẩm, điền vào form,
 * mở popup upload, và gửi dữ liệu cập nhật lên server.
 * Hàm này được gọi bởi theme-manager.js sau khi đã xác thực user và áp dụng theme.
 */

// Hàm initializePage là điểm bắt đầu cho mọi logic của trang này
function initializePage() {
    console.log("Initializing Edit Product page specific logic...");

    // Khai báo các biến DOM cần thiết cho toàn bộ trang
    const form = document.getElementById('edit-form');
    const submitButton = document.getElementById('submit-button');
    const loadingOverlay = document.getElementById('loading');
    
    // --- NHIỆM VỤ 1: TẢI VÀ ĐIỀN DỮ LIỆU SẢN PHẨM VÀO FORM ---
    // Hàm này được thiết kế để chỉ chạy một lần khi trang được khởi tạo
    const loadProductData = async () => {
        console.log("Attempting to load initial product data...");
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');

        // Nếu không có ID trong URL, báo lỗi và dừng lại
        if (!productId) {
            loadingOverlay.innerHTML = '<p style="color: red;">Lỗi: Không tìm thấy ID sản phẩm trong URL.</p>';
            return;
        }

        try {
            // Gọi API để lấy thông tin chi tiết của sản phẩm
            const response = await fetch(`/api/products/${productId}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Lỗi server: ${response.status}`);
            }
            const product = await response.json();
            console.log("Product data loaded successfully:", product);

            // Tự động điền dữ liệu vào các trường của form
            for (const key in product) {
                if (form.elements[key]) {
                    const field = form.elements[key];
                    const value = product[key];

                    // Xử lý đặc biệt cho các trường URL được lưu dưới dạng mảng JSON
                    if (['imageUrls', 'drawingUrls', 'materialsUrls'].includes(key) && Array.isArray(value)) {
                        const urlString = value.map(item => (typeof item === 'object' ? item.url : item)).join('\n');
                        field.value = urlString;
                    } else {
                        field.value = value || '';
                    }
                }
            }
            
            // Sau khi tải và điền dữ liệu xong, ẩn overlay và hiện form
            loadingOverlay.style.display = 'none';
            form.style.display = 'block';

        } catch (error) {
            console.error('Lỗi khi tải dữ liệu sản phẩm:', error);
            loadingOverlay.innerHTML = `<p style="color: red;">Lỗi khi tải dữ liệu: ${error.message}</p>`;
        }
    };


    // --- NHIỆM VỤ 2: XỬ LÝ SỰ KIỆN SUBMIT FORM ĐỂ CẬP NHẬT ---
    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        submitButton.disabled = true;
        submitButton.textContent = 'Đang lưu...';

        try {
            const formData = new FormData(this);
            const data = Object.fromEntries(formData.entries());
            
            function getFileNameFromUrl(url) {
                try {
                    const path = new URL(url).pathname;
                    return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1));
                } catch (e) {
                    return url.split('/').pop() || 'File';
                }
            }

            // Chuyển đổi các chuỗi URL trong textarea thành mảng JSON đúng định dạng
            data.imageUrls = (data.imageUrls || '').split('\n').map(link => link.trim()).filter(Boolean);
            data.drawingUrls = (data.drawingUrls || '').split('\n').map(link => link.trim()).filter(Boolean).map(link => ({ name: getFileNameFromUrl(link), url: link }));
            data.materialsUrls = (data.materialsUrls || '').split('\n').map(link => link.trim()).filter(Boolean).map(link => ({ name: getFileNameFromUrl(link), url: link }));

            console.log("Submitting updated data to server:", data);

            const response = await fetch(`/api/products/${data.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `Lỗi server: ${response.status}`);
            }

            alert(result.message || 'Cập nhật thành công!');
            window.location.href = '/product-list.html';

        } catch (error) {
            alert('Có lỗi xảy ra khi lưu: ' + error.message);
        } finally {
            // Dù thành công hay thất bại, luôn bật lại nút bấm
            submitButton.disabled = false;
            submitButton.textContent = 'Lưu Thay Đổi';
        }
    });

    // --- NHIỆM VỤ 3: MỞ CỬA SỔ UPLOAD POPUP ---
    document.querySelectorAll('.popup-upload-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            const url = `/upload.html?target=${targetId}`;
            const popupWidth = 800;
            const popupHeight = 700;
            const left = (screen.width / 2) - (popupWidth / 2);
            const top = (screen.height / 2) - (popupHeight / 2);

            window.open(url, 'uploadWindow', `width=${popupWidth},height=${popupHeight},top=${top},left=${left},scrollbars=yes`);
        });
    });

    // Bắt đầu tải dữ liệu sản phẩm ngay khi trang được khởi tạo
    loadProductData();
}