/* ============================================================================
   拼好镜 · PNG 解码器（QA 共享库 · 纯 node / 零依赖）
   ----------------------------------------------------------------------------
   用途：验收套件对 CDP `Page.captureScreenshot` 产物（PNG）做**像素级**断言
        （v7.19 需求①「划选重影」的墨迹/蓝底像素统计即由此驱动）。
        此前解码逻辑散落在各临时探针里（用完即删）；v7.19 起抽成共享库并挂为
        闸门 [14] 的依赖，保证「重影已修」有**可证伪的逐像素证据**长期在闸。

   支持范围（headless Edge/Chrome 截图的实际输出形态，够用且不过度）：
     · bit depth 8；
     · color type 0（灰度）/ 2（RGB）/ 6（RGBA）；
     · 非隔行（interlace = 0）；
     · 多个 IDAT 块（Chromium 会切多块输出）。
   输出统一为 RGBA8（data 每像素 4 字节，行主序）。

   为什么自己解而不用第三方库：本仓 _qa 工装铁律「零依赖、只用 node 内建模块」
   （run-gate.mjs 同款约束）；node:zlib.inflateSync 足以解 PNG 的 zlib 流。
   ============================================================================ */
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 每「像素采样组」的字节数（按 color type） */
function channelsOf(colorType) {
  if (colorType === 0) return 1;   /* 灰度 */
  if (colorType === 2) return 3;   /* RGB */
  if (colorType === 6) return 4;   /* RGBA */
  throw new Error('png.mjs 不支持 color type ' + colorType + '（仅支持 0/2/6，bit depth 8）');
}

/** 读取一个 chunk：返回 { type, data, next }；CRC 不复算（截图来源可信，省 CPU） */
function readChunk(buf, at) {
  const len = buf.readUInt32BE(at);
  const type = buf.toString('ascii', at + 4, at + 8);
  const data = buf.subarray(at + 8, at + 8 + len);
  return { type, data, next: at + 12 + len };
}

/** 逆滤波（PNG filter 0..4）。bpp = 字节/像素。就地改写扫描线缓冲后再拼 raw。 */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    line.copy(cur);
    switch (filter) {
      case 0: /* None */ break;
      case 1: /* Sub */
        for (let x = bpp; x < stride; x++) cur[x] = (cur[x] + cur[x - bpp]) & 0xff;
        break;
      case 2: /* Up */
        for (let x = 0; x < stride; x++) cur[x] = (cur[x] + prev[x]) & 0xff;
        break;
      case 3: /* Average */
        for (let x = 0; x < stride; x++) {
          const left = x >= bpp ? cur[x - bpp] : 0;
          cur[x] = (cur[x] + ((left + prev[x]) >> 1)) & 0xff;
        }
        break;
      case 4: /* Paeth */
        for (let x = 0; x < stride; x++) {
          const a = x >= bpp ? cur[x - bpp] : 0;   /* left */
          const b = prev[x];                        /* up */
          const c = x >= bpp ? prev[x - bpp] : 0;   /* up-left */
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          cur[x] = (cur[x] + pr) & 0xff;
        }
        break;
      default:
        throw new Error('png.mjs：未知滤波类型 ' + filter + '（行 ' + y + '）');
    }
    cur.copy(prev);
  }
  return out;
}

/**
 * 解码 PNG → { width, height, data:Uint8Array /*RGBA8，每像素 4 字节*\/ }。
 * @param {Buffer|Uint8Array} buf PNG 文件字节（CDP 截图 base64 解码后即可直接传入）
 */
export function decodePng(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('png.mjs：不是 PNG（签名不符）');
  }
  let at = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 1;
  const idat = [];
  while (at + 8 <= b.length) {
    const ch = readChunk(b, at);
    if (ch.type === 'IHDR') {
      width = ch.data.readUInt32BE(0);
      height = ch.data.readUInt32BE(4);
      bitDepth = ch.data[8];
      colorType = ch.data[9];
      interlace = ch.data[12];
    } else if (ch.type === 'IDAT') {
      idat.push(ch.data);
    } else if (ch.type === 'IEND') {
      break;
    }
    at = ch.next;
  }
  if (!width || !height) throw new Error('png.mjs：缺少 IHDR（宽高为 0）');
  if (bitDepth !== 8) throw new Error('png.mjs：不支持 bit depth ' + bitDepth + '（仅 8）');
  if (interlace !== 0) throw new Error('png.mjs：不支持隔行 PNG（interlace=1）');
  const bpp = channelsOf(colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const flat = unfilter(raw, width, height, bpp);

  /* 统一转 RGBA8 */
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp, d = i * 4;
    if (colorType === 6) {
      rgba[d] = flat[s]; rgba[d + 1] = flat[s + 1]; rgba[d + 2] = flat[s + 2]; rgba[d + 3] = flat[s + 3];
    } else if (colorType === 2) {
      rgba[d] = flat[s]; rgba[d + 1] = flat[s + 1]; rgba[d + 2] = flat[s + 2]; rgba[d + 3] = 255;
    } else { /* 0 灰度 */
      rgba[d] = rgba[d + 1] = rgba[d + 2] = flat[s]; rgba[d + 3] = 255;
    }
  }
  return { width, height, data: rgba };
}

/** 数一屏里满足判定式的像素数（验证套件的高频操作，随库提供避免每套件重写）。
    @param {Uint8Array} data  decodePng().data
    @param {(r:number,g:number,b:number,a:number)=>boolean} pred 像素判定式 */
export function countPixels(data, pred) {
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (pred(data[i], data[i + 1], data[i + 2], data[i + 3])) n++;
  }
  return n;
}

/* CLI 自检：node dev/_qa/lib/png.mjs <file.png> —— 打印宽高与不透明像素数（冒烟用） */
if (process.argv[1] && process.argv[2] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const fs = await import('node:fs');
  const img = decodePng(fs.readFileSync(process.argv[2]));
  const opaque = countPixels(img.data, (r, g, b, a) => a === 255);
  console.log(img.width + 'x' + img.height + '  不透明像素 ' + opaque);
}
