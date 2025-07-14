// File: /public/js/new-product-logic.js

/**
 * @file Script dành riêng cho trang new-product.html
 * @description Xử lý việc gửi dữ liệu của sản phẩm mới lên server,
 * bao gồm cả việc mở popup upload và nhận link trả về.
 * @version 2.0 (Tích hợp đầy đủ và sửa lỗi mất link)
 */
function initializePage() {
    console.log("Initializing New Product page logic...");

    // --- KHAI BÁO CÁC BIẾN DOM CẦN THIẾT ---
    const form = document.getElementById('product-form');
    const submitButton = document.getElementById('submit-button');
    const idSuffixInput = document.getElementById('product-id-suffix');
    const fullIdInput = document.getElementById('full-product-id');

    // --- NHIỆM VỤ 1: TỰ ĐỘNG TẠO MÃ SẢN PHẨM ĐẦY ĐỦ ---
    // Gắn sự kiện để khi người dùng nhập 11 ký tự, nó sẽ tự động ghép với "KT"
    if (idSuffixInput && fullIdInput) {
        idSuffixInput.addEventListener('input', () => {
            fullIdInput.value = 'KT' + idSuffixInput.value;
        });
    }

    // --- NHIỆM VỤ 2: XỬ LÝ SUBMIT FORM ĐỂ TẠO MỚI SẢN PHẨM ---
    if (form && submitButton) {
        form.addEventListener('submit', async function(event) {
            event.preventDefault();

            // Cập nhật lại mã sản phẩm đầy đủ một lần nữa trước khi gửi
            if (idSuffixInput) {
                fullIdInput.value = 'KT' + idSuffixInput.value;
                if (idSuffixInput.value.length !== 11) {
                    alert("Mã sản phẩm (phần sau KT) phải có đúng 11 ký tự.");
                    return;
                }
            }

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
                        return url.split('/').pop() || 'File không tên';
                    }
                }

                // Chuyển đổi các chuỗi URL trong textarea thành mảng JSON
                data.imageUrls = (data.imageUrls || '').split('\n').map(link => link.trim()).filter(Boolean);
                data.drawingUrls = (data.drawingUrls || '').split('\n').map(link => link.trim()).filter(Boolean).map(link => ({ name: getFileNameFromUrl(link), url: link }));
                data.materialsUrls = (data.materialsUrls || '').split('\n').map(link => link.trim()).filter(Boolean).map(link => ({ name: getFileNameFromUrl(link), url: link }));

                console.log("Đang gửi dữ liệu sản phẩm mới:", data);

                const response = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });

                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || `Lỗi server: ${response.status}`);
                }

                alert(result.message || 'Tạo sản phẩm mới thành công!');
                window.location.href = `/product-list.html`;

            } catch (error) {
                alert('Có lỗi xảy ra khi tạo sản phẩm: ' + error.message);
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Lưu và Xem lại';
            }
        });
    }

    // --- NHIỆM VỤ 3: MỞ CỬA SỔ UPLOAD POPUP ---
    document.querySelectorAll('.popup-upload-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            const url = `/upload.html?target=${targetId}`;
            const popupWidth = 800, popupHeight = 700;
            const left = (screen.width / 2) - (popupWidth / 2);
            const top = (screen.height / 2) - (popupHeight / 2);
            window.open(url, 'uploadWindow', `width=${popupWidth},height=${popupHeight},top=${top},left=${left},scrollbars=yes`);
        });
    });

    // --- NHIỆM VỤ 4: LẮNG NGHE LINK TRẢ VỀ TỪ POPUP ---
    // Sửa lỗi "mất link" bằng cách lắng nghe tin nhắn từ popup
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) {
            return;
        }
        const { type, url, target } = event.data;

        if (type === 'file-uploaded' && url && target) {
            const targetTextArea = document.getElementById(target);
            if (targetTextArea) {
                targetTextArea.value += (targetTextArea.value.trim().length > 0 ? '\n' : '') + url;
                console.log(`Đã nhận và cập nhật URL cho: #${target}`);
            }
        }
    });
}