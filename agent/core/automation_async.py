import os
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "0"
import asyncio
import sys
import json
from core.paths import get_chrome_path

def _log(logger, msg):
    if logger:
        try: logger.info(msg) if hasattr(logger, 'info') else logger(msg)
        except: pass
    else: print(f"[LOG] {msg}")

async def clicar_primeiro_disponivel(page, lista_seletores, timeout_por_tentativa=300, escrever_texto=None):
    for sel in lista_seletores:
        try:
            elemento = page.locator(sel).last
            await elemento.wait_for(state="visible", timeout=timeout_por_tentativa)
            await elemento.scroll_into_view_if_needed()
            await elemento.click(force=True)
            
            if escrever_texto:
                await asyncio.sleep(1)
                await page.evaluate(f"navigator.clipboard.writeText(`{escrever_texto}`)")
                await page.keyboard.press("Control+V")
            return True
        except:
            continue
    return False

def contador_execucao(incrementar=True):
    base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    count_file = os.path.join(base_dir, "execution_count.txt")
    count = 0
    if os.path.exists(count_file):
        try:
            with open(count_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                count = int(content) if content else 0
        except: count = 0
    if incrementar:
        count += 1
        with open(count_file, 'w', encoding='utf-8') as f:
            f.write(str(count))
    return count

async def iniciar_driver(userdir, modo_execucao='manual', logger=None):
    from playwright.async_api import async_playwright
    import psutil
    userdir = os.path.abspath(userdir)
    os.makedirs(userdir, exist_ok=True)

    if modo_execucao in ['auto']:
        _log(logger, "Verificando processos Chrome conflitantes...")
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                nome = proc.info['name'] or ''
                cmd = ' '.join(proc.info['cmdline'] or [])
                if ('chrome' in nome.lower() or 'msedge' in nome.lower()) and userdir in cmd:
                    _log(logger, f"⚠️ Encerrando Chrome conflitante (PID {proc.pid})")
                    proc.kill()
                    proc.wait(timeout=10)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.TimeoutExpired):
                continue
        await asyncio.sleep(1.5)

    _log(logger, f"Iniciando Playwright | Perfil: {userdir}")
    _log(logger, f"Modo de execução: {modo_execucao}")
    
    pw = await async_playwright().start()
    
    browser_args = [
        '--disable-blink-features=AutomationControlled',
        '--disable-notifications', 
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--start-maximized', 
        '--force-device-scale-factor=0.90', 
        '--high-dpi-support=1', 
        '--lang=pt-BR'
    ]
    
    if modo_execucao in ['auto', 'background']:
        browser_args.extend(['--window-position=-2400,-2400', '--force-device-scale-factor=0.70','--window-size=1366,768'])

    chromium_path = get_chrome_path()
    _log(logger, f"Chrome path: {chromium_path}")

    launch_kwargs = {
        "user_data_dir": userdir,
        "headless": False,
        "args": browser_args,
        "locale": "pt-BR",
        "timezone_id": "America/Sao_Paulo",
        "viewport": None,
        "no_viewport": True,
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    
    if chromium_path:
        launch_kwargs["executable_path"] = str(chromium_path)
    
    browser_context = await pw.chromium.launch_persistent_context(**launch_kwargs)
    page = browser_context.pages[0]
    page.set_default_timeout(120000)
    
    try:
        await page.goto("https://web.whatsapp.com")
        await asyncio.sleep(2)
        await page.wait_for_selector('input[data-tab="3"], div[contenteditable="true"][data-tab="3"]', timeout=200000)
        _log(logger, "✓ WhatsApp carregado.")
    except Exception as e:
        if modo_execucao in ['auto']: 
            try: await page.screenshot(path="erro_login.png")
            except: pass
        raise e
    
    return pw, browser_context, page

async def _abrir_conversa(page, target, logger=None):
    SELETORES_SEARCH = [
        'input[data-tab="3"]',
        'div[contenteditable="true"][data-tab="3"]',
    ]
    
    search_box = None
    for sel in SELETORES_SEARCH:
        try:
            el = page.locator(sel).first
            await el.wait_for(state='visible', timeout=5000)
            search_box = el
            break
        except:
            continue
    
    if not search_box:
        raise Exception('Campo de pesquisa não encontrado.')
    
    await search_box.click()
    await asyncio.sleep(0.5)
    await search_box.fill(target)
    await asyncio.sleep(1.0)
    
    SELETORES_RESULTADO = [
        'div[aria-label="Lista de chats"] div[role="listitem"]:first-child',
        'div[role="listitem"][data-testid="cell-frame-container"]',
    ]
    
    clicou = False
    for sel in SELETORES_RESULTADO:
        try:
            resultado = page.locator(sel).first
            await resultado.wait_for(state='visible', timeout=3000)
            await resultado.click(force=True)
            _log(logger, f'✅ Conversa aberta: {sel}')
            clicou = True
            break
        except:
            continue
    
    if not clicou:
        await page.keyboard.press("Enter")
    
    await asyncio.sleep(1.3)
    await page.wait_for_selector('div[contenteditable="true"][data-tab="10"]', state="visible", timeout=15000)

async def executar_envio(userdir, target, mode, message=None, file_path=None, logger=None, modo_execucao='manual'):
    pw, context, page = None, None, None
    
    try:
        pw, context, page = await iniciar_driver(userdir, modo_execucao, logger)
        await _abrir_conversa(page, target, logger)

        if mode == "text":
            chat_box = page.locator('div[contenteditable="true"][data-tab="10"]')
            await chat_box.wait_for(state="visible")
            await chat_box.click(force=True)
            await page.evaluate(f"navigator.clipboard.writeText(`{message}`)")
            await page.keyboard.press("Control+V")
            await page.keyboard.press("Enter")
            await asyncio.sleep(3)
            
        return True
    except Exception as e:
        _log(logger, f"❌ Erro: {str(e)}")
        raise e
    finally:
        if context:
            await context.close()
        if pw:
            await pw.stop()
