import express from "express";
import {
  handleDownload,
  getDownloadProgress,
  getDownloadsList,
  streamVideo,
  checkVideoStatus,
  deleteVideo
} from "../controllers/downloadController.js";

const router = express.Router();

router.post("/download", handleDownload);
router.get("/progress/:downloadId", getDownloadProgress);
router.get("/downloads", getDownloadsList);
router.get("/downloads/:filename", streamVideo);
router.get("/check-video/:filename", checkVideoStatus);
router.delete("/delete-video/:filename", deleteVideo);

export default router; 