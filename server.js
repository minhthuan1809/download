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
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Range"],
    exposedHeaders: ["Content-Range", "Content-Length", "Accept-Ranges"],
  })
);
app.use(bodyParser.json());

// Lấy thư mục gốc theo kiểu ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tạo thư mục downloads nếu chưa có
const downloadsDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
  console.log("📁 Đã tạo thư mục downloads");
} else {
  console.log("✅ Thư mục downloads đã tồn tại");
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
const upload = multer({ dest: 'uploads/' });

// Hàm lấy số thứ tự tiếp theo
function getNextNumber() {
  downloadCount++;
  return String(downloadCount).padStart(3, "0"); // Format: 001, 002, ...
}

// Hàm kiểm tra và tạo tên file an toàn
function getSafeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
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

// Hàm kiểm tra file tồn tại trong thư mục download
function findActualFile(baseFileName) {
  // Kiểm tra xem có file nào tương ứng trong thư mục downloads
  const files = fs.readdirSync(downloadsDir);
  
  // Tìm file có chứa prefix số trong tên
  const prefixMatch = baseFileName.match(/^(\d+)_/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    // Tìm các file có prefix giống nhau
    const matchingFiles = files.filter(file => file.startsWith(prefix + '_'));
    if (matchingFiles.length > 0) {
      return matchingFiles[0]; // Trả về file đầu tiên trùng prefix
    }
  }
  
  // Tìm file trực tiếp
  if (files.includes(baseFileName)) {
    return baseFileName;
  }
  
  // Tìm file có tên tương tự (không phân biệt đuôi file)
  const baseWithoutExt = path.basename(baseFileName, path.extname(baseFileName));
  for (const file of files) {
    if (file.includes(baseWithoutExt)) {
      return file;
    }
  }
  
  return null;
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
    message: "Đang chuẩn bị tải...",
    lastUpdate: Date.now()
  });

  const prefix = getNextNumber();
  // Sử dụng output template đơn giản hơn để tránh lỗi với tên file phức tạp
  const outputTemplate = path.join(
    downloadsDir,
    `${prefix}_video.%(ext)s`
  );

  // Tùy chỉnh lệnh tải dựa vào loại URL
  let cmd;
  if (isDirectM3U8) {
    // Thêm các tùy chọn để xử lý HLS tốt hơn
    cmd = `python -m yt_dlp "${url}" --downloader ffmpeg --downloader-args "ffmpeg_i:-headers 'User-Agent: Mozilla/5.0' -c copy -bsf:a aac_adtstoasc" -o "${outputTemplate}" --no-check-certificates --newline --retries 10 --fragment-retries 10 --hls-prefer-native`;
  } else {
    cmd = `python -m yt_dlp "${url}" -f "best" -o "${outputTemplate}" --no-check-certificates --newline`;
  }

  try {
    console.log("Lệnh tải:", cmd);
    const process = exec(cmd);
    console.log(`Tiến trình tải được tạo với ID: ${downloadId}, PID: ${process.pid}`);

    // Lưu thông tin process để có thể hủy sau này
    activeProcesses.set(downloadId, {
      process: process,
      outputTemplate: outputTemplate,
      url: url,
      startTime: Date.now(),
      isDownloading: false,
      pid: process.pid,
      cmd: cmd,
      prefix: prefix
    });

    // Biến để lưu tên file thực tế khi tiến trình hoàn tất
    let actualFilename = null;
    let lastProgressUpdate = Date.now();

    process.stdout.on("data", (data) => {
      console.log(`[${downloadId}] Output:`, data);
      
      // Theo dõi tên file đang được tạo
      const filenameMatch = data.match(/\[download\] Destination: (.+)/);
      if (filenameMatch) {
        actualFilename = path.basename(filenameMatch[1]);
        console.log(`Đang tải file: ${actualFilename}`);
      }

      // Cập nhật tiến trình từ output
      if (data.includes("[download]")) {
        const progressMatch = data.match(/\[download\]\s+(\d+\.\d+)%/);
        if (progressMatch) {
          const progress = parseFloat(progressMatch[1]);
          const now = Date.now();
          if (now - lastProgressUpdate > 1000) { // Cập nhật mỗi giây
            downloadProgress.set(downloadId, {
              status: "downloading",
              progress: progress,
              message: `Đang tải: ${progress.toFixed(1)}%`,
              lastUpdate: now
            });
            lastProgressUpdate = now;
          }
        }
      }
    });

    process.stderr.on("data", (data) => {
      console.log(`[${downloadId}] stderr:`, data);
      
      // Xử lý thông tin từ FFmpeg
      const timeMatch = data.match(/time=(\d+:\d+:\d+\.\d+)/);
      const sizeMatch = data.match(/size=\s*(\d+)kB/);
      const speedMatch = data.match(/speed=([\d.]+)x/);
      
      if (timeMatch || sizeMatch || speedMatch) {
        let message = "Đang xử lý:";
        if (timeMatch) message += ` ${timeMatch[1]}`;
        if (sizeMatch) message += ` (${sizeMatch[1]}KB)`;
        if (speedMatch) message += ` tốc độ ${speedMatch[1]}x`;
        
        const now = Date.now();
        if (now - lastProgressUpdate > 1000) {
          downloadProgress.set(downloadId, {
            status: "downloading",
            progress: -1, // Không có phần trăm chính xác
            message: message,
            lastUpdate: now
          });
          lastProgressUpdate = now;
        }
      }

      // Kiểm tra lỗi HLS
      if (data.includes("Opening 'crypto+") || data.includes("[hls @")) {
        const now = Date.now();
        if (now - lastProgressUpdate > 1000) {
          downloadProgress.set(downloadId, {
            status: "downloading",
            progress: -1,
            message: "Đang giải mã video...",
            lastUpdate: now
          });
          lastProgressUpdate = now;
        }
      }
    });

    process.on("close", (code) => {
      console.log(`Tiến trình ${downloadId} kết thúc với mã: ${code}`);
      const processInfo = activeProcesses.get(downloadId);
      
      if (code === 0) {
        // Tìm file thực tế đã được tải về
        let foundFile = null;
        
        if (actualFilename) {
          // Kiểm tra xem file có tồn tại không
          const fullPath = path.join(downloadsDir, actualFilename);
          if (fs.existsSync(fullPath)) {
            foundFile = actualFilename;
          }
        }
        
        // Nếu không tìm thấy bằng tên file, tìm theo prefix
        if (!foundFile && processInfo) {
          const files = fs.readdirSync(downloadsDir);
          foundFile = files.find(file => file.startsWith(`${processInfo.prefix}_`));
        }
        
        if (foundFile) {
          downloadProgress.set(downloadId, {
            status: "completed",
            progress: 100,
            message: "✅ Tải hoàn tất!",
            filename: foundFile,
            lastUpdate: Date.now()
          });
          console.log(`File đã tải: ${foundFile}`);
        } else {
          downloadProgress.set(downloadId, {
            status: "error",
            progress: 0,
            message: "❓ Hoàn tất nhưng không tìm thấy file",
            lastUpdate: Date.now()
          });
        }
      } else {
        downloadProgress.set(downloadId, {
          status: "error",
          progress: 0,
          message: `❌ Lỗi khi tải file (Mã lỗi: ${code})`,
          lastUpdate: Date.now()
        });
      }
      
      activeProcesses.delete(downloadId);
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
    // Lấy danh sách tất cả các video có định dạng phổ biến
    const files = fs
      .readdirSync(downloadsDir)
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.mpg', '.mpeg'].includes(ext);
      })
      .map((file) => {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);
        
        return {
          name: file,
          path: `/downloads/${file}`,
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size),
          date: stats.mtime.toISOString(),
          type: path.extname(file).substring(1),
        };
      })
      .sort((a, b) => {
        // Sắp xếp theo số thứ tự trong tên file hoặc theo thời gian
        const numA = parseInt(a.name.split("_")[0]) || 0;
        const numB = parseInt(b.name.split("_")[0]) || 0;
        if (numA !== numB) return numB - numA; // Sắp xếp giảm dần theo số
        
        // Nếu số giống nhau hoặc không có số, sắp xếp theo thời gian
        return new Date(b.date) - new Date(a.date);
      });

    res.json({
      success: true,
      files: files,
    });
  } catch (error) {
    console.error("Lỗi khi đọc danh sách video:", error);
    res.json({
      success: false,
      message: "Lỗi khi đọc danh sách video: " + error.message,
    });
  }
});

