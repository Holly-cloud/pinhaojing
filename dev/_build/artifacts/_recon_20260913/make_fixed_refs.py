#!/usr/bin/env python3
"""一次性留档脚本（2026-09-13 重构复核留档）——非构建链一环，不参与交付。

作用：从《09_重构施工指导书_2026-09-13.md》正文中抠出第 8/9 节的两段参考实现（build.mjs /
      verify_build_equivalence.mjs），套上「本文件 = 参考实现 + 一处修正」的文件头，落盘为
      build.mjs.fixed / verify_build_equivalence.mjs.fixed 供人工比对。

为何改造路径：原版把输入写死为当年的临时目录
      （C:/Users/Holly/AppData/Local/Temp/phj_handoff/...）、输出写死为旧盘符
      （D:/Hermes_Store/拼好镜/...）——迁移后已成死路径、不可复跑。
      本版改为：① 输入经命令行参数或环境变量 PHJ_SPEC_MD 传入；② 输出相对本文件自身解析。

用法：
    python make_fixed_refs.py <09_重构施工指导书_2026-09-13.md>
    # 或：PHJ_SPEC_MD=<指导书.md> python make_fixed_refs.py
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = HERE  # 产物与脚本同目录（_recon_20260913）

MD = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('PHJ_SPEC_MD', '')).strip()
if not MD:
    sys.exit('未指定指导书 md。用法：python make_fixed_refs.py <指导书.md>  或设置环境变量 PHJ_SPEC_MD')
if not os.path.isfile(MD):
    sys.exit('指导书 md 不存在：' + MD)

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
open(os.path.join(OUT, 'build.mjs.fixed'), 'w', encoding='utf-8', newline='\n').write(head1 + build_fixed)
open(os.path.join(OUT, 'verify_build_equivalence.mjs.fixed'), 'w', encoding='utf-8', newline='\n').write(head2 + veri_fixed)
print('已生成 build.mjs.fixed / verify_build_equivalence.mjs.fixed →', OUT)
