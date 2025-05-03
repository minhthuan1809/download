import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { DOWNLOADS_DIR, downloadProgress, activeProcesses } from "../config/constants.js";
import { killProcessTree } from "../utils/processUtils.js";
import { findActualFile, formatFileSize } from "../utils/fileUtils.js";

// Function to get yt-dlp command based on platform
function getYtDlpCommand() {
  const localYtDlp = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  
  // Check in current directory
  if (fs.existsSync(localYtDlp)) {
    return `./${localYtDlp}`;
  }
  
  // Check in project root directory
  const rootYtDlp = path.join(process.cwd(), localYtDlp);
  if (fs.existsSync(rootYtDlp)) {
    return rootYtDlp;
  }
  
  // Fallback to global yt-dlp
  return 'yt-dlp';
}

// Function to get ffmpeg command
function getFfmpegCommand() {
  const localFfmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  
  // Check in current directory
  if (fs.existsSync(localFfmpeg)) {
    return `./${localFfmpeg}`;
  }
  
  // Check in project root directory
  const rootFfmpeg = path.join(process.cwd(), localFfmpeg);
  if (fs.existsSync(rootFfmpeg)) {
    return rootFfmpeg;
  }
  
  // Fallback to global ffmpeg
  return 'ffmpeg';
}

// Function to process video with ffmpeg
function processVideoWithFfmpeg(inputPath, outputPath, callback) {
  const ffmpegArgs = [
    '-i', inputPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    '-profile:v', 'high',
    '-level:v', '4.0',
    '-pix_fmt', 'yuv420p',
    '-crf', '23',
    '-preset', 'medium',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // Đảm bảo kích thước chia hết cho 2
    '-metadata', 'title=Video',
    '-metadata', 'artist=Video Downloader',
    outputPath
  ];

  const ffmpegProcess = spawn(getFfmpegCommand(), ffmpegArgs);
  
  ffmpegProcess.stderr.on('data', (data) => {
    console.log(`FFmpeg: ${data}`);
  });

  ffmpegProcess.on('close', (code) => {
    if (code === 0) {
      console.log('FFmpeg processing completed successfully');
      // Xóa file gốc sau khi xử lý xong
      fs.unlink(inputPath, (err) => {
        if (err) console.error('Error deleting original file:', err);
        callback(null, outputPath);
      });
    } else {
      console.error(`FFmpeg processing failed with code ${code}`);
      callback(new Error(`FFmpeg processing failed with code ${code}`));
    }
  });
}

// Logging function
function logRequest(req, res, next) {
  console.log('\n=== API Request ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Params:', req.params);
  console.log('Query:', req.query);
  
  // Store the original res.json function
  const originalJson = res.json;
  
  // Override res.json to log the response
  res.json = function(data) {
    console.log('\n=== API Response ===');
    console.log('Status:', res.statusCode);
    console.log('Data:', data);
    return originalJson.call(this, data);
  };
  
  next();
}

export function handleDownload(req, res) {
  logRequest(req, res, () => {
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
          '--add-metadata',
          '--embed-thumbnail'
        ];
      }

      console.log('\n=== Download Process ===');
      console.log('Download ID:', downloadId);
      console.log('URL:', url);
      console.log('Format:', format);
      console.log('yt-dlp Arguments:', ytdlpArgs);

      // Khởi tạo tiến trình tải với đường dẫn yt-dlp phù hợp
      const process = spawn(getYtDlpCommand(), ytdlpArgs);
      
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
            const inputPath = path.join(DOWNLOADS_DIR, foundFile);
            const outputPath = path.join(DOWNLOADS_DIR, `processed_${foundFile}`);
            
            // Xử lý video với ffmpeg
            processVideoWithFfmpeg(inputPath, outputPath, (error, finalPath) => {
              if (error) {
                console.error('Error processing video:', error);
                downloadProgress.set(downloadId, {
                  status: "error",
                  progress: 0,
                  message: "❌ Lỗi khi xử lý video",
                  lastUpdate: Date.now()
                });
              } else {
                const finalFilename = path.basename(finalPath);
                downloadProgress.set(downloadId, {
                  status: "completed",
                  progress: 100,
                  message: "✅ Tải hoàn tất!",
                  filename: finalFilename,
                  lastUpdate: Date.now()
                });
                console.log(`File đã tải và xử lý: ${finalFilename}`);
              }
            });
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
}

export function cancelDownload(req, res) {
  logRequest(req, res, () => {
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
  });
}

export function getDownloadProgress(req, res) {
  logRequest(req, res, () => {
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
}

export function getDownloadsList(req, res) {
  logRequest(req, res, () => {
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
  });
}

export function streamVideo(req, res) {
  logRequest(req, res, () => {
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
  });
}

export function checkVideoStatus(req, res) {
  logRequest(req, res, () => {
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
  });
}

export function deleteVideo(req, res) {
  logRequest(req, res, () => {
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
  });
} 