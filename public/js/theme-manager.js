// File: /public/js/theme-manager.js

/**
 * Script quản lý theme (Sáng/Tối) và trạng thái đăng nhập chung cho toàn bộ trang web.
 */

// Biến toàn cục để lưu thông tin người dùng, có thể được truy cập bởi các script khác.
let currentUser = null;

/**
 * Áp dụng theme vào thẻ <body> và cập nhật trạng thái nút gạt.
 * @param {string} theme - 'light' hoặc 'dark'.
 */
function applyTheme(theme) {
    const toggle = document.getElementById('theme-toggle');
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        if (toggle) toggle.checked = true;
    } else {
        document.body.classList.remove('dark-mode');
        if (toggle) toggle.checked = false;
    }
}

/**
 * Gửi yêu cầu lên server để lưu lựa chọn theme mới của người dùng.
 * @param {string} theme - 'light' hoặc 'dark'.
 */
async function saveThemePreference(theme) {
    if (!currentUser) return; // Chỉ lưu nếu đã đăng nhập
    try {
        await fetch('/api/user/theme', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: theme })
        });
        currentUser.theme = theme; // Cập nhật lại biến toàn cục
    } catch (error) {
        console.error("Lỗi khi lưu theme:", error);
    }
}

/**
 * Hàm khởi tạo chính, chạy đầu tiên trên mọi trang.
 * Lấy thông tin user, áp dụng theme, và sau đó gọi hàm khởi tạo riêng của từng trang.
 */
async function initializeApp() {
    try {
        const response = await fetch('/api/me');
        if (!response.ok) {
            window.location.href = '/login.html'; // Chuyển hướng nếu chưa đăng nhập
            return;
        }
        currentUser = await response.json();
        
        // Áp dụng theme của user ngay lập tức
        applyTheme(currentUser.theme);

        // Kiểm tra xem có hàm khởi tạo riêng của trang không, nếu có thì gọi nó
        if (typeof initializePage === 'function') {
            initializePage();
        }

    } catch (error) {
        console.error("Lỗi xác thực hoặc khởi tạo:", error);
        window.location.href = '/login.html';
    }
}

// Gắn sự kiện cho nút gạt theme. Code này sẽ tự tìm nút gạt trên bất kỳ trang nào có nó.
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            const newTheme = themeToggle.checked ? 'dark' : 'light';
            applyTheme(newTheme);
            saveThemePreference(newTheme);
        });
    }
});

// Chạy hàm khởi tạo chính của ứng dụng
initializeApp();