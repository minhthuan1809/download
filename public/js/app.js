const activeDownloads = new Map();
let hls = null;

// Biến lưu số lần lỗi liên tiếp cho mỗi downloadId
const downloadErrorCount = {};

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function hideError() {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.style.display = 'none';
}

async function downloadVideo() {
  const url = document.getElementById('videoUrl').value;
  const downloadBtn = document.getElementById('downloadBtn');

  if (!url) {
    showErrorToast('❌ Vui lòng nhập link!');
    return;
  }

  downloadBtn.disabled = true;
  downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';

  try {
    const res = await fetch('/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();
    if (data.success) {
      const downloadId = data.downloadId;
      activeDownloads.set(downloadId, {
        url: url,
        progress: 0,
        status: 'downloading',
        message: 'Đang tải...',
        startTime: new Date()
      });
      updateDownloadList();
      checkProgress(downloadId);
    } else {
      showErrorToast('❌ Lỗi: ' + data.message);
    }
  } catch (err) {
    showErrorToast('⚠️ Lỗi kết nối: ' + err.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = '<i class="fas fa-download"></i> Tải xuống';
    document.getElementById('videoUrl').value = '';
  }
}

async function checkProgress(downloadId) {
  try {
    const res = await fetch(`/progress/${downloadId}`);
    const data = await res.json();

    if (data.success) {
      const progress = data.progress;
      const download = activeDownloads.get(downloadId);

      // Reset số lần lỗi nếu thành công
      downloadErrorCount[downloadId] = 0;

      if (download) {
        // Chỉ cập nhật nếu thông tin mới hơn
        if (!progress.lastUpdate || progress.lastUpdate > download.lastUpdate) {
          download.progress = progress.progress;
          download.status = progress.status;
          download.message = progress.message;
          download.lastUpdate = progress.lastUpdate || Date.now();

          if (progress.status === 'completed') {
            download.message = '✅ Tải hoàn tất!';
            loadCompletedDownloads(); // Cập nhật danh sách video đã tải
          } else if (progress.status === 'error') {
            download.message = progress.message || '❌ Lỗi khi tải';
          }

          updateDownloadList();

          // Nếu vẫn đang tải, tiếp tục kiểm tra
          if (progress.status === 'downloading') {
            setTimeout(() => checkProgress(downloadId), 1000);
          } else if (progress.status === 'completed') {
            // Xóa khỏi danh sách đang tải sau 3 giây
            setTimeout(() => {
              if (activeDownloads.has(downloadId)) {
                activeDownloads.delete(downloadId);
                updateDownloadList();
              }
            }, 3000);
          }
        }
      }
    } else {
      console.error('Lỗi khi kiểm tra tiến trình:', data.message);
    }
  } catch (err) {
    // Tăng số lần lỗi liên tiếp
    if (!downloadErrorCount[downloadId]) downloadErrorCount[downloadId] = 0;
    downloadErrorCount[downloadId]++;
    const download = activeDownloads.get(downloadId);
    if (download) {
      if (downloadErrorCount[downloadId] > 5) {
        download.status = 'error';
        download.message = '❌ Lỗi kết nối (đã thử lại nhiều lần)';
        updateDownloadList();
      } else {
        // Thử lại sau 2 giây
        setTimeout(() => checkProgress(downloadId), 2000);
      }
    }
    console.error('Lỗi khi kiểm tra tiến trình:', err);
  }
}

function updateDownloadList() {
  const container = document.getElementById('activeDownloads');

  if (activeDownloads.size === 0) {
    container.innerHTML = `
      <div class="empty-state text-center p-10 text-gray">
        <i class="fas fa-cloud-download-alt text-4xl mb-4 opacity-50"></i>
        <p>Chưa có video nào đang tải</p>
      </div>
    `;
    return;
  }

  let html = '';
  activeDownloads.forEach((download, id) => {
    const url = download.url || 'Không xác định';
    const progress = download.progress || 0;
    const status = download.status || 'downloading';
    const message = download.message || 'Đang tải...';
    const lastUpdate = download.lastUpdate || Date.now();
    const timeAgo = Math.floor((Date.now() - lastUpdate) / 1000);

    // Thêm class cho trạng thái lỗi
    const errorClass = status === 'error' ? 'text-danger' : '';
    const progressClass = status === 'error' ? 'bg-danger' : 'bg-gradient-to-r from-primary to-success';
    
    // Thêm thông tin thời gian
    let timeInfo = '';
    if (timeAgo > 5) {
      timeInfo = `<span class="text-gray text-sm">(Cập nhật ${timeAgo}s trước)</span>`;
    }

    html += `
      <div class="download-item flex justify-between items-center p-4 border-b border-gray-light transition-all duration-300 hover:bg-primary/5">
        <div class="download-info flex-1">
          <div class="download-url mb-2 font-medium truncate max-w-[600px]">${url}</div>
          <div class="progress-container my-4">
            <div class="progress-info flex justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="${errorClass}">${message}</span>
                ${timeInfo}
              </div>
              <span class="progress-percentage font-semibold ${status === 'error' ? 'text-danger' : 'text-primary'}">
                ${progress >= 0 ? progress.toFixed(1) + '%' : '...'}
              </span>
            </div>
            <div class="progress-bar w-full h-2.5 bg-gray-light rounded overflow-hidden relative">
              <div class="progress absolute inset-0 ${progressClass} transition-all duration-500 ease-out" 
                style="width: ${progress >= 0 ? progress : 0}%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function loadCompletedDownloads() {
  try {
    const res = await fetch('/downloads');
    const data = await res.json();

    const container = document.getElementById('completedList');

    if (!data.success || data.files.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center p-10 text-gray">
          <i class="fas fa-film text-4xl mb-4 opacity-50"></i>
          <p>Chưa có video nào được tải</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    data.files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'download-item flex justify-between items-center p-4 border-b border-gray-light transition-all duration-300 hover:bg-primary/5';
      item.style.animationDelay = `${index * 0.05}s`;

      item.innerHTML = `
        <div class="download-info flex-1">
          <div class="download-url mb-2 font-medium truncate max-w-[600px]">${file.name}</div>
          <div class="download-meta text-gray text-sm flex items-center">
            <i class="fas fa-hdd mr-1.5"></i> ${formatFileSize(file.size)}
          </div>
        </div>
        <div class="download-actions flex gap-2.5">
          <button onclick="playVideo('${file.path}')" class="action-btn bg-primary text-white px-3 py-2 rounded-custom text-sm cursor-pointer transition-all duration-300 flex items-center hover:bg-primary-dark">
            <i class="fas fa-play mr-1.5"></i> Xem
          </button>
          <button onclick="downloadFile('${file.path}')" class="action-btn bg-light text-dark border border-gray-light px-3 py-2 rounded-custom text-sm cursor-pointer transition-all duration-300 flex items-center hover:bg-gray-light">
            <i class="fas fa-download mr-1.5"></i> Tải về
          </button>
          <button onclick="sendToTelegram('${file.path}')" class="action-btn bg-[#0088cc] text-white px-3 py-2 rounded-custom text-sm cursor-pointer transition-all duration-300 flex items-center hover:bg-[#0088cc]/90">
            <i class="fab fa-telegram mr-1.5"></i> Telegram
          </button>
          <button onclick="deleteVideo('${file.name}')" class="action-btn bg-danger text-white px-3 py-2 rounded-custom text-sm cursor-pointer transition-all duration-300 flex items-center hover:bg-danger/90">
            <i class="fas fa-trash mr-1.5"></i> Xóa
          </button>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    console.error('Lỗi tải danh sách video:', err);
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function downloadFile(path) {
  window.open(path, '_blank');
}

async function playVideo(path) {
  const modal = document.getElementById('videoModal');
  const video = document.getElementById('videoPlayer');

  modal.style.display = 'block';
  hideError();
  showError('Đang kiểm tra video...');

  try {
    const filename = path.split('/').pop();
    const checkResponse = await fetch(`/check-video/${filename}`);
    const checkData = await checkResponse.json();

    if (!checkData.success) {
      showError('Không thể phát video: ' + checkData.message);
      return;
    }

    video.pause();
    video.src = '';
    video.load();

    if (hls) {
      hls.destroy();
      hls = null;
    }

    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
      <div class="spinner"></div>
      <div class="loading-text">Đang tải video...</div>
    `;
    document.querySelector('.video-container').appendChild(loadingIndicator);

    try {
      if (path.includes('.m3u8')) {
        if (Hls.isSupported()) {
          hls = new Hls({
            debug: false,
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxBufferLength: 30,
            maxMaxBufferLength: 600,
            maxBufferSize: 200 * 1000 * 1000,
            xhrSetup: function (xhr, url) {
              xhr.withCredentials = false;
            },
            progressive: true,
            startLevel: -1,
            abrEwmaDefaultEstimate: 500000,
            abrMaxWithRealBitrate: true,
            testBandwidth: true,
            fragLoadingMaxRetry: 5,
            manifestLoadingMaxRetry: 5,
            levelLoadingMaxRetry: 5
          });

          hls.attachMedia(video);

          hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            console.log('HLS attached to video');
            hls.loadSource(path);

            video.addEventListener('waiting', function () {
              console.log('Video is buffering...');
              showError('Đang tải video...');
            });

            video.addEventListener('playing', function () {
              console.log('Video is playing');
              hideError();
            });
          });

          hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
            console.log('Manifest parsed, quality levels:', data.levels.length);
            video.play().catch(function (error) {
              console.error('Autoplay failed:', error);
              showError('Không thể tự động phát. Vui lòng nhấn play.');
            });
          });

          hls.on(Hls.Events.ERROR, function (event, data) {
            console.error('HLS error:', data);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  showError('Lỗi kết nối mạng. Đang thử kết nối lại...');
                  hls.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  showError('Lỗi phát video. Đang thử khôi phục...');
                  hls.recoverMediaError();
                  break;
                default:
                  showError('Không thể phát video. Vui lòng tải về để xem.');
                  hls.destroy();
                  break;
              }
            }
          });

          hls.on(Hls.Events.FRAG_BUFFERED, function (event, data) {
            const buffered = video.buffered;
            if (buffered.length > 0) {
              const bufferedEnd = buffered.end(buffered.length - 1);
              const duration = video.duration;
              const bufferedPercent = (bufferedEnd / duration) * 100;
              console.log(`Đã buffer: ${bufferedPercent.toFixed(2)}%`);
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = path;
          video.addEventListener('loadedmetadata', function () {
            video.play().catch(function (error) {
              console.error('Autoplay failed:', error);
              showError('Không thể tự động phát. Vui lòng nhấn play.');
            });
          });

          video.addEventListener('error', function (error) {
            console.error('Video error:', error);
            showError('Lỗi khi phát video. Vui lòng tải về để xem.');
          });
        } else {
          showError('Trình duyệt không hỗ trợ phát video HLS. Vui lòng tải về để xem.');
        }
      } else {
        video.src = path;

        const events = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay'];
        events.forEach(event => {
          video.addEventListener(event, () => {
            console.log(`Video event: ${event}`);
          }, { once: true });
        });

        video.addEventListener('progress', () => {
          const buffered = video.buffered;
          if (buffered.length > 0) {
            const bufferedEnd = buffered.end(buffered.length - 1);
            const duration = video.duration;
            const bufferedPercent = (bufferedEnd / duration) * 100;
            console.log(`Loading progress: ${bufferedPercent.toFixed(2)}%`);

            if (bufferedPercent > 5) {
              loadingIndicator.remove();
              hideError();
            }
          }
        });

        video.addEventListener('canplay', () => {
          loadingIndicator.remove();
          hideError();
          video.play().catch(error => {
            console.error('Autoplay failed:', error);
            showError('Không thể tự động phát. Vui lòng nhấn play.');
          });
        });

        video.addEventListener('error', error => {
          console.error('Video error:', error);
          loadingIndicator.remove();
          showError('Lỗi khi phát video. Vui lòng tải về để xem.');
        });

        video.addEventListener('stalled', () => {
          showError('Video bị giật lag. Đang cải thiện...');
        });

        video.addEventListener('waiting', () => {
          showError('Đang tải video...');
        });
      }
    } catch (error) {
      console.error('Error playing video:', error);
      loadingIndicator.remove();
      showError('Lỗi không xác định. Vui lòng tải về để xem.');
    }
  } catch (error) {
    console.error('Error checking video:', error);
    showError('Không thể kiểm tra trạng thái video');
  }
}

function closeVideoModal() {
  const modal = document.getElementById('videoModal');
  const video = document.getElementById('videoPlayer');

  modal.style.display = 'none';
  hideError();

  if (video) {
    video.pause();
    video.src = '';
    video.load();
  }

  if (hls) {
    hls.destroy();
    hls = null;
  }
}

window.onclick = function (event) {
  const modal = document.getElementById('videoModal');
  if (event.target == modal) {
    closeVideoModal();
  }
}

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    closeVideoModal();
  }
});

async function cancelDownload(downloadId) {
  if (!downloadId || !activeDownloads.has(downloadId)) {
    showErrorToast('Không tìm thấy tiến trình tải');
    return;
  }

  try {
    // Cập nhật trạng thái ngay lập tức
    const download = activeDownloads.get(downloadId);
    if (download) {
      download.status = 'cancelled';
      download.message = '❌ Đã hủy';
      updateDownloadList();
    }

    // Gửi yêu cầu hủy tải
    const res = await fetch(`/cancel-download/${downloadId}`, {
      method: 'POST'
    });
    const data = await res.json();

    if (data.success) {
      // Xóa khỏi danh sách ngay lập tức
      activeDownloads.delete(downloadId);
      updateDownloadList();
      showSuccessToast('✅ Đã hủy tải video thành công');
    } else {
      showErrorToast('Lỗi khi hủy tải: ' + data.message);
    }
  } catch (err) {
    console.error('Lỗi khi hủy tải:', err);
    showErrorToast('Lỗi kết nối khi hủy tải: ' + err.message);
  }
}

async function deleteVideo(filename) {
  if (!confirm('Bạn có chắc chắn muốn xóa video này?')) {
    return;
  }

  try {
    const res = await fetch(`/delete-video/${filename}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (data.success) {
      loadCompletedDownloads();
      showSuccessToast('✅ Đã xóa video thành công');
    } else {
      showErrorToast('Lỗi khi xóa video: ' + data.message);
    }
  } catch (err) {
    console.error('Lỗi khi xóa video:', err);
    showErrorToast('Lỗi kết nối khi xóa video');
  }
}

async function sendToTelegram(filePath) {
  try {
    const res = await fetch('/send-to-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    });
    const data = await res.json();

    if (data.success) {
      showSuccessToast('✅ Đã gửi video lên Telegram thành công!');
    } else {
      showErrorToast('❌ Lỗi khi gửi video: ' + data.message);
    }
  } catch (err) {
    console.error('Lỗi khi gửi video:', err);
    showErrorToast('Lỗi kết nối khi gửi video');
  }
}

// Validation functions
function validateInput() {
  const input = document.getElementById('videoUrl');
  const errorMessage = input.parentElement.querySelector('.error-message');
  
  if (!input.value.trim()) {
    input.classList.add('border-danger');
    input.classList.remove('border-gray-light');
    errorMessage.classList.remove('hidden');
    return false;
  } else {
    input.classList.remove('border-danger');
    input.classList.add('border-gray-light');
    errorMessage.classList.add('hidden');
    return true;
  }
}

function validateAndDownload() {
  if (validateInput()) {
    downloadVideo();
  }
}

// Function to initialize event listeners
function initializeEventListeners() {
  const videoUrlInput = document.getElementById('videoUrl');
  if (videoUrlInput) {
    // Add event listener for Enter key
    videoUrlInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        validateAndDownload();
      }
    });

    // Add event listener for input to clear error when typing
    videoUrlInput.addEventListener('input', function() {
      if (this.value.trim()) {
        this.classList.remove('border-danger');
        this.classList.add('border-gray-light');
        this.parentElement.querySelector('.error-message').classList.add('hidden');
      }
    });
  }
}

// Function to load components
async function loadComponents() {
  const components = [
    { id: 'header', path: '/components/header.html' },
    { id: 'download-form', path: '/components/download-form.html' },
    { id: 'active-downloads', path: '/components/active-downloads.html' },
    { id: 'completed-downloads', path: '/components/completed-downloads.html' },
    { id: 'video-modal', path: '/components/video-modal.html' }
  ];

  for (const component of components) {
    try {
      const response = await fetch(component.path);
      const html = await response.text();
      document.getElementById(component.id).innerHTML = html;
    } catch (error) {
      console.error(`Error loading component ${component.id}:`, error);
    }
  }

  // Initialize event listeners after components are loaded
  initializeEventListeners();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Load components
  loadComponents();
  
  // Load completed downloads
  loadCompletedDownloads();
}); 