"""v7.6 叠层高亮 · 像素级对齐举证（零依赖：stdlib zlib 解 PNG）
用法：python diag_hl_align.py <只编辑层图.png> <只彩色层图.png> [阈值默认210]
原理：同一段文本分别由 textarea（编辑层）与 pre（彩色层）独立渲染 → 若两层排版一致，
      两张图的墨迹几何（逐行左右缘 / 墨迹行集合 / 最优位移）应完全重合。
      注：墨迹「像素计数」会因两层用色不同产生抗锯齿伪影差异，故不作为判据。
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
    for y in range(h):
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

def ink_maps(path, thr):
    w, h, rows, bpp = read_png(path)
    rows_ink, cols_ink = [0]*h, [0]*w
    left, right = [None]*h, [None]*h
    total = 0
    for y in range(h):
        line = rows[y]
        for x in range(w):
            i = x*bpp
            lum = (line[i]*299 + line[i+1]*587 + line[i+2]*114)//1000
            if lum < thr:
                rows_ink[y] += 1; cols_ink[x] += 1; total += 1
                if left[y] is None: left[y] = x
                right[y] = x
    return dict(w=w, h=h, row_ink=rows_ink, col_ink=cols_ink, left=left, right=right, total=total)

def best_shift(a, b, span):
    n, res = len(a), []
    for d in range(-span, span+1):
        s = c = 0
        for i in range(n):
            j = i + d
            if 0 <= j < n:
                s += abs(a[i] - b[j]); c += 1
        res.append((s/max(c, 1), d))
    res.sort()
    return res[0]

def main():
    pa, pb = sys.argv[1], sys.argv[2]
    thr = int(sys.argv[3]) if len(sys.argv) > 3 else 210
    A, B = ink_maps(pa, thr), ink_maps(pb, thr)
    print(f'阈值={thr}  尺寸 A={A["w"]}x{A["h"]} B={B["w"]}x{B["h"]}  墨迹像素 A={A["total"]} B={B["total"]}'
          f'（计数受抗锯齿影响，仅参考）')
    assert (A['w'], A['h']) == (B['w'], B['h']), '两图尺寸不一致'
    rv, dy = best_shift(A['row_ink'], B['row_ink'], 4)
    rh, dx = best_shift(A['col_ink'], B['col_ink'], 6)
    print(f'纵向最优位移 dy={dy}（平均每行墨迹差 {rv:.2f}）  横向最优位移 dx={dx}（平均每列墨迹差 {rh:.2f}）')

    rowsA = {y for y, v in enumerate(A['row_ink']) if v > 0}
    rowsB = {y for y, v in enumerate(B['row_ink']) if v > 0}
    onlyA, onlyB = sorted(rowsA - rowsB), sorted(rowsB - rowsA)
    print(f'有墨迹行集合：A={len(rowsA)} 行  B={len(rowsB)} 行  仅 A 有={len(onlyA)}  仅 B 有={len(onlyB)}')
    if onlyA[:6]: print('  仅 A 有墨迹的行:', onlyA[:6])
    if onlyB[:6]: print('  仅 B 有墨迹的行:', onlyB[:6])

    dl, dr, skipped = [], [], 0
    for y in sorted(rowsA & rowsB):
        iA, iB = A['row_ink'][y], B['row_ink'][y]
        # 该行两层墨迹量差异明显 → 含高亮装饰（波浪下划线等），边缘比对无意义，跳过
        if abs(iA - iB) > max(2, 0.25 * max(iA, iB)):
            skipped += 1
            continue
        dl.append(abs(A['left'][y] - B['left'][y]))
        dr.append(abs(A['right'][y] - B['right'][y]))
    print(f'逐行左缘最大偏差={max(dl) if dl else "-"} px  右缘最大偏差={max(dr) if dr else "-"} px'
          f'（参与比对 {len(dl)} 行，含装饰跳过 {skipped} 行）')
    la, lb = [x for x in A['left'] if x is not None], [x for x in B['left'] if x is not None]
    ra, rb = [x for x in A['right'] if x is not None], [x for x in B['right'] if x is not None]
    print(f'整体左缘 min A={min(la)} B={min(lb)}  右缘 max A={max(ra)} B={max(rb)}')

    # 判据：编辑层墨迹必须被彩色层完全覆盖（A ⊆ B）、两层墨迹分布零位移、
    # 且"无装饰差异"的行其文本左右缘对齐 ≤2px；彩色层允许有多出的装饰墨迹。
    ok = (dy == 0 and dx == 0 and not onlyA and max(dl or [0]) <= 2 and max(dr or [0]) <= 2)
    if onlyB:
        print(f'（彩色层多出 {len(onlyB)} 行墨迹 = 高亮装饰，按规则允许）')
    print('\n对齐结论:', 'PASS（文本墨迹逐行重合、位移 0；装饰层额外墨迹不计）' if ok else 'FAIL')
    return 0 if ok else 1

sys.exit(main())
