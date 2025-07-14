// File: /public/js/barcode-logic.js

/**
 * @file Script dành riêng cho trang barcode.html
 * @description Lấy ID sản phẩm từ URL và tạo mã vạch tương ứng.
 * Hàm initializePage() sẽ được gọi bởi theme-manager.js sau khi
 * đã xác thực người dùng và áp dụng theme.
 */

function initializePage() {
    console.log("Initializing Barcode page logic...");

    // Lấy đối tượng URLSearchParams để phân tích các tham số trên URL
    const urlParams = new URLSearchParams(window.location.search);

    // Lấy giá trị của tham số 'id'
    const productId = urlParams.get('id');
    const barcodeContainer = document.querySelector('.barcode-container');

    // Kiểm tra xem ID sản phẩm có tồn tại không
    if (productId) {
        console.log(`Generating barcode for Product ID: ${productId}`);
        try {
            // Sử dụng thư viện JsBarcode để vẽ mã vạch vào phần tử SVG
            JsBarcode("#barcode-image", productId, {
                format: "CODE128",       // Định dạng mã vạch phổ biến
                width: 4,               // Độ rộng của mỗi vạch
                height: 150,            // Chiều cao của mã vạch
                fontSize: 24,           // Cỡ chữ của số hiển thị bên dưới
                margin: 20,             // Khoảng trống xung quanh mã vạch
                displayValue: true,     // Hiển thị giá trị của mã vạch (ID sản phẩm)
                background: 'transparent' // Nền trong suốt để hợp với cả theme Sáng và Tối
            });
        } catch (e) {
            // Bắt lỗi nếu JsBarcode không thể tạo mã vạch (vd: ID chứa ký tự không hợp lệ)
            console.error("Lỗi khi tạo mã vạch:", e);
            barcodeContainer.innerHTML = '<h1>Lỗi: Dữ liệu mã vạch không hợp lệ.</h1>';
        }
    } else {
        // Nếu không có ID trên URL, hiển thị thông báo lỗi
        console.error("Product ID not found in URL.");
        barcodeContainer.innerHTML = '<h1>Lỗi: Không tìm thấy ID sản phẩm trong URL.</h1>';
    }
}