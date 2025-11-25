const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Konfigurasi yang sama dengan bot
const yt = {
    url: Object.freeze({
        audio128: 'https://api.apiapi.lat',
        video: 'https://api5.apiapi.lat',
        else: 'https://api3.apiapi.lat',
        referrer: 'https://ogmp3.pro/'
    }),
    encUrl: s => s.split('').map(c => c.charCodeAt()).reverse().join(';'),
    xor: s => s.split('').map(v => String.fromCharCode(v.charCodeAt() ^ 1)).join(''),
    genRandomHex: () => Array.from({ length: 32 }, _ => "0123456789abcdef"[Math.floor(Math.random()*16)]).join(""),
    init: async function (rpObj) {
        const { apiOrigin, payload } = rpObj
        const api = apiOrigin + "/" + this.genRandomHex() + "/init/" + this.encUrl(this.xor(payload.data)) + "/" + this.genRandomHex() + "/"
        const r = await fetch(api, { method: "post", body: JSON.stringify(payload) })
        if (!r.ok) throw Error(await r.text())
        return r.json()
    },
    genFileUrl: function (i, pk, rpObj) {
        const { apiOrigin } = rpObj
        const pkValue = pk ? pk + "/" : ""
        const downloadUrl = apiOrigin + "/" + this.genRandomHex() + "/download/" + i + "/" + this.genRandomHex() + "/" + pkValue
        return { downloadUrl }
    },
    statusCheck: async function (i, pk, rpObj) {
        const { apiOrigin } = rpObj
        let json
        let count = 0
        do {
            await new Promise(r => setTimeout(r, 5000))
            count++
            const pkVal = pk ? pk + "/" : ""
            const api = apiOrigin + "/" + this.genRandomHex() + "/status/" + i + "/" + this.genRandomHex() + "/" + pkVal
            const r = await fetch(api, {
                method: "post",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: i })
            })
            if (!r.ok) throw Error(await r.text())
            json = await r.json()
            if (count >= 100) throw Error("pooling mencapai 100, dihentikan")
        } while (json.s === "P")
        if (json.s === "E") throw Error(JSON.stringify(json))
        return this.genFileUrl(i, pk, rpObj)
    },
    resolvePayload: function (ytUrl, userFormat) {
        const valid = ["64k","96k","128k","192k","256k","320k","240p","360p","480p","720p","1080p"]
        if (!valid.includes(userFormat)) throw Error(`format salah. tersedia: ${valid.join(", ")}`)
        let apiOrigin = this.url.audio128
        let data = this.xor(ytUrl)
        let referer = this.url.referrer
        let format = "0"
        let mp3Quality = "128"
        let mp4Quality = "720"
        if (/^\d+p$/.test(userFormat)) {
            apiOrigin = this.url.video
            format = "1"
            mp4Quality = userFormat.replace("p","")
        } else if (userFormat !== "128k") {
            apiOrigin = this.url.else
            mp3Quality = userFormat.replace("k","")
        }
        return {
            apiOrigin,
            payload: {
                data,
                format,
                referer,
                mp3Quality,
                mp4Quality,
                userTimeZone: "-480"
            }
        }
    },
    download: async function (url, fmt = "128k") {
        const rpObj = this.resolvePayload(url, fmt)
        const initObj = await this.init(rpObj)
        const { i, pk, s } = initObj
        if (s === "C") return this.genFileUrl(i, pk, rpObj)
        return this.statusCheck(i, pk, rpObj)
    }
};

// Helper function untuk mendapatkan ukuran file
async function getFileSize(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const contentLength = response.headers.get('content-length');
        return contentLength ? parseInt(contentLength) : 0;
    } catch (error) {
        console.error('Error getting file size:', error);
        return 0;
    }
}

// Endpoint untuk mencari lagu
app.get('/api/search', async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'Query parameter diperlukan'
            });
        }

        const search = await yts(query);
        if (!search || search.videos.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Lagu tidak ditemukan'
            });
        }

        const results = search.videos.slice(0, 10).map(video => ({
            videoId: video.videoId,
            title: video.title,
            author: video.author.name,
            duration: video.duration.toString(),
            timestamp: video.timestamp,
            views: video.views,
            thumbnail: video.thumbnail,
            url: video.url,
            ago: video.ago
        }));

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint untuk download audio
app.post('/api/download', async (req, res) => {
    try {
        const { url, format = "64k" } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL YouTube diperlukan'
            });
        }

        // Validasi format
        const validFormats = ["64k","96k","128k","192k","256k","320k"];
        if (!validFormats.includes(format)) {
            return res.status(400).json({
                success: false,
                error: `Format tidak valid. Format yang tersedia: ${validFormats.join(", ")}`
            });
        }

        // Cari info video terlebih dahulu
        const search = await yts(url);
        if (!search || search.videos.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Video tidak ditemukan'
            });
        }

        const video = search.videos[0];
        
        // Download audio
        const dl = await yt.download(video.url, format);
        const fileSize = await getFileSize(dl.downloadUrl);
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

        res.json({
            success: true,
            data: {
                videoInfo: {
                    title: video.title,
                    author: video.author.name,
                    duration: video.duration.toString(),
                    views: video.views,
                    thumbnail: video.thumbnail
                },
                download: {
                    url: dl.downloadUrl,
                    format: format,
                    size: fileSize,
                    sizeMB: fileSizeMB
                }
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint untuk search dan download langsung
app.post('/api/play', async (req, res) => {
    try {
        const { query, format = "64k" } = req.body;
        
        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'Query pencarian diperlukan'
            });
        }

        // Search video
        const search = await yts(query);
        if (!search || search.videos.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Lagu tidak ditemukan'
            });
        }

        const video = search.videos[0];
        
        // Download audio
        const dl = await yt.download(video.url, format);
        const fileSize = await getFileSize(dl.downloadUrl);
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

        res.json({
            success: true,
            data: {
                videoInfo: {
                    videoId: video.videoId,
                    title: video.title,
                    author: video.author.name,
                    duration: video.duration.toString(),
                    timestamp: video.timestamp,
                    views: video.views,
                    thumbnail: video.thumbnail,
                    url: video.url,
                    ago: video.ago
                },
                download: {
                    url: dl.downloadUrl,
                    format: format,
                    size: fileSize,
                    sizeMB: fileSizeMB
                }
            }
        });

    } catch (error) {
        console.error('Play error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint untuk mendapatkan info video
app.get('/api/video/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        
        const search = await yts({ videoId });
        if (!search || search.videos.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Video tidak ditemukan'
            });
        }

        const video = search.videos[0];

        res.json({
            success: true,
            data: {
                videoId: video.videoId,
                title: video.title,
                author: video.author.name,
                duration: video.duration.toString(),
                timestamp: video.timestamp,
                views: video.views,
                thumbnail: video.thumbnail,
                url: video.url,
                ago: video.ago
            }
        });

    } catch (error) {
        console.error('Video info error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API Server is running',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`API Server berjalan di port ${PORT}`);
});

module.exports = app;
