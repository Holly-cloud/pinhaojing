#!/usr/bin/env python3
"""P5 迁移：_build 四分区归位 + 验收/诊断脚本路径相对化（指导书第 3.4 / 10.P5 节）

动作：
  1. verify_v*.mjs → _build/verify/ ；diag_*.mjs|py → _build/diag/
  2. 快照：PHJ_v*.html / storyboard-prompt-panel_v5.4_*.html → _build/snapshots/archive/
     （保留 PHJ_v7.5_20260913_pre-v7.6.html、PHJ_v7.6.1_20260913_pre-v7.7.html 在 snapshots/ 顶层）
  3. 截图 → _build/artifacts/ ；复核目录 _recon_20260913/ → _build/artifacts/_recon_20260913/
  4. 脚本内硬编码路径 → 相对当前文件解析：
       const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../PHJ.html').replace(/\\/g, '/'));
     并补 import path / fileURLToPath / HERE（缺则补）

用法：python _build/diag/migrate_paths_to_relative.py   （在项目根执行；先 git mv 后改内容）
"""
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BUILD = os.path.join(ROOT, '_build')

KEEP_IN_SNAPSHOTS = {'PHJ_v7.5_20260913_pre-v7.6.html', 'PHJ_v7.6.1_20260913_pre-v7.7.html'}


def git(*args):
    subprocess.run(['git'] + list(args), cwd=ROOT, check=True)


def move(src, dst_dir):
    dst = os.path.join(dst_dir, os.path.basename(src))
    os.makedirs(dst_dir, exist_ok=True)
    git('mv', os.path.relpath(src, ROOT), os.path.relpath(dst, ROOT))
    return dst


TARGET_LINE = ("const TARGET = 'file:///' + encodeURI(path.resolve(HERE, '../../PHJ.html')"
               ".replace(/\\\\/g, '/'));")
SAMPLE_LINE = ("const SAMPLE = 'file:///' + encodeURI(path.resolve(HERE, "
               "'../../06_高亮小样_2026-09-13.html').replace(/\\\\/g, '/'));")

moved = {'verify': [], 'diag': [], 'snapshots': [], 'artifacts': []}

for name in sorted(os.listdir(BUILD)):
    p = os.path.join(BUILD, name)
    if not os.path.isfile(p):
        continue
    if re.match(r'verify_v\d+(\.\d+)?\.mjs$', name):
        move(p, os.path.join(BUILD, 'verify')); moved['verify'].append(name)
    elif re.match(r'diag_.*\.(mjs|py)$', name):
        move(p, os.path.join(BUILD, 'diag')); moved['diag'].append(name)
    elif name.endswith('.html') and (name.startswith('PHJ_v') or name.startswith('storyboard-prompt-panel_v')):
        if name in KEEP_IN_SNAPSHOTS:
            move(p, os.path.join(BUILD, 'snapshots')); moved['snapshots'].append(name + '（保留顶层）')
        else:
            move(p, os.path.join(BUILD, 'snapshots', 'archive')); moved['snapshots'].append('archive/' + name)
    elif name.endswith('.png'):
        move(p, os.path.join(BUILD, 'artifacts')); moved['artifacts'].append(name)

# 复核目录整体挪进 artifacts，并修正其脚本的 ROOT 深度（多一层目录）
recon_old = os.path.join(BUILD, '_recon_20260913')
recon_new = os.path.join(BUILD, 'artifacts', '_recon_20260913')
if os.path.isdir(recon_old):
    os.makedirs(os.path.dirname(recon_new), exist_ok=True)
    git('mv', os.path.relpath(recon_old, ROOT), os.path.relpath(recon_new, ROOT))
    moved['artifacts'].append('_recon_20260913/（整个目录）')

# 路径相对化
fixed, skipped = [], []
for d in ('verify', 'diag', 'artifacts/_recon_20260913'):
    for name in sorted(os.listdir(os.path.join(BUILD, d))):
        if not name.endswith('.mjs'):
            continue
        p = os.path.join(BUILD, d, name)
        s = open(p, encoding='utf-8').read()
        if 'Hermes_Store' not in s:
            continue
        lines = s.split('\n')
        out = []
        changed = False
        for ln in lines:
            if 'Hermes_Store' in ln and ln.lstrip().startswith('const TARGET'):
                out.append(TARGET_LINE); changed = True
            elif 'Hermes_Store' in ln and ln.lstrip().startswith('const SAMPLE'):
                out.append(SAMPLE_LINE); changed = True
            else:
                out.append(ln)
        if not changed:
            skipped.append(d + '/' + name + '（含硬编码但非 TARGET 行，需人工看）')
            continue
        s = '\n'.join(out)
        head = ''
        if 'node:path' not in s:
            head += "import path from 'node:path';\n"
        if 'node:url' not in s:
            head += "import { fileURLToPath } from 'node:url';\n"
        if 'const HERE' not in s:
            head += "const HERE = path.dirname(fileURLToPath(import.meta.url));\n"
        deep = d.count('/') + 1  # verify/ diag/ = 1 层；artifacts/_recon_x = 2 层
        if deep == 2:
            s = s.replace("path.resolve(HERE, '../../PHJ.html')", "path.resolve(HERE, '../../../PHJ.html')")
            s = s.replace("path.resolve(HERE, '../../06_高亮小样_2026-09-13.html')",
                          "path.resolve(HERE, '../../../06_高亮小样_2026-09-13.html')")
            s = s.replace("path.resolve(HERE, '..', '..')", "path.resolve(HERE, '..', '..', '..')")
            s = s.replace("_build/_recon_20260913", "_build/artifacts/_recon_20260913")
        open(p, 'w', encoding='utf-8', newline='\n').write(head + s)
        fixed.append(d + '/' + name)

print('=== 归位 ===')
for k, v in moved.items():
    print('  [' + k + '] ' + str(len(v)) + ' 项')
print('\n=== 路径相对化（%d 个脚本）===' % len(fixed))
for f in fixed:
    print('  ' + f)
if skipped:
    print('\n⚠️ 未自动处理：')
    for f in skipped:
        print('  ' + f)

# 残留检查
left = subprocess.run(['grep', '-rl', 'Hermes_Store', '_build'], cwd=ROOT,
                      capture_output=True, text=True).stdout.strip()
print('\n=== 仍含硬编码绝对路径的文件 ===')
print(left if left else '  （无）')