// Hàm định dạng kích thước file
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// Phục vụ file video đã tải với hỗ trợ streaming
app.get("/downloads/:filename", (req, res, next) => {
  // Xử lý tên file từ URL
  const requestedFilename = req.params.filename;
  
  // Tìm file thực tế trong thư mục
  let actualFilename = findActualFile(requestedFilename);
  if (!actualFilename) {
    console.error(`Không tìm thấy file: ${requestedFilename}`);
    return res.status(404).send("File không tồn tại");
  }
  
  const filePath = path.join(downloadsDir, actualFilename);
  console.log(`Streaming file: ${filePath}`);

  // Kiểm tra file có tồn tại không
  if (!fs.existsSync(filePath)) {
    console.error(`File không tồn tại tại đường dẫn: ${filePath}`);
    return res.status(404).send("File không tồn tại");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Xác định kiểu MIME dựa vào phần mở rộng
  const ext = path.extname(filePath).toLowerCase();
  let contentType = "video/mp4"; // Mặc định
  
  if (ext === '.mkv') contentType = "video/x-matroska";
  else if (ext === '.webm') contentType = "video/webm";
  else if (ext === '.mov') contentType = "video/quicktime";
  else if (ext === '.avi') contentType = "video/x-msvideo";
  else if (ext === '.flv') contentType = "video/x-flv";
  else if (ext === '.mpg' || ext === '.mpeg') contentType = "video/mpeg";

  if (range) {
    // Xử lý range request cho streaming
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    
    console.log(`Range request: ${start}-${end}/${fileSize}`);
    
    try {
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
      };

      res.writeHead(206, head);
      file.pipe(res);
      
      file.on('error', (err) => {
        console.error(`Lỗi stream file: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).send("Lỗi khi đọc file");
        }
      });
    } catch (error) {
      console.error(`Lỗi xử lý range request: ${error.message}`);
      res.status(500).send("Lỗi khi xử lý yêu cầu streaming");
    }
  } else {
    // Phục vụ toàn bộ file nếu không có range request
    try {
      console.log(`Serving full file: ${filePath}`);
      const head = {
        "Content-Length": fileSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      };

      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error(`Lỗi phục vụ file đầy đủ: ${error.message}`);
      res.status(500).send("Lỗi khi phục vụ file");
    }
  }
});

// Thêm route để kiểm tra trạng thái video
app.get("/check-video/:filename", (req, res) => {
  const requestedFilename = req.params.filename;
  
  // Tìm file thực tế trong thư mục
  let actualFilename = findActualFile(requestedFilename);
  if (!actualFilename) {
    return res.json({
      success: false,
      message: "File không tồn tại",
    });
  }
  
  const filePath = path.join(downloadsDir, actualFilename);

  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      res.json({
        success: true,
        filename: actualFilename,
        size: stat.size,
        sizeFormatted: formatFileSize(stat.size),
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
    console.error(`Lỗi khi kiểm tra file: ${error.message}`);
    res.json({
      success: false,
      message: "Lỗi khi kiểm tra file: " + error.message,
    });
  }
});

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

    // Tìm các file liên quan để xóa
    if (processInfo.prefix) {
      const files = fs.readdirSync(downloadsDir);
      const relatedFiles = files.filter(file => file.startsWith(processInfo.prefix + '_'));
      
      // Xóa tất cả các file liên quan
      for (const file of relatedFiles) {
        const filePath = path.join(downloadsDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Đã xóa file: ${filePath}`);
        }
      }
    }

    // Xóa file .part nếu có
    const partFiles = fs.readdirSync(downloadsDir).filter(file => file.endsWith('.part'));
    for (const partFile of partFiles) {
      if (partFile.startsWith(processInfo.prefix + '_')) {
        const partFilePath = path.join(downloadsDir, partFile);
        fs.unlinkSync(partFilePath);
        console.log(`Đã xóa file tạm: ${partFilePath}`);
      }
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
  
  try {
    // Tìm file thực tế trong thư mục
    let actualFilename = findActualFile(filename);
    if (!actualFilename) {
      return res.json({ success: false, message: "Không tìm thấy file" });
    }
    
    const filePath = path.join(downloadsDir, actualFilename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Đã xóa file: ${filePath}`);
      res.json({ success: true, message: "Đã xóa video" });
    } else {
      res.json({ success: false, message: "Không tìm thấy file" });
    }
  } catch (error) {
    console.error(`Lỗi khi xóa file: ${error.message}`);
    res.json({ success: false, message: "Lỗi khi xóa file: " + error.message });
  }
});

// Thêm middleware xử lý CORS cho video streaming
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, DELETE, POST");
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

startServer();