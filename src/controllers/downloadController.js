import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { DOWNLOADS_DIR, downloadProgress, activeProcesses } from "../config/constants.js";
import { killProcessTree } from "../utils/processUtils.js";
import { findActualFile, formatFileSize } from "../utils/fileUtils.js";

export function handleDownload(req, res) {
  const url = req.body.url;
  const format = req.body.format || 'mp4';
  const downloadId = uuidv4();

  try {
    // Tạo thư mục downloads nếu chưa có
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR);
    }

    let ytdlpArgs;
    if (format === 'mp3') {
      ytdlpArgs = [
        url,
        '-o', path.join(DOWNLOADS_DIR, `${downloadId}.%(ext)s`),
        '--no-playlist',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0'
      ];
    } else {
      ytdlpArgs = [
        url,
        '-o', path.join(DOWNLOADS_DIR, `${downloadId}.%(ext)s`),
        '--no-playlist',
        '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
      ];
    }

    // Khởi tạo tiến trình tải
    const process = spawn("yt-dlp", ytdlpArgs);
      

    // Lưu thông tin tiến trình
    activeProcesses.set(downloadId, {
      process,
      startTime: new Date(),
      url,
    });

    // Khởi tạo tiến trình tải
    downloadProgress.set(downloadId, {
      status: "downloading",
      progress: 0,
      message: "Đang tải...",
      lastUpdate: Date.now(),
    });

    // Xử lý output của tiến trình
    let actualFilename = null;
    process.stdout.on("data", (data) => {
      const output = data.toString();
      console.log(`[${downloadId}] ${output}`);

      // Cập nhật tiến trình từ output
      const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%/);
      if (progressMatch) {
        const progress = parseFloat(progressMatch[1]);
        downloadProgress.set(downloadId, {
          status: "downloading",
          progress,
          message: "Đang tải...",
          lastUpdate: Date.now(),
        });
      }

      // Lấy tên file thực tế
      const filenameMatch = output.match(/\[download\] Destination: (.+)/);
      if (filenameMatch) {
        actualFilename = path.basename(filenameMatch[1]);
      }
    });

    process.stderr.on("data", (data) => {
      console.error(`[${downloadId}] Error: ${data}`);
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

export function cancelDownload(req, res) {
  const { downloadId } = req.params;
  const processInfo = activeProcesses.get(downloadId);

  if (!processInfo) {
    return res.json({
      success: false,
      message: "Không tìm thấy tiến trình tải",
    });
  }

  try {
    killProcessTree(processInfo);
    activeProcesses.delete(downloadId);
    downloadProgress.delete(downloadId);

    res.json({
      success: true,
      message: "Đã hủy tải file",
    });
  } catch (error) {
    console.error(`Lỗi khi hủy tải ${downloadId}:`, error);
    res.json({
      success: false,
      message: `Lỗi khi hủy tải: ${error.message}`,
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
        return ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.mpg', '.mpeg', '.m4a' , '.mp3' ].includes(ext);
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