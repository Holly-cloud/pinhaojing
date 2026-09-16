#!/usr/bin/env python3
"""用户用品 / 开发用品 分区（2026-09-13，Holly 指示）

分区结果：
  拼好镜/            用户用品：PHJ.html（双击即用）｜00_README.md（交接入口，唯一指路文件）
  拼好镜/dev/        开发用品：01~09 文档链 + 06 评审件 + build.mjs + src/ + _build/

本脚本：① git mv 归位；② 修所有「相对项目根」的路径常量（深度 +1）；
        ③ 不改任何历史文档里的叙述性路径（发布说明描述的是当时状态）。
用法：python dev/_build/diag/split_user_dev.py   （在项目根执行）
"""
import os
import re
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DEV = os.path.join(ROOT, 'dev')


def git(*a):
    subprocess.run(['git'] + list(a), cwd=ROOT, check=True)


def mv(name, dst_dir):
    src = os.path.join(ROOT, name)
    if not os.path.exists(src):
        return
    os.makedirs(dst_dir, exist_ok=True)
    git('mv', name, os.path.relpath(os.path.join(dst_dir, name), ROOT))


# ① 归位：文档链 + 评审件 → dev/ ；build.mjs / src / _build → dev/
for name in sorted(os.listdir(ROOT)):
    if re.match(r'^(0[1-9]|1[0-9])_.*\.(md|html|png)$', name) or name.startswith('06_'):
        mv(name, DEV)
mv('build.mjs', DEV)
mv('src', DEV)
mv('_build', DEV)

# ② 路径常量：所有脚本「相对项目根」的层级 +1
subs = [
    ("path.resolve(HERE, '../../PHJ.html')", "path.resolve(HERE, '../../../PHJ.html')"),
    ("path.resolve(HERE, '../../src/index.html')", "path.resolve(HERE, '../../../src/index.html')"),
    ("path.resolve(HERE, '../../06_高亮小样_2026-09-13.html')",
     "path.resolve(HERE, '../../../06_高亮小样_2026-09-13.html')"),
    ("path.resolve(HERE, '..', '..')", "path.resolve(HERE, '..', '..', '..')"),
    ("path.join(ROOT, 'src'", "path.join(ROOT, 'dev', 'src'"),
    ("path.join(ROOT, '_build/snapshots/PHJ_v7.7_baseline.html')",
     "path.join(ROOT, 'dev', '_build/snapshots/PHJ_v7.7_baseline.html')"),
    ("'_build/snapshots/", "'dev/_build/snapshots/"),
    ("'_build/verify/", "'dev/_build/verify/"),
    ("'_build/artifacts/", "'dev/_build/artifacts/"),
    ("'_build/diag/", "'dev/_build/diag/"),
]
touched = 0
for base, _, files in os.walk(DEV):
    for f in files:
        if not f.endswith(('.mjs', '.md')):
            continue
        if f.endswith('.md') and not (f.startswith('README') or f.startswith('BASELINE') or f.startswith('建议清单')):
            continue          # 历史文档（发布说明等）不动
        p = os.path.join(base, f)
        s = open(p, encoding='utf-8').read()
        o = s
        for a, b in subs:
            s = s.replace(a, b)
        if s != o:
            open(p, 'w', encoding='utf-8', newline='\n').write(s)
            touched += 1
            print('路径修正 ' + os.path.relpath(p, ROOT))

# ③ 复核目录多一层：ROOT 再 +1
recon = os.path.join(DEV, '_build', 'artifacts', '_recon_20260913', 'diag_handoff_spec_check.mjs')
if os.path.exists(recon):
    s = open(recon, encoding='utf-8').read()
    s = s.replace("path.resolve(HERE, '..', '..', '..')", "path.resolve(HERE, '..', '..', '..', '..')")
    open(recon, 'w', encoding='utf-8', newline='\n').write(s)
    print('路径修正 ' + os.path.relpath(recon, ROOT))

print('\n完成，共改 ' + str(touched) + ' 个文件（另含复核脚本）')
