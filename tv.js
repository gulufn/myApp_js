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
function setFileCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    
    
}

app.get("/video/:path", (req, res) => {
    const form = req.query.form ?? null;
    const filename = req.params.path ?? null;
    const key = req.query.key ?? null;
    const file_source = req.query.file_source ?? null;
    console.log(form, filename, key, file_source);

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
    const isImage = /^[\w.-]+\.(jpg|png|jpeg|webp|gif|bmp|svg)$/.test(file_source);
    const isVideo = /^[\w.-]+\.(mp4|m4v|webm|mkv|avi|mov|flv|wmv|ts|mpg|mpeg|3gp|ogv)$/.test(file_source);
    //判断url中最基础了两个参数是否存在
    if (!notEmpty(form) || !notEmpty(filename)) {
        res.status(401).json({ status: false, msg: "form缺失" });
        return;
    }
    //////////////////////////////////////////////////////开启3个分支
    //没有file_source时，返回该目录中子文件夹中的data.json
    if (!notEmpty(file_source)) {
        setFileCorsHeaders(res);  //解决跨域问题

        const filePath = path.join(VIDEO_DIR, form, filename, 'data.json');
        // 安全检查：防止 ../ 路径穿越
        const resolved = path.resolve(filePath);
        //判断拿到的文件的路径是否在VIDEO_DIR里，如果不是，就是越权了
        if (!resolved.startsWith(path.resolve(VIDEO_DIR) + path.sep)) {
            return res.status(403).json({ status: false, msg: "越权" });
        }
        try {
            const raw = fs.readFileSync(resolved, 'utf8');
            const data = JSON.parse(raw);
            res.status(200).json({ status: true, msg: '成功', data: data });
        } catch (e) {
            // e.code === 'ENOENT' → 文件不存在
            // 其他 → 读取失败或 JSON 解析失败
            if (e.code === 'ENOENT') {
                res.status(404).json({ status: false, msg: 'data.json 不存在' });
            } else {
                res.status(500).json({ status: false, msg: 'data.json 读取或解析失败' });
            }
        }
        return;
    }
    //file_source既不是图片也不是视频时
    if (!isImage && !isVideo) {
        res.status(401).json({ status: false, msg: "file_source格式非法" });
        return;
    }
    //是图片时
    if (isImage) {
        const filePath = path.join(VIDEO_DIR, form, filename, file_source);
        // 安全检查：防止 ../ 路径穿越
        const resolved = path.resolve(filePath);
        //判断拿到的文件的路径是否在VIDEO_DIR里，如果不是，就是越权了
        if (!resolved.startsWith(path.resolve(VIDEO_DIR) + path.sep)) {
            res.status(403).json({ status: false, msg: "越权" });
            return;
        }

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
    if (isVideo) {
        setFileCorsHeaders(res);   //解决跨域问题

        const filePath = path.join(VIDEO_DIR, form, filename, file_source);
        // 安全检查：防止 ../ 路径穿越
        const resolved = path.resolve(filePath);
        //判断拿到的文件的路径是否在VIDEO_DIR里，如果不是，就是越权了
        if (!resolved.startsWith(path.resolve(VIDEO_DIR) + path.sep)) {
            res.status(403).json({ status: false, msg: "越权" });
            return;
        }

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
            console.log(range)

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

})
app.listen(3001, "0.0.0.0", () => {
    console.log("video服务已启动: http://127.0.0.1:3001");
});