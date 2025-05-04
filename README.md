# Video Downloader

Ứng dụng tải video từ các nền tảng khác nhau.

## Yêu cầu hệ thống

- Node.js phiên bản 20.x
- Python 3.x
- FFmpeg
- yt-dlp

## Cài đặt

### 1. Cài đặt Node.js 20.x

#### Windows
```bash
winget install OpenJS.NodeJS.LTS
```

#### Ubuntu/Debian
```bash
# Xóa phiên bản Node.js cũ (nếu có)
sudo apt-get remove nodejs npm

# Thêm NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Cài đặt Node.js
sudo apt-get install -y nodejs

# Kiểm tra phiên bản
node --version
```

### 2. Cài đặt Python và các công cụ cần thiết

#### Windows
```bash
winget install Python.Python.3.11
```

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv ffmpeg
```

### 3. Cài đặt yt-dlp

#### Windows
```bash
pip install yt-dlp
```

#### Ubuntu/Debian
```bash
# Tạo môi trường ảo Python
python3 -m venv venv

# Kích hoạt môi trường ảo
source venv/bin/activate

# Cài đặt yt-dlp
pip install yt-dlp

# Tạo alias cho yt-dlp
sudo ln -sf $(pwd)/venv/bin/yt-dlp /usr/local/bin/yt-dlp
```

### 4. Cài đặt dependencies của ứng dụng

```bash
# Cài đặt các package Node.js
npm install
```

## Chạy ứng dụng

### Chế độ phát triển
```bash
npm run dev
```

### Chế độ production
```bash
npm start
```

Ứng dụng sẽ chạy tại địa chỉ: http://localhost:3000

## Tính năng

- Tải video từ nhiều nền tảng khác nhau
- Hỗ trợ tải video với chất lượng cao
- Tải video với tốc độ nhanh
- Giao diện web thân thiện với người dùng

## Xử lý lỗi thường gặp

1. Lỗi "Unexpected token '??='"
   - Nguyên nhân: Phiên bản Node.js không tương thích
   - Giải pháp: Cài đặt Node.js phiên bản 20.x

2. Lỗi "FFmpeg not found"
   - Nguyên nhân: FFmpeg chưa được cài đặt
   - Giải pháp: Cài đặt FFmpeg theo hướng dẫn ở trên

3. Lỗi "yt-dlp not found"
   - Nguyên nhân: yt-dlp chưa được cài đặt
   - Giải pháp: Cài đặt yt-dlp theo hướng dẫn ở trên

## Đóng góp

Mọi đóng góp đều được hoan nghênh! Vui lòng tạo issue hoặc pull request để đóng góp.

## Giấy phép

MIT License
