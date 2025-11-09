const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Cache for browser instance
let browser = null;

// Initialize browser
async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
    }
    return browser;
}

// Extract camera ID from URL
function extractCameraId(url) {
    try {
        const urlObj = new URL(url);
        // Get query parameter (e.g., ?sukhum_chegem)
        const queryString = urlObj.search.substring(1);
        if (queryString) {
            return queryString.split('&')[0].split('=')[0];
        }
        return null;
    } catch (e) {
        return url; // If not a URL, treat as camera ID
    }
}

// Main endpoint to get stream info
app.post('/api/get-stream', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`[INFO] Fetching stream for: ${url}`);

    try {
        const cameraId = extractCameraId(url);
        console.log(`[INFO] Camera ID: ${cameraId}`);

        // Try different methods to get stream
        let streamInfo = null;

        // Method 1: Try direct API endpoints
        streamInfo = await tryDirectAPI(cameraId);

        if (!streamInfo) {
            // Method 2: Use Puppeteer to intercept network requests
            streamInfo = await tryPuppeteerMethod(url, cameraId);
        }

        if (!streamInfo) {
            // Method 3: Try common URL patterns
            streamInfo = await tryCommonPatterns(cameraId);
        }

        if (streamInfo) {
            console.log(`[SUCCESS] Stream found: ${streamInfo.url.substring(0, 50)}...`);
            return res.json(streamInfo);
        } else {
            throw new Error('Could not find stream URL');
        }

    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        return res.status(500).json({
            error: error.message,
            details: 'Failed to extract stream information'
        });
    }
});

// Method 1: Try known API endpoints
async function tryDirectAPI(cameraId) {
    const apiEndpoints = [
        `https://clients.apsny.camera/api/streams/${cameraId}`,
        `https://clients.apsny.camera/api/camera/${cameraId}`,
        `https://api.apsny.camera/streams/${cameraId}`,
        `https://stream.apsny.camera/api/${cameraId}`
    ];

    for (const endpoint of apiEndpoints) {
        try {
            console.log(`[INFO] Trying API: ${endpoint}`);
            const response = await axios.get(endpoint, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });

            if (response.data && (response.data.url || response.data.streamUrl || response.data.hls)) {
                return {
                    url: response.data.url || response.data.streamUrl || response.data.hls,
                    token: response.data.token || response.data.auth || null,
                    expiryTime: response.data.expiryTime || response.data.expires_at || Date.now() + (30 * 60 * 1000),
                    method: 'direct-api'
                };
            }
        } catch (e) {
            // Continue to next endpoint
        }
    }

    return null;
}

// Method 2: Use Puppeteer to load page and intercept network requests
async function tryPuppeteerMethod(url, cameraId) {
    let page = null;

    try {
        console.log('[INFO] Using Puppeteer to intercept network requests...');
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        const streamData = {
            url: null,
            token: null,
            expiryTime: null
        };

        // Intercept network requests
        await page.setRequestInterception(true);

        page.on('request', request => {
            request.continue();
        });

        page.on('response', async response => {
            const responseUrl = response.url();

            // Look for m3u8 files (HLS streams)
            if (responseUrl.includes('.m3u8')) {
                console.log(`[SUCCESS] Found m3u8: ${responseUrl}`);
                streamData.url = responseUrl;

                // Extract token from URL
                const urlObj = new URL(responseUrl);
                streamData.token = urlObj.searchParams.get('token') ||
                                  urlObj.searchParams.get('auth') ||
                                  urlObj.searchParams.get('key');

                // Estimate expiry time (default 30 minutes)
                streamData.expiryTime = Date.now() + (30 * 60 * 1000);
            }

            // Look for API responses with stream data
            if (responseUrl.includes('/api/') || responseUrl.includes('/stream')) {
                try {
                    const contentType = response.headers()['content-type'];
                    if (contentType && contentType.includes('application/json')) {
                        const data = await response.json();
                        if (data.url || data.streamUrl || data.hls) {
                            console.log('[SUCCESS] Found stream in API response');
                            streamData.url = data.url || data.streamUrl || data.hls;
                            streamData.token = data.token || data.auth;
                            streamData.expiryTime = data.expiryTime || data.expires_at || Date.now() + (30 * 60 * 1000);
                        }
                    }
                } catch (e) {
                    // Not JSON or failed to parse
                }
            }
        });

        // Navigate to the page
        const targetUrl = url.startsWith('http') ? url : `https://clients.apsny.camera/?${cameraId}`;
        await page.goto(targetUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait a bit for any delayed requests
        await page.waitForTimeout(3000);

        // Close the page
        await page.close();

        if (streamData.url) {
            return {
                ...streamData,
                method: 'puppeteer'
            };
        }

    } catch (error) {
        console.error(`[ERROR] Puppeteer method failed: ${error.message}`);
        if (page) await page.close();
    }

    return null;
}

// Method 3: Try common URL patterns
async function tryCommonPatterns(cameraId) {
    const patterns = [
        `https://stream.apsny.camera/hls/${cameraId}/index.m3u8`,
        `https://stream.apsny.camera/live/${cameraId}/playlist.m3u8`,
        `https://cdn.apsny.camera/hls/${cameraId}/index.m3u8`,
        `https://clients.apsny.camera/streams/${cameraId}/index.m3u8`,
        `https://live.apsny.camera/${cameraId}/index.m3u8`
    ];

    for (const url of patterns) {
        try {
            console.log(`[INFO] Trying pattern: ${url}`);
            const response = await axios.head(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.status === 200) {
                console.log(`[SUCCESS] Pattern matched: ${url}`);
                return {
                    url: url,
                    token: null,
                    expiryTime: Date.now() + (30 * 60 * 1000),
                    method: 'pattern'
                };
            }
        } catch (e) {
            // Continue to next pattern
        }
    }

    return null;
}

// Proxy endpoint to refresh token
app.post('/api/refresh-token', async (req, res) => {
    const { cameraId, currentUrl } = req.body;

    try {
        console.log(`[INFO] Refreshing token for: ${cameraId}`);

        // Try to get fresh stream info
        const streamInfo = await tryDirectAPI(cameraId);

        if (!streamInfo) {
            // Fallback: try to load the page again
            const fallbackInfo = await tryPuppeteerMethod(
                `https://clients.apsny.camera/?${cameraId}`,
                cameraId
            );

            if (fallbackInfo) {
                return res.json(fallbackInfo);
            }
        }

        if (streamInfo) {
            return res.json(streamInfo);
        } else {
            throw new Error('Could not refresh token');
        }

    } catch (error) {
        console.error(`[ERROR] Token refresh failed: ${error.message}`);
        return res.status(500).json({
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('[INFO] Shutting down gracefully...');
    if (browser) {
        await browser.close();
    }
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   Apsny Camera Recorder - Backend Server            ║
║   Port: ${PORT}                                      ║
║   Status: Running                                    ║
╚══════════════════════════════════════════════════════╝

Endpoints:
  POST /api/get-stream       - Get stream URL and token
  POST /api/refresh-token    - Refresh expired token
  GET  /api/health          - Health check

Frontend: http://localhost:${PORT}
    `);
});

module.exports = app;
