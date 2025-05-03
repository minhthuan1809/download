import { exec } from "node:child_process";
import path from "path";
import fs from "fs";
import { getNextNumber, getSafeFilename, findActualFile, formatFileSize } from "../utils/fileUtils.js";
import { killProcessTree } from "../utils/processUtils.js";
import { DOWNLOADS_DIR } from "../config/constants.js";

// Lưu trữ tiến trình tải
const downloadProgress = new Map();
let downloadCount = 0;
const activeProcesses = new Map();

export function handleDownload(req, res) {
  const url = req.body.url;
  const downloadId = Date.now().toString();

  if (!url || !url.startsWith("http")) {
    return res.json({ success: false, message: "❌ Link không hợp lệ!" });
  }

  const isDirectM3U8 = url.toLowerCase().includes(".m3u8");

  console.log(`Bắt đầu tải file với ID: ${downloadId}`);
  console.log("URL:", url);
  console.log("Loại link:", isDirectM3U8 ? "M3U8 trực tiếp" : "Link thông thường");

  downloadProgress.set(downloadId, {
    status: "downloading",
    progress: 0,
    message: "Đang chuẩn bị tải...",
    lastUpdate: Date.now()
  });

  const prefix = getNextNumber(downloadCount);
  const outputTemplate = path.join(
    DOWNLOADS_DIR,
    `${prefix}_video.%(ext)s`
  );

  let cmd;
  if (isDirectM3U8) {
    cmd = `python -m yt_dlp "${url}" --downloader ffmpeg --downloader-args "ffmpeg_i:-headers 'User-Agent: Mozilla/5.0' -c:v libx264 -c:a aac -movflags +faststart" -o "${outputTemplate}" --no-check-certificates --newline --retries 10 --fragment-retries 10 --hls-prefer-native --merge-output-format mp4`;
  } else {
    cmd = `python -m yt_dlp "${url}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" --no-check-certificates --newline --remux-video mp4`;
  }

  try {
    console.log("Lệnh tải:", cmd);
    const process = exec(cmd);
    console.log(`Tiến trình tải được tạo với ID: ${downloadId}, PID: ${process.pid}`);

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

    let actualFilename = null;
    let lastProgressUpdate = Date.now();

    process.stdout.on("data", (data) => {
      console.log(`[${downloadId}] Output:`, data);
      
      const filenameMatch = data.match(/\[download\] Destination: (.+)/);
      if (filenameMatch) {
        actualFilename = path.basename(filenameMatch[1]);
        console.log(`Đang tải file: ${actualFilename}`);
      }

      if (data.includes("[download]")) {
        const progressMatch = data.match(/\[download\]\s+(\d+\.\d+)%/);
        if (progressMatch) {
          const progress = parseFloat(progressMatch[1]);
          const now = Date.now();
          if (now - lastProgressUpdate > 1000) {
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
            progress: -1,
            message: message,
            lastUpdate: now
          });
          lastProgressUpdate = now;
        }
      }

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
        let foundFile = null;
        
        if (actualFilename) {
          const fullPath = path.join(DOWNLOADS_DIR, actualFilename);
          if (fs.existsSync(fullPath)) {
            foundFile = actualFilename;
          }
        }
        
        if (!foundFile && processInfo) {
          const files = fs.readdirSync(DOWNLOADS_DIR);
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
}

export function getDownloadProgress(req, res) {
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
}

export function getDownloadsList(req, res) {
  try {
    const files = fs
      .readdirSync(DOWNLOADS_DIR)
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.mpg', '.mpeg'].includes(ext);
      })
      .map((file) => {
        const filePath = path.join(DOWNLOADS_DIR, file);
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
        const numA = parseInt(a.name.split("_")[0]) || 0;
        const numB = parseInt(b.name.split("_")[0]) || 0;
        if (numA !== numB) return numB - numA;
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
}

export function streamVideo(req, res) {
  const requestedFilename = req.params.filename;
  
  let actualFilename = findActualFile(requestedFilename, DOWNLOADS_DIR);
  if (!actualFilename) {
    console.error(`Không tìm thấy file: ${requestedFilename}`);
    return res.status(404).send("File không tồn tại");
  }
  
  const filePath = path.join(DOWNLOADS_DIR, actualFilename);
  console.log(`Streaming file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`File không tồn tại tại đường dẫn: ${filePath}`);
    return res.status(404).send("File không tồn tại");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  let contentType = "video/mp4";
  
  if (ext === '.mkv') contentType = "video/x-matroska";
  else if (ext === '.webm') contentType = "video/webm";
  else if (ext === '.mov') contentType = "video/quicktime";
  else if (ext === '.avi') contentType = "video/x-msvideo";
  else if (ext === '.flv') contentType = "video/x-flv";
  else if (ext === '.mpg' || ext === '.mpeg') contentType = "video/mpeg";

  if (range) {
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
}

export function checkVideoStatus(req, res) {
  const requestedFilename = req.params.filename;
  
  let actualFilename = findActualFile(requestedFilename, DOWNLOADS_DIR);
  if (!actualFilename) {
    return res.json({
      success: false,
      message: "File không tồn tại",
    });
  }
  
  const filePath = path.join(DOWNLOADS_DIR, actualFilename);

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
}

export function deleteVideo(req, res) {
  const { filename } = req.params;
  
  try {
    let actualFilename = findActualFile(filename, DOWNLOADS_DIR);
    if (!actualFilename) {
      return res.json({ success: false, message: "Không tìm thấy file" });
    }
    
    const filePath = path.join(DOWNLOADS_DIR, actualFilename);
    
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
} 