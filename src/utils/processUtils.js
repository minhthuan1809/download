export function isProcessRunning(pid) {
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

export function killProcessTree(processInfo) {
  if (!processInfo || !processInfo.process) return;

  const pid = processInfo.process.pid;
  console.log(`Đang kill process ${pid} và các process con của nó`);

  if (process.platform === 'win32') {
    const { execSync } = require('child_process');
    try {
      execSync(`taskkill /pid ${pid} /T /F`);
      
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