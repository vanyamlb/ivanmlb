// Apsny Camera Recorder - Main Application
class ApsnyCameraRecorder {
    constructor() {
        this.videoPlayer = document.getElementById('videoPlayer');
        this.hls = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordings = [];
        this.isRecording = false;
        this.recordingStartTime = null;
        this.recordingTimer = null;
        this.currentStreamUrl = null;
        this.currentToken = null;
        this.tokenExpiryTime = null;
        this.tokenRefreshTimer = null;
        this.tokenRefreshCount = 0;
        this.connectionStatus = 'disconnected';

        // API configuration for apsny.camera
        this.apiBaseUrl = 'https://clients.apsny.camera';
        this.corsProxy = ''; // Can be set to a CORS proxy if needed

        this.initializeUI();
        this.setupEventListeners();
        this.log('Приложение запущено', 'info');
    }

    initializeUI() {
        // Initialize UI elements
        this.updateConnectionStatus('disconnected');
        this.updateTokenInfo();
    }

    setupEventListeners() {
        // Load stream button
        document.getElementById('loadStreamBtn').addEventListener('click', () => {
            this.loadStream();
        });

        // Manual refresh button
        document.getElementById('manualRefreshBtn').addEventListener('click', () => {
            this.refreshToken(true);
        });

        // Record button
        document.getElementById('recordBtn').addEventListener('click', () => {
            this.startRecording();
        });

        // Stop button
        document.getElementById('stopBtn').addEventListener('click', () => {
            this.stopRecording();
        });

        // Clear all recordings
        document.getElementById('clearAllBtn').addEventListener('click', () => {
            this.clearAllRecordings();
        });

        // Clear logs
        document.getElementById('clearLogsBtn').addEventListener('click', () => {
            this.clearLogs();
        });

        // Copy buttons
        document.getElementById('copyUrlBtn').addEventListener('click', () => {
            this.copyToClipboard(document.getElementById('streamUrl').value, 'URL скопирован');
        });

        document.getElementById('copyTokenBtn').addEventListener('click', () => {
            this.copyToClipboard(document.getElementById('currentToken').value, 'Токен скопирован');
        });

        // Video player events
        this.videoPlayer.addEventListener('playing', () => {
            this.hideStatusOverlay();
            this.log('Видео воспроизводится', 'success');
            document.getElementById('recordBtn').disabled = false;
        });

        this.videoPlayer.addEventListener('error', (e) => {
            this.log('Ошибка воспроизведения видео', 'error');
            this.updateConnectionStatus('error');
        });
    }

    async loadStream() {
        const cameraId = document.getElementById('cameraId').value.trim();

        if (!cameraId) {
            this.log('Введите ID камеры', 'warning');
            return;
        }

        this.log(`Загрузка потока для камеры: ${cameraId}`, 'info');
        this.showStatusOverlay('Загрузка потока...');
        this.updateConnectionStatus('connecting');

        try {
            // Attempt to fetch stream info from apsny.camera API
            const streamInfo = await this.fetchStreamInfo(cameraId);

            if (streamInfo.url) {
                await this.initializeVideoStream(streamInfo.url, streamInfo.token);
                this.currentToken = streamInfo.token;
                this.tokenExpiryTime = streamInfo.expiryTime || Date.now() + (30 * 60 * 1000); // Default 30 minutes

                document.getElementById('streamUrl').value = streamInfo.url;
                document.getElementById('currentToken').value = streamInfo.token || 'N/A';

                this.updateConnectionStatus('connected');
                this.startTokenMonitoring();
                this.log('Поток успешно загружен', 'success');

                document.getElementById('manualRefreshBtn').disabled = false;
            } else {
                throw new Error('Не удалось получить URL потока');
            }
        } catch (error) {
            this.log(`Ошибка загрузки потока: ${error.message}`, 'error');
            this.updateConnectionStatus('error');
            this.showStatusOverlay(`Ошибка: ${error.message}`);

            // Show fallback instructions
            this.showManualUrlInput();
        }
    }

