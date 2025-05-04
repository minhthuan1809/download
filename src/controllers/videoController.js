import fs from "fs";
import path from "path";
import { DOWNLOADS_DIR } from "../config/constants.js";

export function checkVideo(req, res) {
  const { filename } = req.params;
  const filePath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.json({
      success: false,
      message: "Không tìm thấy file video",
    });
  }

  res.json({
    success: true,
    message: "Video sẵn sàng để phát",
  });
}

export function streamVideo(req, res) {
  const { filename } = req.params;
  const filePath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: "Không tìm thấy file video",
    });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
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
      "Cache-Control": "public, max-age=31536000",
      "Access-Control-Allow-Origin": "*"
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=31536000",
      "Access-Control-Allow-Origin": "*"
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
} 