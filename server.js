import express from "express";
import bodyParser from "body-parser";
import { exec } from "node:child_process";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import net from "net";
import fs from "fs";
import multer from 'multer';

const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Range"],
    exposedHeaders: ["Content-Range", "Content-Length", "Accept-Ranges"],
  })
);
app.use(bodyParser.json());

// Lấy thư mục gốc theo kiểu ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tạo thư mục downloads nếu chưa có
const downloadsDir = "/home/download/downloads"; // Đường dẫn tuyệt đối
if (!fs.existsSync(downloadsDir)) {
  try {
    fs.mkdirSync(downloadsDir, { recursive: true });
    console.log("📁 Đã tạo thư mục downloads tại:", downloadsDir);
  } catch (error) {
    console.error("❌ Lỗi khi tạo thư mục downloads:", error);
    process.exit(1);
  }
} else {
  console.log("✅ Thư mục downloads đã tồn tại tại:", downloadsDir);
}

// Giao diện tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, "public")));
app.use('/components', express.static(path.join(__dirname, "public/components")));
app.use('/js', express.static(path.join(__dirname, "public/js")));

// Lưu trữ tiến trình tải
const downloadProgress = new Map();

// Đếm số lượng file đã tải
let downloadCount = 0;

// Lưu trữ các process đang chạy
const activeProcesses = new Map();

// Cấu hình multer để lưu file tạm thời
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, downloadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Hàm lấy số thứ tự tiếp theo
function getNextNumber() {
  downloadCount++;
  return String(downloadCount).padStart(3, "0"); // Format: 001, 002, ...
}

// Hàm tạo tên file an toàn
function createSafeFilename(title) {
  // Loại bỏ các ký tự không hợp lệ trong tên file
  return title.replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^\w\-_]/g, '');
}

// Hàm kiểm tra và tạo tên file duy nhất
function getUniqueFileName(baseDir, title, ext) {
  const safeTitle = createSafeFilename(title);
  const prefix = getNextNumber();
  const baseName = `${prefix}_${safeTitle}`;
  let counter = 0;
  let fileName = `${baseName}${ext}`;
  let fullPath = path.join(baseDir, fileName);

  // Kiểm tra nếu file đã tồn tại
  while (fs.existsSync(fullPath)) {
    counter++;
    fileName = `${baseName}_${counter}${ext}`;
    fullPath = path.join(baseDir, fileName);
  }

  return {
    fileName: fileName,
    fullPath: fullPath
  };
}

