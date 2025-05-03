import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getNextNumber(downloadCount) {
  downloadCount++;
  return String(downloadCount).padStart(3, "0");
}

export function getSafeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export function findActualFile(baseFileName, downloadsDir) {
  const files = fs.readdirSync(downloadsDir);
  
  const prefixMatch = baseFileName.match(/^(\d+)_/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const matchingFiles = files.filter(file => file.startsWith(prefix + '_'));
    if (matchingFiles.length > 0) {
      return matchingFiles[0];
    }
  }
  
  if (files.includes(baseFileName)) {
    return baseFileName;
  }
  
  const baseWithoutExt = path.basename(baseFileName, path.extname(baseFileName));
  for (const file of files) {
    if (file.includes(baseWithoutExt)) {
      return file;
    }
  }
  
  return null;
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
} 