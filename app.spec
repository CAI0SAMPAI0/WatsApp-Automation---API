# -*- mode: python ; coding: utf-8 -*-
"""
app.spec — PyInstaller (onefile) para Study Practices com PyWebView
"""

import os
from pathlib import Path

# ── pastas a incluir ─────────────────────────────────────────────
datas_list = []
for folder in ['ui', 'core', 'data', 'resources']:
    if os.path.exists(folder):
        datas_list.append((folder, folder))

if os.path.exists('executor.py'):
    datas_list.append(('executor.py', '.'))

# ── imports ocultos necessários para PyWebView ───────────────────
hidden = [
    'playwright.sync_api',
    'webview',
    'webview.platforms.winforms',   # Windows
    'clr',                          # pythonnet (PyWebView no Windows)
]

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=datas_list,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'customtkinter', 'tkcalendar'],  # não precisamos mais
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='Study_Practices',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    console=False,          # sem janela de terminal
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    uac_admin=True,
    icon=['resources\\Taty_s-English-Logo.ico'],
)

# ── remove navegadores do Playwright (economiza ~300 MB) ─────────
import shutil
from pathlib import Path

dist_path = Path('dist/_internal')
if not dist_path.exists():
    dist_path = Path('dist')

playwright_browsers = dist_path / 'playwright' / 'driver' / 'package' / '.local-browsers'
if playwright_browsers.exists():
    print(f"\n🗑️  Removendo navegadores Playwright ({playwright_browsers})...")
    try:
        shutil.rmtree(playwright_browsers)
        print("✅ Navegadores removidos! (~300 MB economizados)")
    except Exception as e:
        print(f"⚠️  Aviso ao remover navegadores: {e}")
