import re

MD = r'C:/Users/Holly/AppData/Local/Temp/phj_handoff/拼好镜/09_重构施工指导书_2026-09-13.md'
OUT = r'D:/Hermes_Store/拼好镜/_build/artifacts/_recon_20260913'  # P5 归位后（原 _build/_recon_20260913）
md = open(MD, encoding='utf-8').read()
blocks = re.findall(r'```js\n(.*?)```', md, re.S)
build = [b for b in blocks if 'writeFileSync(OUT' in b][0]
veri = [b for b in blocks if 'stripBanner' in b][0]

# 修正 1：build.mjs 内联时吞掉段尾空行（/\n+$/ → /\n$/）
old = r"""all += body.replace(/\n+$/, '') + '\n';"""
new = r"""all += body.replace(/\n$/, '') + '\n';"""
assert old in build
build_fixed = build.replace(old, new)

# 修正 2：verify 的 stripBanner 缺 /m（banner 在第 2 行，^ 锚不上）
o2 = r"""-->\r?\n/, '')"""
n2 = r"""-->\r?\n/m, '')"""
assert o2 in veri
veri_fixed = veri.replace(o2, n2)

head1 = '/* ⚠️ 本文件 = 《09_重构施工指导书》第 8 节参考实现 + 一处修正（/\\n+$/ → /\\n$/）。\n   落盘位置：项目根 build.mjs。原版会把每一片末尾的空行吞掉（16 片 JS 中有 3 片以空行结尾）——\n   产物 155309 B 而非文档声称的 155315 B，且等价性校验必然 FAIL。详见同目录 README.md。 */\n'
head2 = '/* ⚠️ 本文件 = 《09_重构施工指导书》第 9 节参考实现 + 一处修正（stripBanner 补 m 标志）。\n   落盘位置：_build/verify/verify_build_equivalence.mjs。原版 banner 在第 2 行时剥不掉，\n   即使产物逐字节完美也会报 ❌ FAIL。详见同目录 README.md。 */\n'
open(OUT + '/build.mjs.fixed', 'w', encoding='utf-8', newline='\n').write(head1 + build_fixed)
open(OUT + '/verify_build_equivalence.mjs.fixed', 'w', encoding='utf-8', newline='\n').write(head2 + veri_fixed)
print('已生成 build.mjs.fixed / verify_build_equivalence.mjs.fixed')