    async fetchStreamInfo(cameraId) {
        // Method 1: Try to fetch from API directly
        try {
            const apiUrl = `${this.corsProxy}${this.apiBaseUrl}/api/streams/${cameraId}`;
            const response = await fetch(apiUrl);

            if (response.ok) {
                const data = await response.json();
                return {
                    url: data.url || data.streamUrl || data.hls,
                    token: data.token || data.auth,
                    expiryTime: data.expiryTime || data.expires_at
                };
            }
        } catch (e) {
            this.log('Прямой API запрос не удался, пробую альтернативный метод', 'warning');
        }

        // Method 2: Construct URL based on known patterns
        // This is a fallback method - you may need to adjust based on actual API
        try {
            const possibleUrls = [
                `https://stream.apsny.camera/hls/${cameraId}/index.m3u8`,
                `https://clients.apsny.camera/streams/${cameraId}/playlist.m3u8`,
                `https://cdn.apsny.camera/live/${cameraId}/index.m3u8`
            ];

            for (const url of possibleUrls) {
                try {
                    const response = await fetch(url, { method: 'HEAD' });
                    if (response.ok) {
                        // Extract token from URL if present
                        const urlObj = new URL(url);
                        const token = urlObj.searchParams.get('token') ||
                                    urlObj.searchParams.get('auth') ||
                                    this.extractTokenFromUrl(url);

                        return {
                            url: url,
                            token: token,
                            expiryTime: Date.now() + (30 * 60 * 1000)
                        };
                    }
                } catch (e) {
                    continue;
                }
            }
        } catch (e) {
            this.log('Автоматическое определение URL не удалось', 'warning');
        }

        // Method 3: Use browser extension or manual input
        throw new Error('Не удалось автоматически получить поток. Используйте DevTools для получения URL вручную.');
    }

