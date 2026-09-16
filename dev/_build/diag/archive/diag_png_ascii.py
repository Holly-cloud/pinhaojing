"""PNG 终端预览（零依赖）：把截图降采样成字符画，用于 headless 验收时「人眼」核对构图
用法：python diag_png_ascii.py <图.png> [列数默认100]
"""
import sys, zlib, struct

def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not png'
    pos, idat = 8, b''
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        body = data[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, bit, color, comp, filt, inter = struct.unpack('>IIBBBBB', body)
            assert bit == 8 and inter == 0, f'unsupported bit={bit} interlace={inter}'
            bpp = {0:1, 2:3, 4:2, 6:4}[color]
        elif typ == b'IDAT':
            idat += body
        elif typ == b'IEND':
            break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * bpp
    prev = bytearray(stride)
    rows, p = [], 0
    for _ in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(bpp, stride): line[i] = (line[i] + line[i-bpp]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i-bpp] if i >= bpp else 0
                pa, pb, pc = abs(b-c), abs(a-c), abs(a+b-2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        rows.append(bytes(line))
        prev = line
    return w, h, rows, bpp

SHADES = ' .:-=+*#%@'
def main():
    path = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    w, h, rows, bpp = read_png(path)
    step_x = max(1, w // cols)
    step_y = max(1, h // (cols * h // max(w, 1) // 2 + 1)) if False else max(1, (w // cols) * 2)
    out = []
    for y in range(0, h, step_y):
        line = rows[y]
        seg = []
        for x in range(0, w, step_x):
            i = x * bpp
            lum = (line[i]*299 + line[i+1]*587 + line[i+2]*114)//1000
            seg.append(SHADES[min(9, (255 - lum) * 10 // 256)])
        out.append(''.join(seg))
    print(f'# {path}  {w}x{h}  采样步长 x={step_x} y={step_y}  字符：越深=越暗')
    for l in out:
        print(l)

main()
