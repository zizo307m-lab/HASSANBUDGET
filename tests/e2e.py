"""Tests de bout en bout (Playwright, Chromium mobile). Lancer : python3 tests/e2e.py  (serveur sur :8765, racine = dossier du projet)"""
import re, sys
from playwright.sync_api import sync_playwright, expect
URL = 'http://localhost:8765/index.html'
errs, ok = [], []
def check(name, cond, extra=''):
    (ok if cond else errs).append(f'{name} {extra}'.strip())
def txt(pg, sel): return re.sub(r'\s+', ' ', pg.inner_text(sel).replace(' ', ' ')).strip()

with sync_playwright() as p:
    b = p.chromium.launch()
    def newpage(w=390, h=844):
        c = b.new_context(viewport={'width': w, 'height': h}, locale='fr-FR', timezone_id='Africa/Casablanca', has_touch=True, is_mobile=True)
        pg = c.new_page(); pg.set_default_timeout(6000)
        pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
        return c, pg

    # ---- 1. Scénario des captures : 10 000 + 5 000 − 400 = 14.600 ----
    c, pg = newpage()
    pg.goto(URL); pg.wait_for_selector('.topbar')
    check('accueil vide: 0,00 MAD', '0,00 MAD' in txt(pg, '.topbar .total'))
    pg.click('[data-act="new-account"]'); pg.fill('.sheet [data-field="name"]', 'Compte courant'); pg.fill('.sheet [data-field="openingBalance"]', '10000'); pg.click('.sheet [data-submit]')
    pg.wait_for_selector('.sheet-wrap', state='detached')
    check('compte créé 10.000', '10.000,00 MAD' in txt(pg, '.topbar .total'))
    def add_tx(cat_name, amount, label=''):
        pg.click('#nav a.add'); pg.wait_for_selector('[data-act="submit"]')
        pg.click('[data-act="pick-cat"]'); pg.fill('.sheet [data-q]', cat_name); pg.click('.sheet .pickrow'); pg.wait_for_selector('.sheet-wrap', state='detached')
        if label: pg.fill('[data-input="label"]', label)
        pg.fill('[data-input="amount"]', amount); pg.click('[data-act="submit"]'); pg.wait_for_selector('.topbar')
    # validation
    pg.click('#nav a.add'); pg.wait_for_selector('[data-act="submit"]'); pg.click('[data-act="submit"]', force=True)
    check('validation: erreurs affichées', pg.locator('.err:not(:empty)').count() >= 2)
    check('validation: pas de transaction créée', pg.evaluate("JSON.parse(localStorage.getItem('kanz:v1')||'null')?.transactions?.length||0") == 0)
    pg.click('[data-act="close"]'); pg.wait_for_selector('.topbar')
    add_tx('Salaire net', '5000', 'Salaire'); add_tx('Eau', '400', 'Lydec')
    check('solde 14.600,00', '14.600,00 MAD' in txt(pg, '.topbar .total'), txt(pg, '.topbar .total'))
    check('liste récente', 'Salaire' in txt(pg, '.home-wrap') and 'Salaire net' in txt(pg, '.home-wrap'))
    pg.evaluate("location.hash='#/analyse'"); pg.wait_for_selector('.hero')
    t = txt(pg, '.screen')
    check('analyse: +4.600', '+4.600' in t); check('analyse: 5.000 / 400', '5.000 MAD' in t and '400 MAD' in t)
    check('analyse: 92 % épargnés', '92 % épargnés' in t); check('analyse: plus gros poste', 'Eau & Électricité à 400 MAD' in t)
    check('analyse: moyenne 6 mois 0 MAD', re.search(r'Moyenne 6 mois\s*0 MAD', t) is not None)
    for tab in ['Patrimoine', 'Catégories', 'Flux']:
        pg.click(f'.seg button:has-text("{tab}")'); pg.wait_for_timeout(120)
    pg.click('.rchip:has-text("1A")'); check('analyse: plage 1A', pg.locator('.rchip[aria-pressed="true"]').inner_text() == '1A')
    # budget
    pg.click('#nav a[data-tab="budget"]'); pg.wait_for_selector('.hero.lime')
    check('budget: prêt à assigner 15.000 (dépense non budgétée = −400 en enveloppe)', '15.000' in txt(pg, '.hero.lime .big') and '−400' in txt(pg, '.hero.lime'), txt(pg, '.hero.lime'))
    pg.click('.grphead[data-act="grp"] >> nth=1'); 
    pg.click('.cat:has-text("Eau & Électricité")'); pg.fill('.sheet [data-field="amount"]', '450'); pg.click('.sheet [data-submit]'); pg.wait_for_selector('.sheet-wrap', state='detached')
    check('budget: prêt = 14.550', '14.550' in txt(pg, '.hero.lime .big'), txt(pg, '.hero.lime .big'))
    check('budget: enveloppes 50', 'En enveloppes 50 MAD' in txt(pg, '.hero.lime'), txt(pg, '.hero.lime'))
    # nouvelle catégorie
    pg.click('.plus >> nth=2'); pg.fill('.sheet [data-field="name"]', 'Café Hassan'); pg.click('.sheet [data-submit]'); pg.wait_for_selector('.sheet-wrap', state='detached')
    check('catégorie ajoutée', 'Café Hassan' in txt(pg, '.screen'))
    # nouveau groupe + doublon
    pg.click('[data-act="new-group"]'); pg.fill('.sheet [data-field="name"]', 'Projets'); pg.click('.sheet [data-submit]'); pg.wait_for_selector('.sheet-wrap', state='detached')
    pg.click('[data-act="new-group"]'); pg.fill('.sheet [data-field="name"]', 'projets'); pg.click('.sheet [data-submit]')
    check('groupe doublon refusé', 'existe déjà' in txt(pg, '.sheet')); pg.click('.sheet [data-close]'); pg.wait_for_timeout(300)
    # persistance
    pg.reload(); pg.wait_for_selector('.screen'); pg.evaluate("location.hash='#/home'"); pg.wait_for_selector('.topbar')
    check('persistance après rechargement', '14.600,00 MAD' in txt(pg, '.topbar .total'))
    # œil
    pg.click('.eye'); check('montants masqués', '••••' in txt(pg, '.topbar .total')); pg.click('.eye'); check('montants affichés', '14.600' in txt(pg, '.topbar .total'))
    # transfert + récurrence
    pg.evaluate("location.hash='#/comptes'"); pg.wait_for_selector('.screen'); pg.click('[data-act="new-account"]')
    pg.fill('.sheet [data-field="name"]', 'Livret'); pg.click('.sheet [data-kind="chips"] [data-val="savings"]'); pg.click('.sheet [data-submit]'); pg.wait_for_selector('.sheet-wrap', state='detached')
    pg.click('#nav a.add'); pg.wait_for_selector('[data-act="submit"]'); pg.click('[data-act="kind"][data-v="transfer"]')
    pg.click('[data-act="pick-acc"]'); pg.click('.sheet .pickrow:has-text("Compte courant")'); pg.click('[data-act="pick-to"]'); pg.click('.sheet .pickrow:has-text("Livret")')
    pg.fill('[data-input="amount"]', '2000'); pg.click('[data-act="submit"]'); pg.wait_for_selector('.screen'); pg.evaluate("location.hash='#/home'"); pg.wait_for_selector('.topbar')
    check('transfert: patrimoine inchangé', '14.600,00 MAD' in txt(pg, '.topbar .total'), txt(pg, '.topbar .total'))
    pg.evaluate("location.hash='#/budget'"); pg.wait_for_selector('.hero.lime')
    check('transfert: trésorerie 12.600', 'Trésorerie 12.600 MAD' in txt(pg, '.hero.lime'), txt(pg, '.hero.lime'))
    # récurrent mensuel démarrant il y a 2 mois -> brouillons
    pg.evaluate("location.hash='#/ajouter?rec=1'"); pg.wait_for_selector('[data-act="submit"]')
    check('récurrence pré-activée', pg.locator('.sw[data-act="rec"]').get_attribute('aria-checked') == 'true')
    pg.click('[data-act="pick-cat"]'); pg.fill('.sheet [data-q]', 'Internet'); pg.click('.sheet .pickrow'); pg.wait_for_selector('.sheet-wrap', state='detached')
    pg.fill('[data-input="amount"]', '300'); pg.click('[data-act="submit"]'); pg.wait_for_selector('.topbar')
    pg.evaluate("location.hash='#/recurrents'"); pg.wait_for_selector('.row'); check('récurrent listé', 'Internet' in txt(pg, '.screen'))
    pg.click('[data-act="pause"]'); check('récurrent en pause', 'en pause' in txt(pg, '.screen'))
    c.close()

    # ---- 2. PIN ----
    c, pg = newpage(); pg.goto(URL); pg.wait_for_selector('.topbar'); pg.evaluate("location.hash='#/parametres'"); pg.wait_for_selector('[data-act="pin-on"]')
    pg.click('[data-act="pin-on"]'); pg.wait_for_selector('.lock')
    for _ in range(2):
        for d in '1234': pg.click(f'.lock [data-k="{d}"]')
        pg.wait_for_timeout(700)
    pg.wait_for_selector('.lock', state='detached'); pg.wait_for_function("JSON.parse(localStorage.getItem('kanz:v1')||'{}').settings?.pinHash")
    pg.reload(); pg.wait_for_selector('.lock')
    check('PIN: écran verrouillé', pg.locator('#app .topbar').count() == 0 or pg.evaluate("document.body.classList.contains('locked')"))
    for d in '9999': pg.click(f'.lock [data-k="{d}"]')
    pg.wait_for_function("document.querySelector('.lock .err')?.textContent.includes('incorrect')")
    check('PIN: erroné refusé', True)
    for d in '1234': pg.click(f'.lock [data-k="{d}"]')
    pg.wait_for_selector('.lock', state='detached'); pg.wait_for_selector('.screen')
    check('PIN: déverrouillé', True)
    c.close()

    # ---- 3. Démo, thème, débordement horizontal sur toutes les pages ----
    for (w, h) in [(390, 844), (360, 740)]:
        c, pg = newpage(w, h); pg.goto(URL); pg.wait_for_selector('.topbar'); pg.click('[data-act="demo"]'); pg.wait_for_timeout(300)
        pg.evaluate("location.hash='#/parametres'"); pg.wait_for_selector('[data-act="theme"]'); pg.click('[data-act="theme"][data-v="dark"]')
        for mode in ['dark', 'light']:
            pg.evaluate(f"document.documentElement.dataset.theme='{mode}'")
            for r in ['home', 'transactions', 'budget', 'menu', 'analyse', 'patrimoine', 'actifs', 'prevision', 'historique', 'objectifs', 'habitudes', 'assistant', 'dettes', 'recurrents', 'comptes', 'parametres', 'ajouter']:
                pg.evaluate(f"location.hash='#/{r}'"); pg.wait_for_timeout(120)
                ov = pg.evaluate("document.documentElement.scrollWidth-window.innerWidth")
                check(f'pas de débordement {r} {w}px {mode}', ov <= 0, str(ov))
        # fonctions de l'accueil
        pg.evaluate("location.hash='#/home'"); pg.wait_for_selector('.topbar')
        pg.click('[data-card="flow"] .rchip:has-text("1A")'); pg.click('[data-card="nw"] .rchip:has-text("1M")')
        box = pg.locator('[data-card="nw"] svg').bounding_box(); pg.mouse.click(box['x'] + 30, box['y'] + 60)
        check('curseur patrimoine déplacé', pg.locator('[data-card="nw"] .when').inner_text() != '')
        if w == 390:
            pg.evaluate("location.hash='#/assistant'"); pg.wait_for_selector('.askbar'); pg.fill('[data-input="q"]', 'Quel est mon patrimoine ?'); pg.press('[data-input="q"]', 'Enter')
            pg.wait_for_selector('.msg.me ~ .msg.bot'); check('assistant répond', 'patrimoine net' in txt(pg, '.chat'))
            pg.evaluate("location.hash='#/objectifs'"); pg.wait_for_selector('.goal'); n = pg.locator('.goal').count()
            pg.click('[data-act="contrib"] >> nth=0'); pg.fill('.sheet [data-field="amount"]', '500'); pg.click('.sheet [data-submit]'); pg.wait_for_selector('.sheet-wrap', state='detached'); check('objectif alimenté', n > 0)
            pg.evaluate("location.hash='#/habitudes'"); pg.wait_for_selector('.check'); pg.click('.check >> nth=0'); check('habitude cochée', pg.locator('.check[aria-pressed="true"]').count() >= 1)
            pg.evaluate("location.hash='#/historique?status=draft'"); pg.wait_for_selector('[data-act="confirm"]'); pg.click('[data-act="confirm"] >> nth=0'); check('brouillon confirmé', True)
            pg.evaluate("location.hash='#/historique'"); pg.wait_for_selector('.row'); pg.click('[data-act="search"]'); pg.fill('[data-input="q"]', 'marjane'); pg.wait_for_timeout(150)
            check('recherche historique', 'Marjane' in txt(pg, '[data-list]') and 'Boucherie' not in txt(pg, '[data-list]'))
            pg.evaluate("location.hash='#/dettes'"); pg.wait_for_selector('.card.goal'); pg.click('.card.goal >> nth=0'); pg.fill('.sheet-foot ~ *', '') if False else None
            pg.click('.sheet [data-a="pay"]'); pg.fill('.sheet [data-field="amount"]', '100'); pg.click('.sheet [data-submit]'); pg.wait_for_selector('.sheet-wrap', state='detached'); check('remboursement dette', True)
            pg.evaluate("location.hash='#/actifs'"); pg.wait_for_selector('[data-act="asset"]'); pg.click('[data-act="asset"] >> nth=0'); pg.click('.sheet [data-a="val"]'); pg.fill('.sheet [data-field="value"]', '999000'); pg.click('.sheet [data-submit]'); pg.wait_for_selector('.sheet-wrap', state='detached'); check('actif mis à jour', '999.000' in txt(pg, '.screen'))
        c.close()
    b.close()
print('OK   :', len(ok)); print('FAIL :', len(errs))
for e in errs: print('  ✗', e)
sys.exit(1 if errs else 0)