// Hàm để kiểm tra process còn chạy không
function isProcessRunning(pid) {
  if (process.platform === 'win32') {
    const { execSync } = require('child_process');
    try {
      execSync(`tasklist /FI "PID eq ${pid}"`);
      return true;
    } catch (error) {
      return false;
    }
  } else {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Hàm để kill process và tất cả process con của nó
function killProcessTree(processInfo) {
  if (!processInfo || !processInfo.process) return;

  const pid = processInfo.process.pid;
  console.log(`Đang kill process ${pid} và các process con của nó`);

  if (process.platform === 'win32') {
    const { execSync } = require('child_process');
    try {
      // Kill toàn bộ process tree
      execSync(`taskkill /pid ${pid} /T /F`);
      
      // Đợi một chút để đảm bảo process đã bị kill
      setTimeout(() => {
        if (isProcessRunning(pid)) {
          console.log(`Process ${pid} vẫn đang chạy, thử kill lại`);
          try {
            execSync(`taskkill /pid ${pid} /T /F`);
          } catch (error) {
            console.log(`Không thể kill process ${pid} lần 2`);
          }
        }
      }, 1000);
    } catch (error) {
      console.error('Lỗi khi kill process tree:', error);
    }
  } else {
    try {
      processInfo.process.kill('SIGKILL');
    } catch (error) {
      console.log(`Process ${pid} đã bị kill`);
    }
  }
}

// Cấu hình domain và đường dẫn
const DOMAIN = "https://tai.minhthuan.site";
const DOWNLOAD_PATH = "/downloads";

// Hàm tạo đường dẫn tải về
function createDownloadUrl(fileName) {
  return `${DOMAIN}${DOWNLOAD_PATH}/${encodeURIComponent(fileName)}`;
}

app.post("/download", (req, res) => {
  const url = req.body.url;
  const downloadId = Date.now().toString();

  if (!url || !url.startsWith("http")) {
    return res.json({ success: false, message: "❌ Link không hợp lệ!" });
  }

  // Kiểm tra nếu là link trực tiếp đến file M3U8
  const isDirectM3U8 = url.toLowerCase().includes(".m3u8");

  console.log(`Bắt đầu tải file với ID: ${downloadId}`);
  console.log("URL:", url);
  console.log("Loại link:", isDirectM3U8 ? "M3U8 trực tiếp" : "Link thông thường");

  // Khởi tạo tiến trình
  downloadProgress.set(downloadId, {
    status: "downloading",
    progress: 0,
    message: "Đang tải...",
  });

  // Tạo template cho tên file với số thứ tự
  const { fileName, fullPath } = getUniqueFileName(downloadsDir, "video", ".mp4");
  const outputPath = fullPath;

  // Tùy chỉnh lệnh tải dựa vào loại URL
  let cmd;
  if (isDirectM3U8) {
    cmd = `python3 -m yt_dlp "${url}" --downloader ffmpeg --downloader-args "ffmpeg_i:-headers 'User-Agent: Mozilla/5.0'" -o "${outputPath}" --no-check-certificates --newline`;
  } else {
    // Sử dụng format "best" để tải file tốt nhất có thể
    cmd = `python3 -m yt_dlp "${url}" -f "best" -o "${outputPath}" --no-check-certificates --newline`;
  }

  // Kiểm tra xem yt-dlp đã được cài đặt chưa
  exec("python3 -m pip list | grep yt-dlp", (error, stdout, stderr) => {
    if (error || !stdout.includes("yt-dlp")) {
      console.log("📥 Đang cài đặt yt-dlp...");
      exec("python3 -m pip install yt-dlp", (installError, installStdout, installStderr) => {
        if (installError) {
          console.error("❌ Lỗi khi cài đặt yt-dlp:", installError);
          downloadProgress.set(downloadId, {
            status: "error",
            progress: 0,
            message: "❌ Lỗi: Không thể cài đặt yt-dlp",
          });
          return res.json({
            success: false,
            message: "❌ Lỗi: Không thể cài đặt yt-dlp",
          });
        }
        console.log("✅ Đã cài đặt yt-dlp thành công");
        startDownload();
      });
    } else {
      console.log("✅ yt-dlp đã được cài đặt");
      startDownload();
    }
  });

  function startDownload() {
    try {
      console.log("Lệnh tải:", cmd);
      const process = exec(cmd);
      console.log(`Tiến trình tải được tạo với ID: ${downloadId}`);

      // Lưu thông tin process để có thể hủy sau này
      activeProcesses.set(downloadId, {
        process: process,
        outputPath: outputPath,
        url: url,
        startTime: Date.now(),
        isDownloading: false,
        pid: process.pid,
        cmd: cmd
      });

      process.stdout.on("data", (data) => {
        // Cập nhật tiến trình từ output
        if (data.includes("[download]")) {
          const progressMatch = data.match(/\[download\]\s+(\d+\.\d+)%/);
          if (progressMatch) {
            const progress = parseFloat(progressMatch[1]);
            downloadProgress.set(downloadId, {
              status: "downloading",
              progress: progress,
              message: `Đang tải: ${progress.toFixed(1)}%`,
            });
            // Nếu đã có tiến độ tải, đánh dấu là đang tải thành công
            if (progress > 0) {
              const processInfo = activeProcesses.get(downloadId);
              if (processInfo) {
                processInfo.isDownloading = true;
              }
            }
          }
        } else if (data.includes("frame=")) {
          // Xử lý output của FFmpeg
          const timeMatch = data.match(/time=(\d+:\d+:\d+\.\d+)/);
          const sizeMatch = data.match(/size=\s*(\d+)kB/);
          const speedMatch = data.match(/speed=([\d.]+)x/);
          
          if (timeMatch && sizeMatch && speedMatch) {
            const time = timeMatch[1];
            const size = sizeMatch[1];
            const speed = speedMatch[1];
            
            downloadProgress.set(downloadId, {
              status: "downloading",
              progress: 0, // Không có phần trăm chính xác
              message: `Đang tải: ${time} (${size}KB, ${speed}x)`,
            });
            
            const processInfo = activeProcesses.get(downloadId);
            if (processInfo) {
              processInfo.isDownloading = true;
            }
          }
        }
        console.log(`[${downloadId}] Output:`, data);
      });

      process.stderr.on("data", (data) => {
        console.log(`[${downloadId}] stderr:`, data);
        // Kiểm tra lỗi trong stderr
        if (data.includes("ERROR") || data.includes("error")) {
          downloadProgress.set(downloadId, {
            status: "error",
            progress: 0,
            message: `❌ Lỗi: ${data.trim()}`,
          });
        }
      });

      process.on("close", (code) => {
        console.log(`Tiến trình ${downloadId} kết thúc với mã: ${code}`);
        const processInfo = activeProcesses.get(downloadId);
        if (processInfo) {
          if (code !== 0) {
            // Nếu tiến trình kết thúc với lỗi, xóa file đang tải dở
            try {
              if (fs.existsSync(processInfo.outputPath)) {
                fs.unlinkSync(processInfo.outputPath);
              }
              const partFile = processInfo.outputPath + ".part";
              if (fs.existsSync(partFile)) {
                fs.unlinkSync(partFile);
              }
            } catch (error) {
              console.error(`Lỗi khi xóa file dở: ${error.message}`);
            }
            downloadProgress.set(downloadId, {
              status: "error",
              progress: 0,
              message: "❌ Lỗi khi tải file",
            });
          } else {
            // Kiểm tra xem file đã được tạo thành công chưa
            if (fs.existsSync(processInfo.outputPath)) {
              const downloadUrl = createDownloadUrl(fileName);
              downloadProgress.set(downloadId, {
                status: "completed",
                progress: 100,
                message: "✅ Tải hoàn tất!",
                filePath: downloadUrl
              });
            } else {
              downloadProgress.set(downloadId, {
                status: "error",
                progress: 0,
                message: "❌ Lỗi: File không được tạo",
              });
            }
          }
          activeProcesses.delete(downloadId);
        }
      });

      res.json({
        success: true,
        message: "Đã bắt đầu tải file",
        downloadId: downloadId,
      });
    } catch (error) {
      console.error(`Lỗi khi tạo tiến trình tải ${downloadId}:`, error);
      downloadProgress.delete(downloadId);
      res.json({
        success: false,
        message: `Lỗi khi bắt đầu tải: ${error.message}`,
      });
    }
  }
});

// API để lấy tiến trình tải
app.get("/progress/:downloadId", (req, res) => {
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);

  if (!progress) {
    return res.json({
      success: false,
      message: "Không tìm thấy tiến trình tải",
    });
  }

  res.json({
    success: true,
    progress: progress,
  });
});

// API để lấy danh sách video đã tải
app.get("/downloads", (req, res) => {
  try {
    const files = fs
      .readdirSync(downloadsDir)
      .filter((file) => file.endsWith(".mp4"))
      .map((file) => ({
        name: file,
        path: `/downloads/${file}`,
        size: fs.statSync(path.join(downloadsDir, file)).size,
        type: file.endsWith(".m3u8") ? "m3u8" : "mp4",
      }))
      .sort((a, b) => {
        // Sắp xếp theo số thứ tự trong tên file
        const numA = parseInt(a.name.split("_")[0]);
        const numB = parseInt(b.name.split("_")[0]);
        return numB - numA; // Sắp xếp giảm dần
      });

    res.json({
      success: true,
      files: files,
    });
  } catch (error) {
    res.json({
      success: false,
      message: "Lỗi khi đọc danh sách video",
    });
  }
});

// Phục vụ file video đã tải với hỗ trợ streaming
app.use("/downloads", (req, res, next) => {
  const filePath = path.join(downloadsDir, path.basename(req.path));

  // Kiểm tra file có tồn tại
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File không tồn tại");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    // Xử lý range request cho streaming
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    // Phục vụ toàn bộ file nếu không có range request
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    };

    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Thêm route để kiểm tra trạng thái video
app.get("/check-video/:filename", (req, res) => {
  const filePath = path.join(downloadsDir, req.params.filename);

  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      res.json({
        success: true,
        size: stat.size,
        lastModified: stat.mtime,
        isComplete: true,
      });
    } else {
      res.json({
        success: false,
        message: "File không tồn tại",
      });
    }
  } catch (error) {
    res.json({
      success: false,
      message: "Lỗi khi kiểm tra file: " + error.message,
    });
  }
});

