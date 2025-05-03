import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from 'multer';
import downloadRoutes from "./routes/downloadRoutes.js";
import { corsMiddleware } from "./middleware/corsMiddleware.js";
import { findAvailablePort } from "./utils/serverUtils.js";
import { DOWNLOADS_DIR, UPLOADS_DIR, CORS_OPTIONS } from "./config/constants.js";

const app = express();
app.use(cors(CORS_OPTIONS));
app.use(bodyParser.json());

// Lấy thư mục gốc theo kiểu ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn đúng tới thư mục public (nằm ngoài src)
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Tạo thư mục downloads nếu chưa có
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
  console.log("📁 Đã tạo thư mục downloads");
} else {
  console.log("✅ Thư mục downloads đã tồn tại");
}

// Giao diện tĩnh từ thư mục public
app.use(express.static(PUBLIC_DIR));
app.use('/components', express.static(path.join(PUBLIC_DIR, "components")));
app.use('/js', express.static(path.join(PUBLIC_DIR, "js")));

// Cấu hình multer để lưu file tạm thời

// Sử dụng routes
app.use("/", downloadRoutes);

// Thêm middleware xử lý CORS cho video streaming
app.use(corsMiddleware);

// Route trả về index.html cho các request GET không khớp (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Khởi động server với port khả dụng
async function startServer() {
  const port = await findAvailablePort(3000);
  app.listen(port, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
  });
}

startServer(); 