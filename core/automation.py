import os
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "0"
import time
import sys
import json
import pyperclip
from core.paths import get_chrome_path

# Default selectors fallback (in case API is offline or not used)
DEFAULT_SELECTORS = {
    "SEARCH_BOX": [
        'input[data-tab="3"]',
        '#_r_9_',
        'input[aria-label="Pesquisar ou começar uma nova conversa"]',
        'input[aria-label="Search or start new chat"]',
        'div[contenteditable="true"][data-tab="3"]',
    ],
    "FIRST_RESULT": [
        'div[aria-label="Lista de chats"] div[role="listitem"]:first-child',
        'div[role="listitem"][data-testid="cell-frame-container"]',
        'div[data-testid="cell-frame-container"]',
        'div[data-testid="chat-list-search-result-item"]',
        'div._ak8q',
        'span[data-testid="conversation-info-header-chat-title"]:first-of-type',
    ],
    "ATTACH_BUTTON": [
        '//div[@aria-label="Anexar"]',
        '//span[@data-icon="plus"]',
        '//span[@data-icon="plus-rounded"]',
        '//span[@data-icon="clip"]',
        '//div[@aria-label="Attach"]'
    ],
    "TYPE_PHOTO": [
        "xpath=//span[contains(text(), 'Fotos')]",
        "xpath=//span[contains(text(), 'Photos')]",
        "xpath=//div[@aria-label='Fotos e vídeos']",
        "xpath=//div[@aria-label='Photos & videos']",
        "css=[data-icon='image']",
        "css=[data-testid='mi-attach-media']",
    ],
    "TYPE_DOC": [
        "xpath=//span[contains(text(), 'Documento')]",
        "xpath=//span[contains(text(), 'Document')]",
        "xpath=//div[@aria-label='Documento']",
        "xpath=//div[@aria-label='Document']",
        "css=[data-icon='document']",
        "css=[data-testid='mi-attach-document']",
    ],
    "CAPTION_BOX": [
        "css=.lexical-rich-text-input [contenteditable='true']",
        "xpath=//div[contains(@aria-label, 'legenda')]",
        "css=div.lexical-rich-text-input div[contenteditable='true']",
        "css=div[contenteditable='true'][role='textbox']",
    ],
    "SEND_BUTTON": [
        "xpath=//span[@data-icon='send']",
        "xpath=//div[@role='button' and @aria-label='Enviar']",
        '//*[@data-icon="send"]',
        '//div[@aria-label="Enviar"]',
    ],
    "CHAT_BOX": [
        'div[contenteditable="true"][data-tab="10"]',
    ]
}

def _get_sel(selectors_dict, key):
    return selectors_dict.get(key, DEFAULT_SELECTORS.get(key, []))

def _log(logger, msg):
    if logger:
        try: logger.info(msg) if hasattr(logger, 'info') else logger(msg)
        except: pass
    else: print(f"[LOG] {msg}")

def clicar_primeiro_disponivel(page, lista_seletores, timeout_por_tentativa=300, escrever_texto=None):
    for sel in lista_seletores:
        try:
            elemento = page.locator(sel).last
            elemento.wait_for(state="visible", timeout=timeout_por_tentativa)
            elemento.scroll_into_view_if_needed()
            elemento.click(force=True)
            
            if escrever_texto:
                time.sleep(1)
                pyperclip.copy(escrever_texto)
                page.keyboard.press("Control+V")
            return True
        except:
            continue
    return False

def iniciar_driver(userdir, modo_execucao='manual', logger=None):
    from playwright.sync_api import sync_playwright
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
        time.sleep(1.5)

    _log(logger, f"Iniciando Playwright | Perfil: {userdir}")
    pw = sync_playwright().start()
    
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
        browser_args.extend(['--window-position=-2400,-2400', '--force-device-scale-factor=0.70','--window-size=1366,768', '--high-dpi-support=1'])

    chromium_path = get_chrome_path()
    
    ultimo_erro = None
    for tentativa in range(1, 4):
        try:
            browser_context = pw.chromium.launch_persistent_context(
                executable_path=str(chromium_path),
                user_data_dir=userdir, 
                headless=False, 
                args=browser_args, 
                locale="pt-BR", 
                timezone_id="America/Sao_Paulo",
                viewport=None, 
                no_viewport=True,
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
            )
            break
        except Exception as e:
            ultimo_erro = e
            msg_err = str(e).lower()
            if "closed" in msg_err or "target" in msg_err or "context" in msg_err:
                _log(logger, f"⚠️ Tentativa {tentativa}/3 falhou. Aguardando {tentativa * 3}s...")
                try: pw.stop()
                except: pass
                time.sleep(tentativa * 3)
                pw = sync_playwright().start()
            else:
                _log(logger, f"❌ Erro fatal: {e}")
                try: pw.stop()
                except: pass
                raise e
    else:
        try: pw.stop()
        except: pass
        raise RuntimeError(f"Falha ao lançar Chrome: {ultimo_erro}")

    page = browser_context.pages[0]
    page.set_default_timeout(120000)
    try:
        page.goto("https://web.whatsapp.com")
        time.sleep(2)
        # Usa seletor de busca para confirmar carregamento
        page.wait_for_selector('input[data-tab="3"], div[contenteditable="true"][data-tab="3"]', timeout=200000)
        _log(logger, "✓ WhatsApp carregado.")
    except Exception as e:
        raise e
    return pw, browser_context, page


