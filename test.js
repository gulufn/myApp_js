function yanz(name) {
    if (!/^[\w.-]+\.(mp4|m4v|webm)$/.test(name)) {
        console.log('拦住了')
        return true
    }
    console.log('没拦')
    return false
}

function check_range(range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    return m;
}

// let n='../1df.mp4'
// yanz(n)
range='bytes=12--2047'
let a=check_range(range)
console.log(a)


const Crypto = require('./crypto');

const token = 'ofkgKBCknZ7ak43w50JqA9iNC2XCkbBxKNclsH-0r7Y';
const plain = Crypto.decrypt(token);

if (plain === null) {
  console.log('解密失败');
} else {
  console.log('明文:', plain);
}