// Thêm middleware xử lý CORS cho video streaming
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Range, Content-Type");
  res.header(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, Accept-Ranges"
  );
  next();
});

// Hàm kiểm tra port có sẵn sàng không
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

// Tìm port khả dụng
async function findAvailablePort(startPort) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
}

// Khởi động server với port khả dụng
async function startServer() {
  const port = await findAvailablePort(3000);
  app.listen(port, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${port}`);
  });
}

// API hủy tải video
app.post("/cancel-download/:downloadId", (req, res) => {
  const { downloadId } = req.params;
  console.log(`Yêu cầu hủy tải video với ID: ${downloadId}`);

  const processInfo = activeProcesses.get(downloadId);
  if (!processInfo) {
    console.log(`Không tìm thấy tiến trình ${downloadId}`);
    return res.json({ success: false, message: "Không tìm thấy tiến trình tải" });
  }

  try {
    // Kill process và tất cả process con
    killProcessTree(processInfo);

    // Xóa file đang tải dở nếu có
    if (fs.existsSync(processInfo.outputPath)) {
      fs.unlinkSync(processInfo.outputPath);
      console.log(`Đã xóa file đang tải dở: ${processInfo.outputPath}`);
    }

    // Xóa file .part nếu có
    const partFile = processInfo.outputPath + ".part";
    if (fs.existsSync(partFile)) {
      fs.unlinkSync(partFile);
      console.log(`Đã xóa file tạm: ${partFile}`);
    }

    // Xóa khỏi bộ nhớ
    activeProcesses.delete(downloadId);
    downloadProgress.delete(downloadId);

    console.log(`Đã xóa tiến trình ${downloadId} khỏi bộ nhớ`);
    res.json({ success: true, message: "Đã hủy tải video" });
  } catch (error) {
    console.error(`Lỗi khi hủy tải ${downloadId}:`, error);
    res.json({
      success: false,
      message: "Lỗi khi hủy tải: " + error.message,
    });
  }
});

// API xóa video đã tải
app.delete("/delete-video/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(downloadsDir, filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: "Đã xóa video" });
    } else {
      res.json({ success: false, message: "Không tìm thấy file" });
    }
  } catch (error) {
    res.json({ success: false, message: "Lỗi khi xóa file: " + error.message });
  }
});

// Serve files from downloads directory
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

startServer();
