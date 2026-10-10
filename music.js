//music.js,音乐接口

const express = require("express"); //导入express模块
const fs = require("fs"); //导入fs模块
const path = require("path"); //导入path模块

const Crypto = require("./crypto"); //导入解密模块，这是自己写的
const app = express(); //创建app
const FILE_DIR = "/var/www/html/assets/music";
// 根据扩展名返回正确的 Content-Type
const MIME_TYPES = {
	// ===== 音频 =====
	".mp3": "audio/mpeg",
	".m4a": "audio/mp4",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
	".flac": "audio/flac",
	".aac": "audio/aac",
};

//get请求入口，后端处理get请求,url=http://127.0.0.1:3000/music/tv01.mp3?key=m2fTBT-pWgwyRJqRcGpjSIefYLxU-gLDqOcxo2rKemQ
app.get("/music/:filename", (req, res) => {
	const filename = req.params.filename; //tv01.mp3    url中第一个问号开始，前面（端口号后面）所有的全部进params里，filename=music后面第一个反斜杠的param,
	const key = req.query.key; //m2fTBT-pWgwyRJqRcGpjSIefYLxU-gLDqOcxo2rKemQ    url中第一个问号开始，后面所有的全部进query里，key是从query里取字段
	const filePath = path.join(FILE_DIR, filename); ///var/www/html/assets/music/tv01.mp3    合并多余斜杠：a//b → a/b;消解 .. 和 .：a/../b → b;使用反斜杠拼接
	const plain = Crypto.decrypt(key); //17452555    解密key,解密失败返回null

	// 文件类型检查：只允许访问指定的文件类型
	if (
		!/^[\w.-]+\.(mp3|m4a|wav|ogg|flac|aac)$/.test(
			filename,
		)
	) {
		return res.status(401).json({ status: false, msg: "文件类类型不符合要求" });
	}
	if (plain === null) {
		return res.status(401).json({ status: false, msg: "缺少 key" });
	}
	//把key转换成数字，我约定的key就是时间戳，所以转数字
	const issuedAt = Number(plain);
	//如果不是数字，key就是无效的
	if (!(Number.isInteger(issuedAt) && issuedAt >= 0)) {
		return res.status(401).json({ status: false, msg: "key无效" });
	}
	//获取当前时间戳
	const now_date = Date.now();
	if (now_date / 1000 - plain > 3600) {
		return res.status(401).json({ status: false, msg: "key过期" });
	}

	// 安全检查：防止 ../ 路径穿越
	const resolved = path.resolve(filePath);
	//判断拿到的文件的路径是否在FILE_DIR里，如果不是，就是越权了
	if (!resolved.startsWith(path.resolve(FILE_DIR) + path.sep)) {
		return res.status(403).json({ status: false, msg: "越权" });
	}
	//通过路径获取该文件的信息
	fs.stat(resolved, (err, stat) => {
		//判断该文件是否存在，如果不存在，返回404，过滤长得像文件的文件夹
		if (err || !stat.isFile()) {
			return res.status(404).json({ status: false, msg: "没找到" });
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
			return fs.createReadStream(resolved).pipe(res);
		}
		// 不是字符串 → 直接返回（当没带 Range 处理）
		if (typeof range !== "string" || range === "") {
			res
				.status(200)
				.setHeader("Content-Length", fileSize)
				.setHeader("Content-Type", contentType)
				.setHeader("Accept-Ranges", "bytes")
			return fs.createReadStream(resolved).pipe(res);
		}
		// range格式校验（正则整体匹配）,没有匹配到就返回null
		const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
		if (m === null) {
			return res
				.status(416)
				.setHeader("Content-Range", `bytes */${fileSize}`)
				.json({ status: false, msg: "请求范围格式无效" });
		}

		// 解析range
		let start = m[1] === "" ? null : parseInt(m[1], 10);
		let end = m[2] === "" ? null : parseInt(m[2], 10);

		if (start === null && end === null) {
			return res
				.status(416)
				.setHeader("Content-Range", `bytes */${fileSize}`)
				.json({ status: false, msg: "请求范围格式无效" });
		}
		///////////////////////////////////////////
		if (start === null && end !== null) {
			if (end >= fileSize) {
				return res
					.status(416)
					.setHeader("Content-Range", `bytes */${fileSize}`)
					.json({ status: false, msg: "请求范围格式无效" });
			} else {
				start = fileSize - 1 - end;
				end = fileSize - 1;
			}
		}
		//////////////////////////////////////////////////
		if (start !== null && end === null) {
			if (start >= fileSize) {
				return res
					.status(416)
					.setHeader("Content-Range", `bytes */${fileSize}`)
					.json({ status: false, msg: "请求范围格式无效" });
			} else {
				end = fileSize - 1;
			}
		}
		//////////////////////////////////////////////////
		if (start >= fileSize || end >= fileSize || start >= end) {
			return res
				.status(416)
				.setHeader("Content-Range", `bytes */${fileSize}`)
				.json({ status: false, msg: "请求范围格式无效" });
		}
		res
			.status(206)
			.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`)
			.setHeader("Accept-Ranges", "bytes")
			.setHeader("Content-Length", end - start + 1)
			.setHeader("Content-Type", contentType);
		fs.createReadStream(resolved, { start, end }).pipe(res);
	});
});

app.listen(3000, "0.0.0.0", () => {
	console.log("music服务已启动: http://127.0.0.1:3000");
});