def _abrir_conversa(page, target, selectors, logger=None):
    seletores_search = _get_sel(selectors, "SEARCH_BOX")
    seletores_resultado = _get_sel(selectors, "FIRST_RESULT")

    search_box = None
    for sel in seletores_search:
        try:
            el = page.locator(sel).first
            el.wait_for(state='visible', timeout=5000)
            search_box = el
            break
        except: continue

    if not search_box:
        raise Exception('Campo de pesquisa não encontrado.')

    search_box.click()
    time.sleep(0.5)
    search_box.fill(target)
    time.sleep(1.2)

    clicou = False
    for sel in seletores_resultado:
        try:
            resultado = page.locator(sel).first
            resultado.wait_for(state='visible', timeout=3000)
            resultado.click(force=True)
            clicou = True
            break
        except: continue

    if not clicou:
        page.keyboard.press("Enter")

    time.sleep(1.5)
    try:
        chat_selectors = _get_sel(selectors, "CHAT_BOX")
        page.wait_for_selector(chat_selectors[0], state="visible", timeout=10000)
    except:
        pass


def enviar_arquivo_com_mensagem(page, file_path, message, selectors, logger=None):
    _log(logger, "📎 Preparando anexos...")
    
    xpath_anexo_list = _get_sel(selectors, "ATTACH_BUTTON")
    xpath_anexo = " | ".join(xpath_anexo_list) if isinstance(xpath_anexo_list, list) else xpath_anexo_list
    
    btn_anexo = page.wait_for_selector(xpath_anexo, state="visible", timeout=60000)
    btn_anexo.click()
    time.sleep(1.5)

    if isinstance(file_path, str):
        clean_path = file_path.replace('nC:\\', '\nC:\\').replace('"', '')
        lista_arquivos = [os.path.abspath(p.strip()) for p in clean_path.split('\n') if p.strip()]
    else:
        lista_arquivos = [os.path.abspath(str(file_path).strip())]

    ext = os.path.splitext(lista_arquivos[0].lower())[1]
    is_media = ext in ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.avi']

    seletores_tipo = _get_sel(selectors, "TYPE_PHOTO" if is_media else "TYPE_DOC")

    clicou_tipo = False
    for sel in seletores_tipo:
        try:
            with page.expect_file_chooser(timeout=1500) as fc_info:
                page.locator(sel).first.click(force=True, timeout=1500)
            file_chooser = fc_info.value
            file_chooser.set_files(lista_arquivos)
            clicou_tipo = True
            break
        except: continue
    
    if not clicou_tipo:
        raise Exception("Nenhum seletor de tipo de arquivo funcionou.")
    
    _log(logger, "⏳ Aguardando carregamento...")
    xpath_btn_enviar_list = _get_sel(selectors, "SEND_BUTTON")
    xpath_btn_enviar = " | ".join(xpath_btn_enviar_list)
    
    try:
        page.wait_for_selector(xpath_btn_enviar, state="visible", timeout=300000)
    except Exception as e:
        raise e

    if message:
        _log(logger, "✍️ Inserindo legenda...")
        seletores_legenda = _get_sel(selectors, "CAPTION_BOX")
        campo_ok = False
        for sel in seletores_legenda:
            try:
                target_field = page.locator(sel).last
                target_field.wait_for(state="visible", timeout=2000)
                target_field.click(force=True)
                time.sleep(1)
                pyperclip.copy(message)
                page.keyboard.press("Control+V")
                campo_ok = True
                break
            except: continue
        time.sleep(0.5)

    _log(logger, "🚀 Enviando...")
    enviou = False
    for sel_env in xpath_btn_enviar_list:
        try:
            btn = page.locator(sel_env).last
            if btn.is_visible():
                btn.click(force=True)
                enviou = True
                break
        except: continue

    if not enviou:
        page.keyboard.press("Enter")
    
    time.sleep(10)
    _log(logger, "🚀 Concluído!")


def executar_envio(userdir, target, mode, selectors=None, message=None, file_path=None, logger=None, modo_execucao='manual'):
    if selectors is None:
        selectors = DEFAULT_SELECTORS
        
    pw, context, page = None, None, None
    try:
        pw, context, page = iniciar_driver(userdir, modo_execucao, logger)
        _abrir_conversa(page, target, selectors, logger)

        if mode == "text":
            chat_selectors = _get_sel(selectors, "CHAT_BOX")
            chat_box = page.locator(chat_selectors[0])
            chat_box.wait_for(state="visible")
            chat_box.click(force=True)
            pyperclip.copy(message)
            page.keyboard.press("Control+V")
            page.keyboard.press("Enter")
            time.sleep(3)
        else:
            enviar_arquivo_com_mensagem(page, file_path, message, selectors, logger)
            
        return True
    except Exception as e:
        _log(logger, f"❌ Falha: {str(e)}")
        raise e
    finally:
        try:
            if context:
                for p in context.pages: p.close()
        except: pass
        if pw: pw.stop()
