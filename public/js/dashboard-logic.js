// File: /public/js/dashboard-logic.js

/**
 * @file Script dành riêng cho trang dashboard.html
 * @description Hiển thị lời chào cá nhân hóa cho người dùng đã đăng nhập.
 * Hàm initializePage() sẽ được gọi bởi theme-manager.js sau khi đã
 * xác thực người dùng và áp dụng theme.
 */

function initializePage() {
    console.log("Initializing Dashboard page...");

    // Biến currentUser đã được lấy và lưu bởi theme-manager.js
    // Chúng ta chỉ cần sử dụng nó ở đây.
    const welcomeMessageElement = document.getElementById('welcome-message');
    
    if (welcomeMessageElement && currentUser && currentUser.name) {
        // Nếu có thông tin người dùng, hiển thị lời chào cá nhân hóa
        welcomeMessageElement.textContent = 'Chào mừng, ' + currentUser.name + '!';
    } else if (welcomeMessageElement) {
        // Nếu không có thông tin, hiển thị lời chào mặc định
        welcomeMessageElement.textContent = 'Chào mừng bạn!';
    }
}