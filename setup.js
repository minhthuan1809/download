import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";
const execAsync = promisify(exec);

const isWindows = platform() === 'win32';

async function killProcessOnPort(port) {
  try {
    if (isWindows) {
      console.log(`🔍 Đang kiểm tra process đang sử dụng port ${port} trên Windows...`);
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const match = stdout.match(/LISTENING\s+(\d+)/);
      if (match) {
        const pid = match[1];
        console.log(`⚠️ Phát hiện process ${pid} đang sử dụng port ${port}`);
        console.log(`🛑 Đang dừng process ${pid}...`);
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`✅ Đã dừng process ${pid} đang sử dụng port ${port}`);
      }
    } else {
      console.log(`🔍 Đang kiểm tra process đang sử dụng port ${port} trên Linux...`);
      const { stdout } = await execAsync(`lsof -i :${port} -t`);
      const pid = stdout.trim();
      if (pid) {
        console.log(`⚠️ Phát hiện process ${pid} đang sử dụng port ${port}`);
        console.log(`🛑 Đang dừng process ${pid}...`);
        await execAsync(`kill -9 ${pid}`);
        console.log(`✅ Đã dừng process ${pid} đang sử dụng port ${port}`);
      }
    }
  } catch (error) {
    console.log(`ℹ️ Không có process nào đang sử dụng port ${port}`);
  }
}

async function setupPythonVirtualEnv() {
  console.log("🐍 Đang thiết lập môi trường ảo Python...");
  try {
    // Kiểm tra xem python3-venv đã được cài đặt chưa
    try {
      await execAsync("python3 -m venv --version");
    } catch {
      console.log("📥 Đang cài đặt python3-venv...");
      await execAsync("sudo apt-get install -y python3-venv");
    }

    // Tạo môi trường ảo
    await execAsync("python3 -m venv venv");
    console.log("✅ Đã tạo môi trường ảo Python thành công");
    return true;
  } catch (error) {
    console.error("❌ Lỗi khi thiết lập môi trường ảo Python:", error);
    return false;
  }
}