    extractTokenFromUrl(url) {
        // Try to extract token from various URL patterns
        const patterns = [
            /token=([^&]+)/,
            /auth=([^&]+)/,
            /key=([^&]+)/,
            /\/([a-zA-Z0-9_-]{20,})\//
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    async initializeVideoStream(url, token) {
        // Add token to URL if not already present
        let streamUrl = url;
        if (token && !url.includes('token=') && !url.includes('auth=')) {
            const separator = url.includes('?') ? '&' : '?';
            streamUrl = `${url}${separator}token=${token}`;
        }

        this.currentStreamUrl = streamUrl;

        // Check if HLS stream
        if (streamUrl.includes('.m3u8')) {
            if (Hls.isSupported()) {
                if (this.hls) {
                    this.hls.destroy();
                }

                this.hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 90
                });

                this.hls.loadSource(streamUrl);
                this.hls.attachMedia(this.videoPlayer);

                this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    this.videoPlayer.play().catch(e => {
                        this.log('Автовоспроизведение заблокировано. Нажмите play вручную.', 'warning');
                    });
                });

                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        this.log(`Критическая ошибка HLS: ${data.type}`, 'error');
                        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            this.log('Возможно, токен истёк. Пробую обновить...', 'warning');
                            this.refreshToken(false);
                        }
                    }
                });
            } else if (this.videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                this.videoPlayer.src = streamUrl;
                await this.videoPlayer.play();
            } else {
                throw new Error('HLS не поддерживается в этом браузере');
            }
        } else {
            // Direct video URL
            this.videoPlayer.src = streamUrl;
            await this.videoPlayer.play();
        }
    }

    startTokenMonitoring() {
        // Clear existing timer
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
        }

        // Update token info every second
        this.tokenRefreshTimer = setInterval(() => {
            this.updateTokenInfo();

            // Auto-refresh token if enabled and close to expiry
            const autoRefresh = document.getElementById('autoRefreshEnabled').checked;
            if (autoRefresh && this.tokenExpiryTime) {
                const timeLeft = this.tokenExpiryTime - Date.now();
                // Refresh 2 minutes before expiry
                if (timeLeft <= 2 * 60 * 1000 && timeLeft > 0) {
                    this.log('Токен скоро истечёт, автоматически обновляю...', 'info');
                    this.refreshToken(false);
                }
            }
        }, 1000);
    }

    updateTokenInfo() {
        if (this.tokenExpiryTime) {
            const timeLeft = this.tokenExpiryTime - Date.now();

            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                document.getElementById('tokenExpiry').textContent =
                    `${minutes}:${seconds.toString().padStart(2, '0')}`;
            } else {
                document.getElementById('tokenExpiry').textContent = 'Истёк';
                document.getElementById('tokenExpiry').style.color = 'var(--danger-color)';
            }
        } else {
            document.getElementById('tokenExpiry').textContent = '--:--';
        }

        document.getElementById('tokenRefreshCount').textContent = this.tokenRefreshCount;
    }

    async refreshToken(manual = false) {
        const cameraId = document.getElementById('cameraId').value.trim();

        this.log(manual ? 'Ручное обновление токена...' : 'Автоматическое обновление токена...', 'info');

        try {
            const streamInfo = await this.fetchStreamInfo(cameraId);

            if (streamInfo.url && this.hls) {
                this.currentToken = streamInfo.token;
                this.tokenExpiryTime = streamInfo.expiryTime || Date.now() + (30 * 60 * 1000);
                this.tokenRefreshCount++;

                // Reload stream with new token
                let newUrl = streamInfo.url;
                if (streamInfo.token && !newUrl.includes('token=')) {
                    const separator = newUrl.includes('?') ? '&' : '?';
                    newUrl = `${newUrl}${separator}token=${streamInfo.token}`;
                }

                this.currentStreamUrl = newUrl;
                this.hls.loadSource(newUrl);

                document.getElementById('streamUrl').value = newUrl;
                document.getElementById('currentToken').value = streamInfo.token || 'N/A';

                this.log('Токен успешно обновлён', 'success');
            }
        } catch (error) {
            this.log(`Ошибка обновления токена: ${error.message}`, 'error');
        }
    }

    startRecording() {
        if (!this.videoPlayer.srcObject && !this.currentStreamUrl) {
            this.log('Сначала загрузите поток', 'warning');
            return;
        }

        try {
            // Capture video element as stream
            const stream = this.videoPlayer.captureStream ?
                          this.videoPlayer.captureStream() :
                          this.videoPlayer.mozCaptureStream();

            if (!stream) {
                throw new Error('Не удалось захватить поток видео');
            }

            // Get quality settings
            const quality = document.getElementById('videoQuality').value;
            const videoBitsPerSecond = {
                'high': 2500000,
                'medium': 1500000,
                'low': 800000
            }[quality];

            // Setup MediaRecorder
            const options = {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: videoBitsPerSecond
            };

            // Fallback to vp8 if vp9 not supported
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm;codecs=vp8';
                this.log('VP9 не поддерживается, используется VP8', 'warning');
            }

            this.mediaRecorder = new MediaRecorder(stream, options);
            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                    this.updateRecordingSize();
                }
            };

            this.mediaRecorder.onstop = () => {
                this.saveRecording();
            };

            this.mediaRecorder.onerror = (event) => {
                this.log(`Ошибка записи: ${event.error}`, 'error');
                this.stopRecording();
            };

            // Start recording
            this.mediaRecorder.start(1000); // Collect data every second
            this.isRecording = true;
            this.recordingStartTime = Date.now();

            // Update UI
            document.getElementById('recordBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('recordingStatus').classList.add('recording');
            this.startRecordingTimer();

            this.log('Запись началась', 'success');
        } catch (error) {
            this.log(`Ошибка начала записи: ${error.message}`, 'error');
        }
    }

    stopRecording() {
        if (!this.mediaRecorder || !this.isRecording) {
            return;
        }

        this.mediaRecorder.stop();
        this.isRecording = false;

        // Update UI
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('recordingStatus').classList.remove('recording');
        this.stopRecordingTimer();

        this.log('Запись остановлена', 'info');
    }

    startRecordingTimer() {
        this.stopRecordingTimer();

        this.recordingTimer = setInterval(() => {
            if (this.recordingStartTime) {
                const elapsed = Date.now() - this.recordingStartTime;
                const hours = Math.floor(elapsed / 3600000);
                const minutes = Math.floor((elapsed % 3600000) / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);

                document.getElementById('recordingTime').textContent =
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 100);
    }

    stopRecordingTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        document.getElementById('recordingTime').textContent = '00:00:00';
        document.getElementById('recordingSize').textContent = '0 MB';
    }

    updateRecordingSize() {
        const totalSize = this.recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0);
        const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
        document.getElementById('recordingSize').textContent = `${sizeMB} MB`;
    }

    saveRecording() {
        if (this.recordedChunks.length === 0) {
            this.log('Нет данных для сохранения', 'warning');
            return;
        }

        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const duration = Date.now() - this.recordingStartTime;
        const size = (blob.size / 1024 / 1024).toFixed(2);

        const recording = {
            id: Date.now(),
            name: `Запись ${new Date().toLocaleString('ru-RU')}`,
            blob: blob,
            size: size,
            duration: this.formatDuration(duration),
            timestamp: new Date().toISOString(),
            cameraId: document.getElementById('cameraId').value
        };

        this.recordings.push(recording);
        this.renderRecordings();
        this.log(`Запись сохранена: ${recording.name} (${size} MB)`, 'success');
    }

    renderRecordings() {
        const container = document.getElementById('recordingsList');

        if (this.recordings.length === 0) {
            container.innerHTML = '<p class="empty-state">Нет записей. Начните запись!</p>';
            return;
        }

        container.innerHTML = this.recordings.map(recording => `
            <div class="recording-item" data-id="${recording.id}">
                <div class="recording-item-header">
                    <span class="recording-name">${recording.name}</span>
                </div>
                <div class="recording-meta">
                    <span>📹 ${recording.cameraId}</span>
                    <span>⏱ ${recording.duration}</span>
                    <span>💾 ${recording.size} MB</span>
                </div>
                <div class="recording-actions">
                    <button class="btn btn-small btn-download" onclick="recorder.downloadRecording(${recording.id})">
                        ⬇ Скачать
                    </button>
                    <button class="btn btn-small btn-danger" onclick="recorder.deleteRecording(${recording.id})">
                        🗑 Удалить
                    </button>
                </div>
            </div>
        `).join('');
    }

    downloadRecording(id) {
        const recording = this.recordings.find(r => r.id === id);
        if (!recording) return;

        const url = URL.createObjectURL(recording.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${recording.cameraId}_${recording.timestamp}.webm`;
        a.click();
        URL.revokeObjectURL(url);

        this.log(`Скачивание: ${recording.name}`, 'info');
    }

    deleteRecording(id) {
        this.recordings = this.recordings.filter(r => r.id !== id);
        this.renderRecordings();
        this.log('Запись удалена', 'info');
    }

    clearAllRecordings() {
        if (this.recordings.length === 0) return;

        if (confirm('Удалить все записи?')) {
            this.recordings = [];
            this.renderRecordings();
            this.log('Все записи удалены', 'info');
        }
    }

    formatDuration(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    updateConnectionStatus(status) {
        this.connectionStatus = status;
        const statusElement = document.getElementById('connectionStatus');

        const statusMap = {
            'connected': { text: 'Подключено', class: 'status-connected' },
            'disconnected': { text: 'Отключено', class: 'status-disconnected' },
            'connecting': { text: 'Подключение...', class: 'status-disconnected' },
            'error': { text: 'Ошибка', class: 'status-error' }
        };

        const statusInfo = statusMap[status] || statusMap.disconnected;
        statusElement.textContent = statusInfo.text;
        statusElement.className = `value ${statusInfo.class}`;
    }

    showStatusOverlay(message) {
        const overlay = document.getElementById('statusOverlay');
        overlay.querySelector('.status-message').textContent = message;
        overlay.classList.remove('hidden');
    }

    hideStatusOverlay() {
        document.getElementById('statusOverlay').classList.add('hidden');
    }

    showManualUrlInput() {
        const message = `
            <div style="max-width: 500px;">
                <h3>Как получить URL вручную:</h3>
                <ol style="text-align: left; margin: 15px 0;">
                    <li>Откройте <a href="https://clients.apsny.camera/" target="_blank" style="color: #3b82f6;">clients.apsny.camera</a></li>
                    <li>Откройте DevTools (F12) → вкладка Network</li>
                    <li>Отфильтруйте по "m3u8"</li>
                    <li>Выберите камеру для просмотра</li>
                    <li>Скопируйте URL .m3u8 файла из Network</li>
                    <li>Вставьте в поле "Stream URL" выше</li>
                </ol>
                <p style="margin-top: 15px; color: #64748b;">После получения URL, используйте кнопку "Загрузить поток"</p>
            </div>
        `;

        this.showStatusOverlay('');
        document.querySelector('.status-message').innerHTML = message;
    }

    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        const container = document.getElementById('logsContainer');

        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="log-timestamp">[${timestamp}]</span>
            <span class="log-level-${level}">${message}</span>
        `;

        container.insertBefore(logEntry, container.firstChild);

        // Keep only last 100 logs
        while (container.children.length > 100) {
            container.removeChild(container.lastChild);
        }

        // Also log to console
        console.log(`[${level.toUpperCase()}] ${message}`);
    }

    clearLogs() {
        document.getElementById('logsContainer').innerHTML = '';
        this.log('Журнал очищен', 'info');
    }

    copyToClipboard(text, successMessage) {
        if (!text) {
            this.log('Нечего копировать', 'warning');
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            this.log(successMessage, 'success');
        }).catch(err => {
            this.log('Ошибка копирования', 'error');
        });
    }

    destroy() {
        if (this.hls) {
            this.hls.destroy();
        }
        if (this.mediaRecorder && this.isRecording) {
            this.stopRecording();
        }
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
        }
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
        }
    }
}

// Initialize the application
let recorder;

window.addEventListener('DOMContentLoaded', () => {
    recorder = new ApsnyCameraRecorder();
});

window.addEventListener('beforeunload', () => {
    if (recorder) {
        recorder.destroy();
    }
});
