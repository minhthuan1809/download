# Video Downloader

Ứng dụng tải video từ các nguồn khác nhau, hỗ trợ đặc biệt cho định dạng M3U8.

## Tính năng

- Tải video từ link M3U8
- Hiển thị tiến trình tải
- Hỗ trợ tải nhiều video cùng lúc
- Lưu danh sách video đã tải
- Giao diện thân thiện, dễ sử dụng

## Cài đặt

1. Cài đặt Node.js và npm
2. Cài đặt Python 3.x
3. Cài đặt các công cụ cần thiết:
   ```bash
   pip install yt-dlp
   pip install ffmpeg-python
   pip install pycryptodomex
   winget install ffmpeg
   ```
4. Cài đặt các thư viện Node.js:
   ```bash
   npm install
   ```

## Cách sử dụng

1. Khởi động server:
   ```bash
   node server.js
   ```
2. Mở trình duyệt và truy cập: `http://localhost:3000`
3. Dán link video M3U8 vào ô nhập liệu
4. Nhấn nút "Tải xuống" để bắt đầu tải
5. Xem tiến trình tải trong danh sách tải
6. Video sẽ được lưu vào thư mục hiện tại

## Lưu ý

- Đảm bảo link video hợp lệ
- Kiểm tra kết nối internet
- Video sẽ được lưu với tên tự động dựa trên tiêu đề
- Có thể tải nhiều video cùng lúc
- Tiến trình tải sẽ được hiển thị chi tiết

## Hỗ trợ

Nếu gặp vấn đề, vui lòng kiểm tra:

1. Link video có hợp lệ không
2. Đã cài đặt đầy đủ các công cụ cần thiết chưa
3. Kết nối internet có ổn định không
# download
