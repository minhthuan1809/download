import { downloadProgress } from "../config/constants.js";

export function getProgress(req, res) {
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
    progress: {
      progress: progress.progress,
      status: progress.status,
      message: progress.message,
      lastUpdate: progress.lastUpdate,
    },
  });
} 