async function checkAndInstallTools() {
  console.log("=".repeat(50));
  console.log("🚀 Bắt đầu quá trình cài đặt và kiểm tra công cụ");
  console.log("=".repeat(50));

  try {
    console.log("\n🛑 Kiểm tra và dừng server cũ (nếu có)...");
    await killProcessOnPort(3000);

    console.log("\n🐍 Kiểm tra Python...");
    try {
      const pythonCmd = isWindows ? "python" : "python3";
      const { stdout } = await execAsync(`${pythonCmd} --version`);
      console.log(`✅ Python đã được cài đặt: ${stdout.trim()}`);
    } catch {
      console.log("❌ Python chưa được cài đặt");
      console.log("📥 Đang tải và cài đặt Python...");
      if (isWindows) {
        console.log("⚠️ Trên Windows, quá trình cài đặt Python có thể yêu cầu:");
        console.log("   - Chấp nhận điều khoản sử dụng");
        console.log("   - Chọn thư mục cài đặt");
        console.log("   - Thêm Python vào PATH");
        await execAsync("winget install Python.Python.3.11");
      } else {
        console.log("⚠️ Trên Linux, quá trình cài đặt Python có thể yêu cầu:");
        console.log("   - Nhập mật khẩu sudo");
        console.log("   - Xác nhận cài đặt các gói phụ thuộc");
        await execAsync("sudo apt-get update && sudo apt-get install -y python3 python3-pip python3-venv");
      }
      console.log("✅ Cài đặt Python hoàn tất!");
    }

    console.log("\n📦 Kiểm tra pip...");
    try {
      const pipCmd = isWindows ? "pip" : "pip3";
      const { stdout } = await execAsync(`${pipCmd} --version`);
      console.log(`✅ Pip đã được cài đặt: ${stdout.trim()}`);
    } catch {
      console.log("❌ Pip chưa được cài đặt");
      console.log("📥 Đang cài đặt pip...");
      if (isWindows) {
        console.log("⚠️ Đang nâng cấp pip...");
        await execAsync("python -m ensurepip --upgrade");
      } else {
        console.log("⚠️ Đang cài đặt pip qua apt-get...");
        await execAsync("sudo apt-get install -y python3-pip");
      }
      console.log("✅ Cài đặt pip hoàn tất!");
    }

    console.log("\n🎥 Kiểm tra yt-dlp...");
    try {
      const pythonCmd = isWindows ? "python" : "python3";
      const { stdout } = await execAsync(`${pythonCmd} -m yt_dlp --version`);
      console.log(`✅ yt-dlp đã được cài đặt: ${stdout.trim()}`);
    } catch {
      console.log("❌ yt-dlp chưa được cài đặt");
      console.log("📥 Đang cài đặt yt-dlp...");
      
      if (isWindows) {
        const pipCmd = "pip";
        console.log("⚠️ Đang tải và cài đặt yt-dlp qua pip...");
        await execAsync(`${pipCmd} install yt-dlp`);
      } else {
        // Trên Linux, sử dụng môi trường ảo
        const venvSetupSuccess = await setupPythonVirtualEnv();
        if (venvSetupSuccess) {
          console.log("⚠️ Đang cài đặt yt-dlp trong môi trường ảo...");
          await execAsync("venv/bin/pip install yt-dlp");
          // Tạo alias cho yt-dlp để có thể sử dụng từ bất kỳ đâu
          await execAsync("ln -sf $(pwd)/venv/bin/yt-dlp /usr/local/bin/yt-dlp");
        } else {
          throw new Error("Không thể thiết lập môi trường ảo Python");
        }
      }
      console.log("✅ Cài đặt yt-dlp hoàn tất!");
    }

    console.log("\n🎬 Kiểm tra FFmpeg...");
    try {
      const { stdout } = await execAsync("ffmpeg -version");
      console.log(`✅ FFmpeg đã được cài đặt: ${stdout.split('\n')[0]}`);
    } catch {
      console.log("❌ FFmpeg chưa được cài đặt");
      console.log("📥 Đang cài đặt FFmpeg...");
      if (isWindows) {
        console.log("⚠️ Trên Windows, đang thử cài đặt FFmpeg qua winget...");
        try {
          await execAsync("winget install ffmpeg");
          console.log("✅ FFmpeg đã được cài đặt thành công qua winget");
        } catch (wingetError) {
          console.log("⚠️ Không thể cài đặt FFmpeg qua winget, đang thử qua chocolatey...");
          try {
            console.log("⚠️ Chocolatey có thể yêu cầu:");
            console.log("   - Chấp nhận điều khoản sử dụng");
            console.log("   - Xác nhận cài đặt");
            await execAsync("choco install ffmpeg -y");
            console.log("✅ FFmpeg đã được cài đặt thành công qua chocolatey");
          } catch (chocoError) {
            console.error("❌ Không thể cài đặt FFmpeg tự động");
            console.error("Vui lòng cài đặt FFmpeg thủ công theo hướng dẫn sau:");
            console.error("1. Truy cập https://ffmpeg.org/download.html");
            console.error("2. Tải và cài đặt phiên bản phù hợp với hệ điều hành của bạn");
            console.error("3. Thêm đường dẫn FFmpeg vào biến môi trường PATH");
            throw new Error("Không thể cài đặt FFmpeg tự động");
          }
        }
      } else {
        console.log("⚠️ Trên Linux, đang cài đặt FFmpeg qua apt-get...");
        console.log("⚠️ Có thể yêu cầu nhập mật khẩu sudo");
        await execAsync("sudo pip3 install yt-dlp");
        console.log("✅ FFmpeg đã được cài đặt thành công");
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("✨ Cài đặt hoàn tất!");
    console.log("=".repeat(50));
    console.log("\n🚀 Đang khởi động server...");

    // Khởi động server
    const { stdout, stderr } = await execAsync("npm run start");
    console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    console.error("\n❌ Lỗi trong quá trình cài đặt:", error);
    console.error("Vui lòng kiểm tra và thử lại!");
  }
}

checkAndInstallTools();
