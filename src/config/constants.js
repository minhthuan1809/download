export const DOWNLOADS_DIR = "downloads";
export const UPLOADS_DIR = "uploads";
export const DEFAULT_PORT = 3000;
export const CORS_OPTIONS = {
  origin: "*",
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Range"],
  exposedHeaders: ["Content-Range", "Content-Length", "Accept-Ranges"],
};

// Maps to track download progress and active processes
export const downloadProgress = new Map();
export const activeProcesses = new Map(); 