const express = require("express"); //导入express模块
const fs = require("fs"); //导入fs模块
const path = require("path"); //导入path模块

const Crypto = require("./crypto"); //导入解密模块，这是自己写的
const app = express(); //创建app
const VIDEO_DIR = "/var/www/html/assets/video";
// 根据扩展名返回正确的 Content-Type
const MIME_TYPES = {
    // ===== 音频 =====
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",

    // ===== 视频 =====
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".flv": "video/x-flv",
    ".wmv": "video/x-ms-wmv",
    ".ts": "video/mp2t",
    ".mpg": "video/mpeg",
    ".mpeg": "video/mpeg",
    ".3gp": "video/3gpp",
    ".ogv": "video/ogg",

    // ===== 播放列表（特殊） =====
    ".m3u8": "application/vnd.apple.mpegurl",

    // ===== 图片（顺便加上） =====
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
};
//检查该目录下的子文件夹是否存在，返回文件信息
function safeReaddir(rootDir) {
    try {
        const stat = fs.statSync(rootDir);
        if (!stat.isDirectory()) {
            return { ok: false, reason: 'not a directory' };
        }
        const items = fs.readdirSync(rootDir, { withFileTypes: true });
        return { ok: true, items };
    } catch (err) {
        switch (err.code) {
            case 'ENOENT': return { ok: false, reason: 'not found' };
            case 'EACCES':
            case 'EPERM': return { ok: false, reason: 'permission denied' };
            case 'ELOOP': return { ok: false, reason: 'symlink loop' };
            default: return { ok: false, reason: err.message };
        }
    }
}

//get请求入口，后端处理get请求,url=http://127.0.0.1:3001/video/tv01.mp4?key=m2fTBT-pWgwyRJqRcGpjSIefYLxU-gLDqOcxo2rKemQ
app.get("/video/:path", (req, res) => {
    const form = req.query.form ?? null;
    const filename = req.params.path ?? null;
    const season = req.query.season ?? null;
    const key = req.query.key ?? null;
    const video = req.query.video ?? null;
    const img = req.query.img ?? null;
    console.log(form, filename, season, key, video, img);

    ///////////////////////////////////////////////////基础信息验证
    //验证key
    const plain = Crypto.decrypt(key); //17452555    解密key,解密失败返回null
    if (plain === null) {
        res.status(401).json({ status: false, msg: "缺少 key" });
        return;
    }
    //把key转换成数字，我约定的key就是时间戳，所以转数字
    const issuedAt = Number(plain);
    //如果不是数字，key就是无效的
    if (!(Number.isInteger(issuedAt) && issuedAt >= 0)) {
        res.status(401).json({ status: false, msg: "key无效" });
        return;
    }
    //获取当前时间戳
    const now_date = Date.now();
    if (now_date / 1000 - plain > 3600) {
        res.status(401).json({ status: false, msg: "key过期" });
        return;
    }
    ////////////////////////////////////////////////////////////
    //一个判断参数是否为null、空字符串、未定义。的方法
    const notEmpty = (v) => v !== undefined && v !== null && v !== '';
    //判断url中最基础了两个参数是否存在
    if (!notEmpty(form) || !notEmpty(filename)) {
        res.status(401).json({ status: false, msg: "form缺失" });
        return;
    }

    //////////////////////////////////////////////////////开启3个分支
    //没有season时，返回该目录中子文件夹中的data.json
    if (!notEmpty(season)) {
        const rootDir = path.join(VIDEO_DIR, form, filename);
        const path_jaon = [];
        const items = safeReaddir(rootDir);
        if (items.ok) {
            for (const item of items.items) {
                if (item.isDirectory()) {
                    const dataJsonPath = path.join(rootDir, item.name, 'data.json');
                    if (fs.existsSync(dataJsonPath)) {
                        path_jaon.push(dataJsonPath)
                    }
                }
            }
            const data_json = [];
            for (const i of path_jaon) {
                data_json.push(require(i));
            }
            res
                .status(200).json({ status: true, msg: '成功', data: data_json });
            return;
        }
        res
            .status(400)
            .json({ status: false, msg: items.reason });
        return;
    }


    ////////////////////////////////////////////////////////第二个分支
    //有season时，并且有video,进入video分支
    if (notEmpty(video)) {
        // 文件类型检查：只允许访问指定的文件类型
        if (!/^[\w.-]+\.(mp4|m4v|webm|mkv|avi|mov|flv|wmv|ts|mpg|mpeg|3gp|ogv)$/.test(video)) {
            res.status(401).json({ status: false, msg: "文件类类型不符合要求" });
            return;
        }
        const filePath = path.join(VIDEO_DIR, form, filename, season, video);
        console.log(filePath);
        // 安全检查：防止 ../ 路径穿越
        const resolved = path.resolve(filePath);
        //判断拿到的文件的路径是否在VIDEO_DIR里，如果不是，就是越权了
        if (!resolved.startsWith(path.resolve(VIDEO_DIR) + path.sep)) {
            res.status(403).json({ status: false, msg: "越权" });
            return;
        }
        console.log(resolved);
        //通过路径获取该文件的信息
        fs.stat(resolved, (err, stat) => {
            //判断该文件是否存在，如果不存在，返回404，过滤长得像文件的文件夹
            if (err || !stat.isFile()) {
                res.status(404).json({ status: false, msg: "没找到" });
                return;
            }
            const ext = path.extname(resolved).toLowerCase(); //取路径中文件的扩展名，转小写
            const contentType = MIME_TYPES[ext] || "application/octet-stream"; //未知类型设置为万能下载类型
            const fileSize = stat.size;
            const range = req.headers.range;

            //如果请求头里没有range，就直接返回整个文件
            if (!range) {
                res
                    .status(200)
                    .setHeader("Content-Length", fileSize)
                    .setHeader("Content-Type", contentType)
                    .setHeader("Accept-Ranges", "bytes")
                fs.createReadStream(resolved).pipe(res);
                return;
            }
            // 不是字符串 → 直接返回（当没带 Range 处理）
            if (typeof range !== "string" || range === "") {
                res
                    .status(200)
                    .setHeader("Content-Length", fileSize)
                    .setHeader("Content-Type", contentType)
                    .setHeader("Accept-Ranges", "bytes")
                fs.createReadStream(resolved).pipe(res);
                return;
            }
            // range格式校验（正则整体匹配）,没有匹配到就返回null
            const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
            if (m === null) {
                res
                    .status(416)
                    .setHeader("Content-Range", `bytes */${fileSize}`)
                    .json({ status: false, msg: "请求范围格式无效" });
                return;
            }

            // 解析range,parseInt(要解析的字符串,进制)作用是把字符串按指定进制解析为整数
            let start = m[1] === "" ? null : parseInt(m[1], 10);
            let end = m[2] === "" ? null : parseInt(m[2], 10);

            if (start === null && end === null) {
                res
                    .status(416)
                    .setHeader("Content-Range", `bytes */${fileSize}`)
                    .json({ status: false, msg: "请求范围格式无效" });
                return;
            }
            ///////////////////////////////////////////
            if (start === null && end !== null) {
                if (end >= fileSize) {
                    res
                        .status(416)
                        .setHeader("Content-Range", `bytes */${fileSize}`)
                        .json({ status: false, msg: "请求范围格式无效" });
                    return;
                } else {
                    start = fileSize - 1 - end;
                    end = start + Math.floor(fileSize / 100);
                }
                if (end >= fileSize) { end = fileSize - 1; }
            }
            //////////////////////////////////////////////////
            if (start !== null && end === null) {
                if (start >= fileSize) {
                    res
                        .status(416)
                        .setHeader("Content-Range", `bytes */${fileSize}`)
                        .json({ status: false, msg: "请求范围格式无效" });
                    return;
                } else {
                    end = start + Math.floor(fileSize / 100);
                }
                if (end >= fileSize) { end = fileSize - 1; }
            }
            //////////////////////////////////////////////////
            if (start >= fileSize || end >= fileSize || start >= end) {
                res
                    .status(416)
                    .setHeader("Content-Range", `bytes */${fileSize}`)
                    .json({ status: false, msg: "请求范围格式无效" });
                return;
            }
            res
                .status(206)
                .setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`)
                .setHeader("Accept-Ranges", "bytes")
                .setHeader("Content-Length", end - start + 1)
                .setHeader("Content-Type", contentType);
            fs.createReadStream(resolved, { start, end }).pipe(res);
            return;
        });
    }


    ///////////////////////////////////////////////////////第三个分支
    //返回图片
    if (notEmpty(img)) {
        // 文件类型检查：只允许访问指定的文件类型
        if (!/^[\w.-]+\.(jpg|png|jpeg|webp|gif|bmp|svg)$/.test(img)) {
            res.status(401).json({ status: false, msg: "文件类类型不符合要求" });
            return;
        }
        const filePath = path.join(VIDEO_DIR, form, filename, season, img);
        console.log(filePath);
        // 安全检查：防止 ../ 路径穿越
        const resolved = path.resolve(filePath);
        //判断拿到的文件的路径是否在VIDEO_DIR里，如果不是，就是越权了
        if (!resolved.startsWith(path.resolve(VIDEO_DIR) + path.sep)) {
            res.status(403).json({ status: false, msg: "越权" });
            return;
        }
        console.log(resolved);

        fs.stat(resolved, (err, stat) => {
            if (err || !stat.isFile()) {
                res.status(404).json({ status: false, msg: '图片不存在' });
                return;
            }
            const ext = path.extname(resolved).toLowerCase(); //取路径中文件的扩展名，转小写
            const contentType = MIME_TYPES[ext] || "application/octet-stream"; //未知类型设置为万能下载类型

            res.status(200)
                .setHeader("Content-Length", stat.size)
                .setHeader("Content-Type", contentType)
                .setHeader("Cache-Control", 'public, max-age=86400')
            // fs.createReadStream(resolved).pipe(res);
            // return;
            const stream = fs.createReadStream(resolved);
            stream.on('error', (e) => {                 // ← 保留，防异步失败/崩溃
                if (!res.headersSent) {
                    res.status(500).json({ status: false, msg: '读取失败' });
                } else {
                    res.destroy(e);
                }
            });
            stream.pipe(res);
            return;
        });
    }
})


app.listen(3001, "0.0.0.0", () => {
    console.log("video服务已启动: http://127.0.0.1:3001");
});

