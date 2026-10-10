// ==UserScript==
// @name          Kleinanzeigen - Nutzer ausblenden (Blockliste)
// @namespace     https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden
// @description   Blendet auf Kleinanzeigen.de Anzeigen von Nutzerinnen und Nutzern aus, die du blockierst. Eigene Blockliste mit Notizen, einzelne Anzeigen ausblenden, Export und Import der Liste.
// @author        RainbowlabsInc
// @copyright     2026, RainbowlabsInc
// @license       MIT
// @version       0.1.2
// @icon          https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden/raw/main/assets/icon48.png
// @homepage      https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden
// @updateURL     https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden/raw/main/script.user.js
// @downloadURL   https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden/raw/main/script.user.js
// @match         https://www.kleinanzeigen.de/s-*
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_addValueChangeListener
// @grant         GM_registerMenuCommand
// @noframes
// @run-at        document-idle
// ==/UserScript==

/*
 * Funktionsweise
 * --------------
 * Die Blockliste speichert Anbieter über ihre Nutzer-ID, also die Zahl aus dem Link
 * zur Bestandsliste (/s-bestandsliste.html?userId=<ID>). Gewerbliche Shops ohne diesen
 * Link werden als "pro:<shop-name>" gespeichert (aus /pro/<shop-name>).
 *
 * Die Karten in den Suchergebnissen enthalten den Anbieter in der Regel nicht. Darum
 * merkt sich das Script, welche Anzeige zu welchem Anbieter gehört (Anzeigen-Index):
 *   - beim Blockieren: die Bestandsliste des Anbieters wird einmal geladen,
 *   - danach höchstens einmal am Tag erneut (für neue Anzeigen, abschaltbar),
 *   - beim Öffnen einer Anzeige oder einer Bestandsliste (ohne zusätzliche Anfrage),
 *   - optional: unbekannte Anzeigen der Übersicht im Hintergrund prüfen (aus, weil
 *     dafür pro Anzeige eine Anfrage an Kleinanzeigen nötig ist).
 *
 * 1. Übersicht (Suchergebnisse, /s-...):
 *    Anzeigen blockierter Anbieter und einzeln ausgeblendete Anzeigen werden
 *    eingeklappt (Hinweiszeile) oder ganz ausgeblendet. Neben dem Preis sitzt ein
 *    "Ausblenden"-Button mit einem kleinen Menü.
 * 2. Anzeigenseite (/s-anzeige/...): Button "Blockieren" am Anbieter, Hinweis bei
 *    blockierten Anbietern.
 * 3. Bestandsliste (/s-bestandsliste.html): Leiste zum Blockieren/Freigeben.
 *
 * Die Blockliste lässt sich als JSON oder als Textliste (ähnlich einer Filterliste)
 * exportieren und importieren. Das Format ist im README beschrieben.
 *
 * Hinweis: Kleinanzeigen ändert das Frontend häufig. Alle Selektoren und Grenzwerte
 * stehen gesammelt in CONFIG.
 */

(function () {
    'use strict';

    const VERSION = '0.1.2';

    const CONFIG = {
        keys: {
            users: 'kua-users',          // { <userId>: { name, note, added } }
            ads: 'kua-hidden-ads',       // { <adId>: <Zeitstempel> } einzeln ausgeblendete Anzeigen
            index: 'kua-ad-index',       // { <adId>: <userId> } bekannte Zuordnung Anzeige -> Anbieter
            scanned: 'kua-scanned',      // { <userId>: <Zeitstempel> } letzte geladene Bestandsliste
            settings: 'kua-settings',
        },
        defaultSettings: {
            mode: 'collapse',            // 'collapse' = Hinweiszeile, 'hide' = ganz ausblenden
            dailyRefresh: true,          // Bestandslisten blockierter Anbieter täglich neu laden
            autoResolve: false,          // unbekannte Anzeigen der Übersicht im Hintergrund prüfen
        },
        // Größe des Anzeigen-Index; ältere (= kleinere) Anzeigen-Nummern fallen zuerst heraus
        indexMax: 20000,
        // Bestandsliste neu laden, wenn älter als
        refreshAfterMs: 24 * 60 * 60 * 1000,
        // ... aber pro Seitenaufruf höchstens so viele Anbieter
        refreshPerVisit: 3,
        // Seiten pro Bestandsliste
        scanMaxPages: 5,
        // Pause zwischen zwei Hintergrund-Anfragen
        requestGapMs: 1200,
        // Höchstens so viele Anzeigen pro Seitenaufruf im Hintergrund prüfen
        autoResolveMax: 30,
        nameMax: 80,
        noteMax: 300,
        // Link zur Bestandsliste bzw. zum Shop (Stand 10/2026)
        sellerUrl: (id) => id.startsWith('pro:')
            ? `/pro/${encodeURIComponent(id.slice(4))}`
            : `/s-bestandsliste.html?userId=${encodeURIComponent(id)}`,
        // Bereiche der Anzeigenseite, in denen der Anbieter steht (in dieser Reihenfolge)
        sellerContainers: ['#viewad-contact', '#viewad-profile-box', '.userprofile-vip', '#viewad-sidebar', 'aside'],
        // Linktexte, die kein Anbietername sind
        notAName: /anzeigen|profil|bestandsliste|shop|mehr|folgen/i,
        // Ergebnisliste auf Such- und Bestandslisten-Seiten (Rückfall: größte Liste mit Anzeigen)
        resultListSelectors: ['#srchrslt-adtable'],
        // "Nächste Seite" in der Bestandsliste
        nextPageText: /^(›|»|>|weiter|nächste)/i,
        listFormat: 'kleinanzeigen-blockliste',
        listFormatVersion: 1,
    };

    // Nur auf kleinanzeigen.de laufen – zusätzlich zu @match, falls der Script-Manager
    // die Header ignoriert oder das Script manuell mit breiteren Regeln eingebunden wird.
    if (window.location.protocol !== 'https:' || window.location.hostname !== 'www.kleinanzeigen.de') return;
    if (window.top !== window.self) return;

    // Doppelt installiert? Dann arbeitet nur die zuerst gestartete Kopie.
    const docRoot = document.documentElement;
    if (docRoot.hasAttribute('data-kua')) {
        console.warn('[Nutzer ausblenden] Script läuft bereits, diese Kopie bleibt inaktiv.');
        return;
    }
    docRoot.setAttribute('data-kua', VERSION);

    const path = window.location.pathname;
    const isDetailPage = path.startsWith('/s-anzeige/');
    const isSellerPage = path === '/s-bestandsliste.html';
    const pageSellerId = isSellerPage ? normalizeUserId(window.location.href) : null;

    // ------------------------------------------------------------------
    // Helfer
    // ------------------------------------------------------------------

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const clip = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
    const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('de-DE') : '');

    function getAdIdFromUrl(url) {
        // /s-anzeige/<slug>/<adId>-<kategorie>-<ort>
        const m = String(url || '').match(/\/s-anzeige\/[^/]+\/(\d+)/);
        return m ? m[1] : null;
    }

    const ID_RE = /^(?:\d{1,15}|pro:[a-z0-9][a-z0-9_-]{0,79})$/i;

    // Nutzer-ID aus einem Link zur Bestandsliste / zum Shop
    function userIdFromHref(href) {
        const s = String(href || '');
        let m = s.match(/s-bestandsliste\.html\?(?:[^#]*&)?userId=(\d{1,15})(?!\d)/);
        if (m) return m[1];
        m = s.match(/^(?:https:\/\/www\.kleinanzeigen\.de)?\/pro\/([a-z0-9][a-z0-9_-]{0,79})(?:[/?#]|$)/i);
        if (m) return 'pro:' + m[1].toLowerCase();
        return null;
    }

    // Nutzer-ID aus Eingabe oder Liste: "12345678", "pro:shop-name" oder ein Link
    function normalizeUserId(raw) {
        if (raw == null) return null;
        const s = String(raw).trim();
        const fromLink = userIdFromHref(s) || userIdFromHref(s.replace(/^https:\/\/www\.kleinanzeigen\.de/, ''));
        if (fromLink) return fromLink;
        let m = s.match(/[?&]userId=(\d{1,15})(?!\d)/);
        if (m) return m[1];
        return ID_RE.test(s) ? s.toLowerCase() : null;
    }

    function userLabel(id, fallbackName) {
        const u = state.users[id];
        const name = (u && u.name) || fallbackName;
        if (name) return name;
        return id.startsWith('pro:') ? `Shop ${id.slice(4)}` : `Nutzer ${id}`;
    }

    function el(tag, props = {}, ...children) {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (v == null || v === false) continue;
            if (k === 'dataset') Object.assign(node.dataset, v);
            else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
            else if (k in node && k !== 'list') node[k] = v;
            else node.setAttribute(k, v === true ? '' : v);
        }
        children.flat().forEach(c => c != null && c !== false && node.append(c));
        return node;
    }

    // Buttons liegen teils in komplett verlinkten Karten: Klick darf nicht zur Anzeige navigieren
    // (Bubble-Phase: Listener am selben Element, die vorher registriert wurden, laufen trotzdem.)
    function guard(node) {
        ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(t => node.addEventListener(t, e => e.stopPropagation()));
        node.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
        return node;
    }

    function guardedButton(props, ...children) {
        return guard(el('button', { type: 'button', ...props }, ...children));
    }

    // ------------------------------------------------------------------
    // Speicher: Tampermonkey/Violentmonkey-Speicher, sonst localStorage
    // ------------------------------------------------------------------

    const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

    function load(key, def) {
        try {
            if (hasGM) {
                const v = GM_getValue(key);
                return v === undefined ? def : v;
            }
            const raw = localStorage.getItem(key);
            return raw == null ? def : JSON.parse(raw);
        } catch (e) {
            return def;
        }
    }

    function save(key, value) {
        try {
            if (hasGM) GM_setValue(key, value);
            else localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    }

    function cleanUser(u, fallbackAdded) {
        const o = isObj(u) ? u : {};
        const added = typeof o.added === 'number' ? o.added : Date.parse(o.added);
        return {
            name: clip(o.name, CONFIG.nameMax),
            note: clip(o.note, CONFIG.noteMax),
            added: Number.isFinite(added) ? added : (fallbackAdded || Date.now()),
        };
    }

    function loadUsers() {
        const users = {};
        const raw = load(CONFIG.keys.users, {});
        if (isObj(raw)) {
            for (const [id, u] of Object.entries(raw)) {
                const nid = normalizeUserId(id);
                if (nid) users[nid] = cleanUser(u);
            }
        }
        return users;
    }

    function loadMap(key, valueOk) {
        const out = {};
        const raw = load(key, {});
        if (isObj(raw)) {
            for (const [k, v] of Object.entries(raw)) if (valueOk(k, v)) out[k] = v;
        }
        return out;
    }

    function loadState() {
        const settings = { ...CONFIG.defaultSettings };
        const rawSettings = load(CONFIG.keys.settings, {});
        if (isObj(rawSettings)) {
            if (rawSettings.mode === 'hide' || rawSettings.mode === 'collapse') settings.mode = rawSettings.mode;
            if (typeof rawSettings.dailyRefresh === 'boolean') settings.dailyRefresh = rawSettings.dailyRefresh;
            if (typeof rawSettings.autoResolve === 'boolean') settings.autoResolve = rawSettings.autoResolve;
        }
        return {
            users: loadUsers(),
            ads: loadMap(CONFIG.keys.ads, (k, v) => /^\d{1,15}$/.test(k) && typeof v === 'number'),
            index: loadMap(CONFIG.keys.index, (k, v) => /^\d{1,15}$/.test(k) && typeof v === 'string' && ID_RE.test(v)),
            scanned: loadMap(CONFIG.keys.scanned, (k, v) => ID_RE.test(k) && typeof v === 'number'),
            settings,
        };
    }

    let state = loadState();

    const saveUsers = () => save(CONFIG.keys.users, state.users);
    const saveAds = () => save(CONFIG.keys.ads, state.ads);
    const saveScanned = () => save(CONFIG.keys.scanned, state.scanned);
    const saveSettings = () => save(CONFIG.keys.settings, state.settings);

    // Neue Zuordnungen sammeln und gebündelt speichern. Vor dem Speichern mit dem
    // gespeicherten Stand zusammenführen, damit parallel offene Tabs nichts überschreiben.
    let pendingIndex = {};

    function learn(adId, userId) {
        if (!adId || !userId || !ID_RE.test(userId)) return false;
        if (state.index[adId] === userId) return false;
        state.index[adId] = userId;
        pendingIndex[adId] = userId;
        return true;
    }

    function flushIndex() {
        if (!Object.keys(pendingIndex).length) return;
        const merged = { ...loadMap(CONFIG.keys.index, (k, v) => /^\d{1,15}$/.test(k) && typeof v === 'string'), ...pendingIndex };
        const keys = Object.keys(merged);
        if (keys.length > CONFIG.indexMax) {
            keys.sort((a, b) => Number(a) - Number(b))
                .slice(0, keys.length - CONFIG.indexMax)
                .forEach(k => { delete merged[k]; });
        }
        pendingIndex = {};
        state.index = merged;
        save(CONFIG.keys.index, merged);
    }

    // ------------------------------------------------------------------
    // Anbieter erkennen
    // ------------------------------------------------------------------

    // Anbieter einer Anzeigenseite (live oder per fetch geladen): { id, name, el }
    function findSeller(doc) {
        const collect = (root) => {
            const found = new Map();
            root.querySelectorAll('a[href]').forEach(a => {
                if (a.closest('.kua-ui')) return;
                const id = userIdFromHref(a.getAttribute('href'));
                if (!id) return;
                const entry = found.get(id) || { id, name: '', el: a, count: 0 };
                entry.count++;
                const text = clip(a.textContent, CONFIG.nameMax);
                if (!entry.name && text && !CONFIG.notAName.test(text)) {
                    entry.name = text;
                    entry.el = a;
                }
                found.set(id, entry);
            });
            return Array.from(found.values()).sort((a, b) => b.count - a.count);
        };
        for (const sel of CONFIG.sellerContainers) {
            const box = doc.querySelector(sel);
            if (!box) continue;
            const hits = collect(box);
            if (hits.length) return hits[0];
        }
        // Rückfall: im ganzen Dokument genau ein Anbieter-Link (Bestandsliste vor Shop)
        const all = collect(doc);
        const regular = all.filter(e => !e.id.startsWith('pro:'));
        if (regular.length === 1) return regular[0];
        if (!regular.length && all.length === 1) return all[0];
        return null;
    }

    // Anzeigen-Nummern der Ergebnisliste (Such- oder Bestandslisten-Seite). Bewusst nur die
    // größte Liste – Empfehlungen anderer Anbieter am Rand sollen nicht im Index landen.
    function mainListAdIds(doc) {
        let scope = null;
        for (const sel of CONFIG.resultListSelectors) {
            scope = doc.querySelector(sel);
            if (scope) break;
        }
        const groups = new Map();
        (scope || doc).querySelectorAll('article[data-adid], a[href*="/s-anzeige/"]').forEach(node => {
            const adId = node.getAttribute('data-adid') || getAdIdFromUrl(node.getAttribute('href'));
            if (!adId || !/^\d{1,15}$/.test(adId)) return;
            const list = scope || node.closest('ul, ol') || doc;
            if (!groups.has(list)) groups.set(list, new Set());
            groups.get(list).add(adId);
        });
        let best = new Set();
        groups.forEach(set => { if (set.size > best.size) best = set; });
        return Array.from(best);
    }

    async function fetchDoc(url) {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return new DOMParser().parseFromString(await res.text(), 'text/html');
    }

    // Anbieter einer Anzeige über ihre Seite ermitteln (eine Anfrage, wie beim Öffnen)
    async function resolveSeller(info) {
        const doc = await fetchDoc(info.href.split('#')[0]);
        const seller = findSeller(doc);
        if (seller) {
            learn(info.adId, seller.id);
            flushIndex();
        }
        return seller;
    }

    function nextPageUrl(doc, userId, visited) {
        const candidates = [
            ...doc.querySelectorAll('link[rel="next"], a[rel="next"]'),
            ...Array.from(doc.querySelectorAll('a[href]')).filter(a =>
                CONFIG.nextPageText.test(clip(a.textContent, 20)) || /nächste|weiter/i.test(a.getAttribute('aria-label') || '')),
        ];
        for (const a of candidates) {
            const href = a.getAttribute('href');
            if (!href) continue;
            const url = new URL(href, window.location.origin);
            if (url.origin !== window.location.origin) continue;
            if (normalizeUserId(url.href) !== userId) continue;
            const s = url.pathname + url.search;
            if (!visited.has(s)) return s;
        }
        return null;
    }

    // Bestandsliste eines Anbieters laden und seine Anzeigen im Index vermerken
    const scanning = new Set();

    async function scanSeller(userId) {
        if (scanning.has(userId)) return 0;
        scanning.add(userId);
        try {
            const visited = new Set();
            let url = CONFIG.sellerUrl(userId);
            let count = 0;
            for (let page = 0; url && page < CONFIG.scanMaxPages; page++) {
                if (page) await sleep(CONFIG.requestGapMs);
                visited.add(url);
                const doc = await fetchDoc(url);
                const ids = mainListAdIds(doc);
                ids.forEach(adId => learn(adId, userId));
                count += ids.length;
                url = ids.length ? nextPageUrl(doc, userId, visited) : null;
            }
            state.scanned[userId] = Date.now();
            saveScanned();
            flushIndex();
            return count;
        } finally {
            scanning.delete(userId);
        }
    }

    async function refreshBlockedSellers() {
        if (!state.settings.dailyRefresh) return;
        const now = Date.now();
        const due = Object.keys(state.users)
            .filter(id => now - (state.scanned[id] || 0) > CONFIG.refreshAfterMs)
            .sort((a, b) => (state.scanned[a] || 0) - (state.scanned[b] || 0))
            .slice(0, CONFIG.refreshPerVisit);
        for (const id of due) {
            try {
                await scanSeller(id);
                refreshPage();
            } catch (e) {
                console.warn('[Nutzer ausblenden] Bestandsliste nicht geladen:', id, e);
            }
            await sleep(CONFIG.requestGapMs);
        }
    }

    // ------------------------------------------------------------------
    // Blockieren / Freigeben
    // ------------------------------------------------------------------

    let refreshPage = () => {};

    function blockUser(id, name, note) {
        state.users[id] = cleanUser({ name, note, added: Date.now() });
        saveUsers();
        refreshPage();
        const label = userLabel(id);
        showToast(`„${label}“ blockiert.`, 'ok', [
            { label: 'Rückgängig', onClick: () => { unblockUser(id); hideToast(); } },
        ], 8000);
        scanSeller(id).then(n => {
            refreshPage();
            if (state.users[id]) showToast(`„${label}“ blockiert, ${n} Anzeige${n === 1 ? '' : 'n'} in der Bestandsliste gefunden.`, 'ok', [
                { label: 'Rückgängig', onClick: () => { unblockUser(id); hideToast(); } },
            ], 6000);
        }).catch(e => {
            console.warn('[Nutzer ausblenden] Bestandsliste nicht geladen:', id, e);
        });
    }

    function unblockUser(id) {
        if (!state.users[id]) return;
        delete state.users[id];
        saveUsers();
        refreshPage();
    }

    function hideAd(adId) {
        state.ads[adId] = Date.now();
        saveAds();
        refreshPage();
    }

    function unhideAd(adId) {
        delete state.ads[adId];
        saveAds();
        refreshPage();
    }

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    const blockSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>`;

    const styleEl = document.createElement('style');

    // Die Seite baut Teile des Dokuments nach dem Laden neu auf; dann die Styles erneut einhängen
    function ensureStyles() {
        if (!styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl);
    }

    // Ruft fn gebündelt (einmal pro Frame) auf, sobald sich das Dokument ändert.
    // Beobachtet <html> statt <body>, falls die Seite den <body> selbst austauscht.
    function watchPage(fn) {
        let scheduled = false;
        new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => { scheduled = false; fn(); });
        }).observe(document.documentElement, { childList: true, subtree: true });
    }

    function injectStyles() {
        styleEl.textContent = `
            [data-kua-hidden] { display: none !important; }
            [data-kua-state="collapsed"] > :not(.kua-note-bar) { display: none !important; }
            [data-kua-state="collapsed"] { min-height: 0 !important; height: auto !important; }
            .kua-price-row { display: flex !important; align-items: center; flex-wrap: wrap; gap: 8px; }
            .kua-wrap { margin-left: auto; display: block; }
            .klm-price-row .klm-wrap + .kua-wrap, .kua-price-row .kua-wrap + .klm-wrap { margin-left: 0; }
            .kua-btn {
                display: inline-flex; align-items: center; gap: 5px;
                padding: 4px 10px; border-radius: 999px;
                border: 1px solid #d0d0cc; background: #fff; color: #555;
                font: inherit; font-size: 13px; font-weight: 600; line-height: 20px;
                cursor: pointer; white-space: nowrap; text-decoration: none;
                transition: background-color .15s, border-color .15s, color .15s;
            }
            .kua-btn:hover, .kua-btn:focus-visible { border-color: #1e1e1e; color: #1e1e1e; background: #f2f1ee; outline: none; }
            .kua-btn[data-state="blocked"] { border-color: #1e1e1e; background: #1e1e1e; color: #fff; }
            .kua-btn svg { flex: none; }

            .kua-note-bar {
                display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
                padding: 8px 12px; margin: 0; border: 1px dashed #c9c7c2; border-radius: 8px;
                background: #f7f6f3; color: #555; font-size: 13px; line-height: 1.4; text-align: left;
            }
            .kua-note-bar[data-kind="revealed"] { border-style: solid; margin-bottom: 6px; }
            .kua-note-bar .kua-note-text { flex: 1 1 200px; min-width: 0; }
            .kua-note-bar button {
                padding: 2px 10px; border-radius: 999px; border: 1px solid #c9c7c2; background: #fff;
                color: #1e1e1e; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
            }
            .kua-note-bar button:hover, .kua-note-bar button:focus-visible { border-color: #1e1e1e; outline: none; }

            .kua-pill {
                position: fixed; left: 16px; bottom: 16px; z-index: 2147482500;
                display: inline-flex; align-items: center; gap: 6px;
                padding: 6px 12px; border-radius: 999px; border: 1px solid #d0d0cc;
                background: #fff; color: #1e1e1e; font: inherit; font-size: 13px; font-weight: 600;
                box-shadow: 0 4px 14px rgba(0,0,0,.15); cursor: pointer;
            }
            .kua-pill:hover, .kua-pill:focus-visible { border-color: #1e1e1e; outline: none; }

            .kua-toast, .kua-bar {
                position: fixed; left: 50%; transform: translateX(-50%);
                z-index: 2147483000; max-width: min(620px, calc(100vw - 32px)); box-sizing: border-box;
                display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px;
                padding: 10px 14px; border-radius: 10px;
                background: #1e1e1e; color: #fff; font: inherit; font-size: 14px; line-height: 1.4;
                box-shadow: 0 8px 24px rgba(0,0,0,.25);
            }
            .kua-toast { bottom: 76px; }
            .kua-bar { bottom: 16px; z-index: 2147482900; }
            .kua-toast[data-kind="ok"] { background: #2e7d32; }
            .kua-toast[data-kind="warn"] { background: #8a4b00; }
            .kua-toast-text { flex: 1 1 220px; }
            .kua-toast button, .kua-bar button {
                padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,.6);
                background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer;
            }
            .kua-toast button:hover, .kua-bar button:hover { background: rgba(255,255,255,.15); }

            .kua-pop, .kua-panel {
                box-sizing: border-box; background: #fff; color: #1e1e1e;
                border: 1px solid #d0d0cc; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.22);
                font: inherit; font-size: 14px; line-height: 1.4; text-align: left;
            }
            .kua-pop { position: absolute; z-index: 2147482000; max-height: calc(100vh - 32px); overflow: auto; }
            .kua-pop *, .kua-panel *, .kua-pop *::before, .kua-panel *::before, .kua-pop *::after, .kua-panel *::after { box-sizing: border-box; }
            .kua-overlay {
                position: fixed; inset: 0; z-index: 2147483100; background: rgba(0,0,0,.4);
                display: grid; place-items: center; padding: 16px;
            }
            .kua-panel { width: min(640px, 100%); max-height: calc(100vh - 32px); overflow: auto; }
            .kua-head {
                position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px;
                padding: 10px 10px 10px 14px; background: #fff; border-bottom: 1px solid #eceae6;
            }
            .kua-title { flex: 1; min-width: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .kua-body { padding: 12px 14px 14px; display: grid; gap: 12px; }
            .kua-section { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid #eceae6; }
            section.kua-section:first-of-type { padding-top: 0; border-top: 0; }
            .kua-section h3 { margin: 0; font-size: 15px; font-weight: 700; }
            .kua-pop button, .kua-pop input, .kua-pop textarea,
            .kua-panel button, .kua-panel input, .kua-panel textarea { font: inherit; font-size: 14px; color: inherit; }
            .kua-icon-btn {
                flex: none; width: 32px; height: 32px; display: inline-grid; place-items: center;
                border: 0; border-radius: 8px; background: transparent; cursor: pointer; font-size: 18px; line-height: 1;
            }
            .kua-icon-btn:hover, .kua-icon-btn:focus-visible { background: #f2f1ee; outline: none; }
            .kua-field { display: grid; gap: 4px; }
            .kua-field > span { font-size: 12px; font-weight: 600; color: #555; }
            .kua-input { width: 100%; padding: 8px 10px; border: 1px solid #c9c7c2; border-radius: 8px; background: #fff; }
            .kua-input:focus { outline: 2px solid #1e1e1e; outline-offset: -1px; }
            textarea.kua-input { resize: vertical; min-height: 80px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important; font-size: 12px !important; }
            .kua-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
            .kua-row .kua-input { flex: 1 1 160px; width: auto; }
            .kua-spacer { flex: 1; }
            .kua-action {
                padding: 7px 14px; border-radius: 999px; border: 1px solid #c9c7c2; background: #fff;
                font-weight: 600; cursor: pointer; white-space: nowrap;
            }
            .kua-action:hover:not(:disabled), .kua-action:focus-visible { border-color: #1e1e1e; outline: none; }
            .kua-action[data-primary] { background: #1e1e1e; border-color: #1e1e1e; color: #fff; }
            .kua-action[data-primary]:hover:not(:disabled) { background: #000; }
            .kua-action[data-danger]:hover:not(:disabled) { border-color: #c62828; color: #c62828; }
            .kua-action:disabled { opacity: .45; cursor: not-allowed; }
            .kua-link { padding: 0; border: 0; background: none; color: #555; text-decoration: underline; font-size: 13px; cursor: pointer; }
            .kua-link:hover { color: #1e1e1e; }
            .kua-hint, .kua-muted { margin: 0; font-size: 12px; color: #6b6b6b; }
            .kua-note { margin: 0; padding: 8px 10px; border-radius: 8px; background: #f2f1ee; font-size: 13px; }
            .kua-note[data-kind="error"] { background: #fdecea; color: #8e1c1c; }
            .kua-note[data-kind="ok"] { background: #edf7ee; color: #1f5e23; }
            .kua-check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; cursor: pointer; }
            .kua-check input { margin: 2px 0 0; accent-color: #1e1e1e; flex: none; }
            .kua-users { display: grid; gap: 6px; max-height: 320px; overflow: auto; }
            .kua-user { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border: 1px solid #e3e1dc; border-radius: 8px; }
            .kua-user-main { flex: 1; min-width: 0; display: grid; gap: 4px; }
            .kua-user-main a { font-weight: 600; color: inherit; overflow-wrap: anywhere; }
            .kua-user .kua-input { padding: 4px 8px; font-size: 13px; }
        `;
        ensureStyles();
    }

    // ------------------------------------------------------------------
    // Hinweise (Toast) und feste Leiste
    // ------------------------------------------------------------------

    let toastTimer = null;

    function showToast(text, kind, actions = [], autoHideMs = 0) {
        hideToast();
        const toast = el('div', { className: 'kua-ui kua-toast', role: 'status', dataset: kind ? { kind } : null },
            el('span', { className: 'kua-toast-text' }, text),
            actions.map(a => el('button', { type: 'button', onclick: a.onClick }, a.label)),
            el('button', { type: 'button', 'aria-label': 'Hinweis schließen', onclick: hideToast }, '×'));
        document.body.appendChild(toast);
        if (autoHideMs) toastTimer = setTimeout(hideToast, autoHideMs);
    }

    function hideToast() {
        clearTimeout(toastTimer);
        document.querySelectorAll('.kua-toast').forEach(t => t.remove());
    }

    function setBar(content) {
        document.querySelectorAll('.kua-bar').forEach(b => b.remove());
        if (content) document.body.appendChild(el('div', { className: 'kua-ui kua-bar', role: 'status' }, content));
    }

    // ------------------------------------------------------------------
    // Menü an einer Anzeige (Ausblenden / Blockieren)
    // ------------------------------------------------------------------

    let pop = null; // { root, btn, cleanup }

    function closePopover() {
        if (!pop) return;
        pop.cleanup();
        pop.root.remove();
        const btn = pop.btn;
        pop = null;
        if (btn.isConnected) btn.focus({ preventScroll: true });
    }

    function positionPopover() {
        const { root, btn } = pop;
        const r = btn.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        const width = Math.min(380, vw - 32);
        root.style.width = width + 'px';
        const left = Math.min(Math.max(16, r.right - width), vw - 16 - width);
        const h = root.offsetHeight;
        const below = r.bottom + 8;
        const top = (below + h > vh - 8 && r.top - 8 - h > 8) ? r.top - 8 - h : below;
        root.style.left = (left + window.scrollX) + 'px';
        root.style.top = (top + window.scrollY) + 'px';
    }

    function headBar(title, onClose) {
        return el('div', { className: 'kua-head' },
            el('span', { className: 'kua-title', title }, title),
            el('button', { type: 'button', className: 'kua-icon-btn', 'aria-label': 'Schließen', title: 'Schließen', onclick: onClose }, '×'));
    }

    // info: { adId, href, title, userId?, sellerName? }
    function openPopover(info, btn) {
        if (pop && pop.btn === btn) { closePopover(); return; }
        closePopover();
        closePanel();

        const root = el('div', { className: 'kua-ui kua-pop', role: 'dialog', 'aria-label': 'Ausblenden oder blockieren' });
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePopover(); } };
        const onOutside = (e) => { if (pop && !root.contains(e.target) && !btn.contains(e.target)) closePopover(); };
        const onResize = () => pop && positionPopover();
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', onOutside, true);
        window.addEventListener('resize', onResize);
        pop = {
            root, btn,
            cleanup: () => {
                document.removeEventListener('keydown', onKey, true);
                document.removeEventListener('pointerdown', onOutside, true);
                window.removeEventListener('resize', onResize);
            },
        };
        document.body.appendChild(root);

        const name = el('input', { className: 'kua-input', type: 'text', maxLength: CONFIG.nameMax, placeholder: 'Name (optional)' });
        const note = el('input', { className: 'kua-input', type: 'text', maxLength: CONFIG.noteMax, placeholder: 'z. B. Lockpreise, Betrugsverdacht' });
        const status = el('p', { className: 'kua-note', role: 'status', hidden: true });
        let resolving = false;

        const showStatus = (msg, kind) => {
            status.hidden = !msg;
            status.textContent = msg || '';
            if (kind) status.dataset.kind = kind; else delete status.dataset.kind;
        };

        const render = () => {
            if (!pop || pop.root !== root) return;
            const uid = info.userId;
            const blocked = uid && state.users[uid];
            const adHidden = info.adId && state.ads[info.adId];
            const sellerText = uid
                ? `Anbieter: ${userLabel(uid, info.sellerName)}${uid.startsWith('pro:') ? '' : ` (ID ${uid})`}`
                : resolving ? 'Anbieter wird ermittelt …' : 'Anbieter unbekannt';

            const parts = [el('p', { className: 'kua-muted' }, sellerText)];
            if (blocked) {
                parts.push(el('p', { className: 'kua-note', dataset: { kind: 'ok' } },
                    `Blockiert seit ${fmtDate(blocked.added)}${blocked.note ? ` · ${blocked.note}` : ''}`));
                parts.push(el('div', { className: 'kua-row' },
                    el('span', { className: 'kua-spacer' }),
                    el('button', { type: 'button', className: 'kua-action', onclick: () => { unblockUser(uid); render(); } }, 'Anbieter freigeben')));
            } else {
                if (!name.value && info.sellerName) name.value = info.sellerName;
                parts.push(
                    el('label', { className: 'kua-field' }, el('span', {}, 'Name in deiner Liste'), name),
                    el('label', { className: 'kua-field' }, el('span', {}, 'Notiz (nur für dich)'), note),
                    el('div', { className: 'kua-row' },
                        el('span', { className: 'kua-spacer' }),
                        el('button', { type: 'button', className: 'kua-action', dataset: { primary: '' }, disabled: !uid,
                            onclick: () => { blockUser(uid, name.value, note.value); closePopover(); } }, 'Anbieter blockieren')));
            }
            parts.push(status);
            if (info.adId && !isDetailPage) {
                parts.push(el('div', { className: 'kua-row' },
                    adHidden
                        ? el('button', { type: 'button', className: 'kua-link', onclick: () => { unhideAd(info.adId); closePopover(); } }, 'Diese Anzeige nicht mehr ausblenden')
                        : el('button', { type: 'button', className: 'kua-link', onclick: () => { hideAd(info.adId); closePopover(); } }, 'Nur diese Anzeige ausblenden')));
            }
            parts.push(el('div', { className: 'kua-row' },
                el('button', { type: 'button', className: 'kua-link', onclick: () => { closePopover(); openPanel(); } }, 'Blockliste verwalten …')));

            root.replaceChildren(headBar(info.title ? `Ausblenden: ${info.title}` : 'Ausblenden', closePopover),
                el('div', { className: 'kua-body' }, parts));
            positionPopover();
        };

        render();
        root.scrollIntoView({ block: 'nearest' });
        (root.querySelector('[data-primary]:not(:disabled)') || root.querySelector('.kua-icon-btn')).focus({ preventScroll: true });

        if (!info.userId && info.href) {
            resolving = true;
            render();
            resolveSeller(info).then(seller => {
                resolving = false;
                if (seller) {
                    info.userId = seller.id;
                    info.sellerName = seller.name;
                    refreshPage();
                } else {
                    showStatus('Der Anbieter ließ sich auf der Anzeigenseite nicht erkennen. Du kannst die Anzeige trotzdem einzeln ausblenden.', 'error');
                }
                render();
            }).catch(() => {
                resolving = false;
                showStatus('Die Anzeigenseite konnte nicht geladen werden. Du kannst die Anzeige trotzdem einzeln ausblenden.', 'error');
                render();
            });
        }
    }

    // ------------------------------------------------------------------
    // Übersicht: Karten finden, ausblenden, Buttons einfügen
    // ------------------------------------------------------------------

    function findAdCards() {
        const cards = new Set();

        // Klassisches Layout
        document.querySelectorAll('article.aditem[data-adid]').forEach(c => cards.add(c));

        // Generisch: vom Anzeigen-Link so weit nach oben laufen, wie der Container
        // nur Links auf genau diese eine Anzeige enthält -> das ist die Karte.
        document.querySelectorAll('a[href*="/s-anzeige/"]').forEach(link => {
            if (link.closest('.kua-ui, article.aditem[data-adid]')) return;
            const adId = getAdIdFromUrl(link.href);
            if (!adId) return;
            let card = null;
            let node = link.parentElement;
            while (node && node !== document.body && containsOnlyAd(node, adId)) {
                card = node;
                node = node.parentElement;
            }
            if (card) cards.add(card);
        });

        return Array.from(cards);
    }

    function containsOnlyAd(node, adId) {
        return Array.from(node.querySelectorAll('a[href*="/s-anzeige/"]'))
            .every(a => getAdIdFromUrl(a.href) === adId);
    }

    const cardInfos = new WeakMap();

    function getCardInfo(card) {
        if (cardInfos.has(card)) return cardInfos.get(card);
        const link = card.querySelector('a[href*="/s-anzeige/"]');
        const rawHref = card.dataset.href || (link ? link.getAttribute('href') : null);
        const href = rawHref ? new URL(rawHref, window.location.origin).href : null;
        const adId = card.dataset.adid || getAdIdFromUrl(href);
        if (!href || !adId) return null;
        const titleEl = card.querySelector('h2, h3, .text-module-begin a, .ellipsis');
        const title = clip(titleEl ? titleEl.textContent : (link ? link.textContent : ''), 120);
        // Falls die Karte selbst auf den Anbieter verlinkt, gleich übernehmen
        const cardSeller = Array.from(card.querySelectorAll('a[href]'))
            .map(a => userIdFromHref(a.getAttribute('href'))).find(Boolean) || null;
        const info = { href, adId, title, cardSeller };
        cardInfos.set(card, info);
        return info;
    }

    // Preis-Bestandteile: "2 €", "3.399 €", "VB", "Zu verschenken", "ab"
    const pricePartsRe = /\d[\d.,]*\s*€|zu verschenken|VB|ab/gi;

    function isPriceOnly(text) {
        const t = text.trim();
        return t.length > 0 && /€|zu verschenken/i.test(t) && t.replace(pricePartsRe, '').replace(/\s+/g, '') === '';
    }

    function findPriceRow(card) {
        const classic = card.querySelector('.aditem-main--middle--price-shipping');
        if (classic) return classic;
        const first = Array.from(card.querySelectorAll('p, span, div, strong, b'))
            .find(n => n.children.length === 0 && !n.closest('.kua-ui') && isPriceOnly(n.textContent));
        if (!first) return null;
        let row = first;
        while (row.parentElement && row.parentElement !== card && isPriceOnly(row.parentElement.textContent)) {
            row = row.parentElement;
        }
        return row;
    }

    // Beim Ganz-Ausblenden auch das umgebende <li> ausblenden, sonst bleiben Lücken
    function hideTarget(card, adId) {
        const li = card.parentElement && card.parentElement.closest('li');
        return li && li !== card && containsOnlyAd(li, adId) ? li : card;
    }

    const revealed = new Set(); // in dieser Sitzung vorübergehend eingeblendete Anzeigen

    function cardButton(info) {
        const btn = guardedButton({ className: 'kua-btn', title: 'Anzeige oder Anbieter ausblenden',
            onclick: () => openPopover(info, btn) });
        btn.innerHTML = `${blockSvg}<span>Ausblenden</span>`;
        return btn;
    }

    function noteBar(kind, text, actions) {
        const bar = el('div', { className: 'kua-ui kua-note-bar', dataset: { kind } },
            el('span', { className: 'kua-note-text' }, text),
            actions.map(a => guardedButton({ onclick: a.onClick }, a.label)));
        guard(bar);
        return bar;
    }

    function applyCard(card) {
        const info = getCardInfo(card);
        if (!info) return null;
        if (info.cardSeller) learn(info.adId, info.cardSeller);
        info.userId = info.cardSeller || state.index[info.adId] || null;

        let reason = null;
        if (info.userId && state.users[info.userId] && info.userId !== pageSellerId) reason = 'user';
        else if (state.ads[info.adId]) reason = 'ad';

        const mode = !reason ? 'visible' : revealed.has(info.adId) ? 'revealed' : state.settings.mode === 'hide' ? 'hidden' : 'collapsed';
        const label = reason === 'user' ? userLabel(info.userId) : '';
        const sig = [mode, reason, info.userId, label].join('|');

        // Button neben dem Preis – erneut einsetzen, falls die Seite die Karte neu aufgebaut hat
        const wrap = card.querySelector(':scope .kua-wrap');
        if (!wrap) {
            const row = findPriceRow(card);
            if (row) {
                row.classList.add('kua-price-row');
                row.appendChild(el('span', { className: 'kua-ui kua-wrap' }, cardButton(info)));
            }
        } else if (!wrap.parentElement.classList.contains('kua-price-row')) {
            wrap.parentElement.classList.add('kua-price-row');
        }

        // Neu zeichnen, wenn sich der Zustand geändert hat oder die Seite unsere Änderungen entfernt hat
        const bar = card.querySelector(':scope > .kua-note-bar');
        const intact = card.dataset.kuaSig === sig
            && (card.dataset.kuaState || 'visible') === (mode === 'hidden' ? 'visible' : mode)
            && !!bar === (mode === 'collapsed' || mode === 'revealed')
            && hideTarget(card, info.adId).hasAttribute('data-kua-hidden') === (mode === 'hidden');
        if (!intact) {
            card.dataset.kuaSig = sig;
            card.removeAttribute('data-kua-state');
            hideTarget(card, info.adId).removeAttribute('data-kua-hidden');
            card.querySelectorAll(':scope > .kua-note-bar').forEach(b => b.remove());

            const unblock = reason === 'user'
                ? { label: 'Anbieter freigeben', onClick: () => unblockUser(info.userId) }
                : { label: 'Nicht mehr ausblenden', onClick: () => unhideAd(info.adId) };
            const what = reason === 'user' ? `Anzeige von „${label}“ (blockiert)` : `„${info.title || 'Anzeige ' + info.adId}“`;

            if (mode === 'hidden') {
                hideTarget(card, info.adId).setAttribute('data-kua-hidden', '');
            } else if (mode === 'collapsed') {
                card.dataset.kuaState = 'collapsed';
                card.prepend(noteBar('collapsed', `Ausgeblendet: ${what}`, [
                    { label: 'Kurz zeigen', onClick: () => { revealed.add(info.adId); refreshPage(); } },
                    unblock,
                ]));
            } else if (mode === 'revealed') {
                card.dataset.kuaState = 'revealed';
                card.prepend(noteBar('revealed', reason === 'user' ? `Von „${label}“ (blockiert)` : 'Von dir ausgeblendet', [
                    { label: 'Wieder einklappen', onClick: () => { revealed.delete(info.adId); refreshPage(); } },
                    unblock,
                ]));
            }
        }
        return { info, mode };
    }

    let pill = null;

    function updatePill(hiddenCount) {
        if (!pill) pill = el('button', { type: 'button', className: 'kua-ui kua-pill', onclick: () => openPanel() });
        if (!pill.isConnected) document.body.appendChild(pill);
        const text = hiddenCount ? `${hiddenCount} ausgeblendet` : 'Blockliste';
        if (pill.dataset.text !== text) {
            pill.dataset.text = text;
            pill.innerHTML = blockSvg;
            pill.append(el('span', {}, text));
            pill.title = 'Blockliste verwalten';
        }
    }

    // Unbekannte Anbieter im Hintergrund ermitteln (nur, wenn eingeschaltet)
    const resolveQueue = [];
    const queued = new Set();
    let resolveBusy = false;

    async function pumpResolveQueue() {
        if (resolveBusy) return;
        resolveBusy = true;
        try {
            while (resolveQueue.length && state.settings.autoResolve) {
                const info = resolveQueue.shift();
                if (!state.index[info.adId]) {
                    try { await resolveSeller(info); } catch (e) { /* nächste */ }
                    refreshPage();
                    await sleep(CONFIG.requestGapMs);
                }
            }
        } finally {
            resolveBusy = false;
        }
    }

    function applyOverview() {
        ensureStyles();
        let hiddenCount = 0;
        for (const card of findAdCards()) {
            const res = applyCard(card);
            if (!res) continue;
            if (res.mode === 'hidden' || res.mode === 'collapsed') hiddenCount++;
            if (!res.info.userId && state.settings.autoResolve && !queued.has(res.info.adId) && queued.size < CONFIG.autoResolveMax) {
                queued.add(res.info.adId);
                resolveQueue.push(res.info);
            }
        }
        flushIndex();
        updatePill(hiddenCount);
        if (resolveQueue.length) pumpResolveQueue();
        if (isSellerPage) renderSellerBar();
    }

    function renderSellerBar() {
        if (!pageSellerId) return;
        const blocked = state.users[pageSellerId];
        const key = blocked ? 'b' : 'u';
        const bar = document.querySelector('.kua-bar');
        if (bar && bar.dataset.key === key) return;
        const info = { adId: null, href: null, title: userLabel(pageSellerId), userId: pageSellerId };
        const btn = el('button', { type: 'button' }, blocked ? 'Freigeben' : 'Anbieter blockieren');
        btn.addEventListener('click', () => (blocked ? unblockUser(pageSellerId) : openPopover(info, btn)));
        setBar([
            el('span', { className: 'kua-toast-text' }, blocked
                ? `Diesen Anbieter hast du blockiert (seit ${fmtDate(blocked.added)}). Seine Anzeigen werden in der Suche ausgeblendet.`
                : 'Bestandsliste dieses Anbieters.'),
            btn,
            el('button', { type: 'button', onclick: () => openPanel() }, 'Blockliste'),
        ]);
        document.querySelector('.kua-bar').dataset.key = key;
    }

    function runOverview() {
        // Auf der Bestandsliste gehören alle Anzeigen der Liste zu diesem Anbieter
        if (pageSellerId) mainListAdIds(document).forEach(adId => learn(adId, pageSellerId));

        refreshPage = () => { closeStalePopover(); applyOverview(); };
        applyOverview();
        watchPage(applyOverview);

        setTimeout(() => refreshBlockedSellers(), 3000);
    }

    // Das Menü bleibt offen, solange sein Button noch auf der Seite ist
    function closeStalePopover() {
        if (pop && !pop.btn.isConnected) closePopover();
    }

    // ------------------------------------------------------------------
    // Anzeigenseite
    // ------------------------------------------------------------------

    // Der Anbieter-Kasten kann nach dem Laden noch nachgerendert werden: kurz darauf warten
    function runDetail() {
        if (findSeller(document)) { setupDetail(); return; }
        const obs = new MutationObserver(() => {
            if (!findSeller(document)) return;
            obs.disconnect();
            clearTimeout(timer);
            setupDetail();
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        const timer = setTimeout(() => obs.disconnect(), 15000);
    }

    function setupDetail() {
        const adId = getAdIdFromUrl(window.location.href);
        const seller = findSeller(document);
        if (!seller) return;
        learn(adId, seller.id);
        flushIndex();

        const h1 = document.querySelector('#viewad-title, h1');
        const info = {
            adId, href: window.location.href.split('#')[0],
            title: clip(h1 ? h1.textContent : '', 120),
            userId: seller.id, sellerName: seller.name,
        };

        // Zwei Bedienelemente: ein Button am Anbieter-Namen und ein fester Button unten links.
        // Der feste Button hängt direkt am <body> und funktioniert auch dann, wenn die Seite
        // den Anbieter-Kasten neu aufbaut und den Button dort wieder entfernt.
        const btn = guardedButton({ className: 'kua-ui kua-btn', style: 'margin-left:8px;vertical-align:middle',
            onclick: () => openPopover(info, btn) });
        const fab = el('button', { type: 'button', className: 'kua-ui kua-pill', onclick: () => openPopover(info, fab) });
        let barClosed = false;
        let reinserts = 0;

        const paint = () => {
            const blocked = state.users[seller.id];
            const label = blocked ? 'Blockiert' : 'Blockieren';
            btn.dataset.state = blocked ? 'blocked' : 'idle';
            btn.innerHTML = `${blockSvg}<span>${label}</span>`;
            btn.title = blocked ? 'Du hast diesen Anbieter blockiert' : 'Diesen Anbieter blockieren';
            fab.innerHTML = blockSvg;
            fab.append(el('span', {}, blocked ? 'Anbieter blockiert' : 'Anbieter blockieren'));
            fab.title = btn.title;
            setBar(blocked && !barClosed ? [
                el('span', { className: 'kua-toast-text' }, `Diese Anzeige stammt von „${userLabel(seller.id, seller.name)}“, den du blockiert hast.`),
                el('button', { type: 'button', onclick: () => unblockUser(seller.id) }, 'Freigeben'),
                el('button', { type: 'button', onclick: () => openPanel() }, 'Blockliste'),
                el('button', { type: 'button', 'aria-label': 'Hinweis schließen', onclick: () => { barClosed = true; setBar(null); } }, '×'),
            ] : null);
        };

        // Fehlt etwas (Styles, Buttons, Leiste), wieder einsetzen. Entfernt die Seite den Button
        // am Namen immer wieder, wird es nach 20 Versuchen dort aufgegeben (der feste Button bleibt).
        const ensure = () => {
            ensureStyles();
            if (!fab.isConnected) document.body.appendChild(fab);
            if (!btn.isConnected && reinserts < 20) {
                const again = findSeller(document);
                if (again && again.id === seller.id) {
                    again.el.insertAdjacentElement('afterend', btn);
                    reinserts++;
                }
            }
            if (state.users[seller.id] && !barClosed && !document.querySelector('.kua-bar')) paint();
        };

        seller.el.insertAdjacentElement('afterend', btn);
        refreshPage = () => { closeStalePopover(); paint(); ensure(); };
        refreshPage();
        watchPage(ensure);
    }

    // ------------------------------------------------------------------
    // Blockliste: Export / Import
    // ------------------------------------------------------------------

    function exportJson() {
        const users = Object.entries(state.users)
            .sort((a, b) => a[1].added - b[1].added)
            .map(([id, u]) => ({ id, name: u.name, note: u.note, added: new Date(u.added).toISOString() }));
        return JSON.stringify({
            format: CONFIG.listFormat,
            version: CONFIG.listFormatVersion,
            title: 'Meine Kleinanzeigen-Blockliste',
            exported: new Date().toISOString(),
            users,
            ads: Object.keys(state.ads),
        }, null, 2) + '\n';
    }

    function exportText() {
        const lines = [
            '! Titel: Meine Kleinanzeigen-Blockliste',
            `! Format: ${CONFIG.listFormat} ${CONFIG.listFormatVersion}`,
            `! Exportiert: ${new Date().toISOString()}`,
            '# Eine Zeile pro Anbieter: <Nutzer-ID> [Name] [# Notiz]',
            '# Einzelne Anzeigen: anzeige:<Anzeigen-Nr>',
        ];
        Object.entries(state.users)
            .sort((a, b) => a[1].added - b[1].added)
            .forEach(([id, u]) => {
                let line = id;
                if (u.name) line += ' ' + u.name.replace(/#/g, '');
                if (u.note) line += '  # ' + u.note;
                lines.push(line);
            });
        Object.keys(state.ads).forEach(adId => lines.push(`anzeige:${adId}`));
        return lines.join('\n') + '\n';
    }

    // Liest JSON- oder Textlisten. Liefert { title, users: [{id,name,note,added}], ads: [], invalid }
    function parseList(input) {
        const text = String(input || '').replace(/^﻿/, '').trim();
        const out = { title: '', users: [], ads: [], invalid: 0 };
        const addUser = (raw) => {
            const entry = typeof raw === 'string' ? { id: raw } : raw;
            const id = isObj(entry) ? normalizeUserId(entry.id) : null;
            if (!id) { out.invalid++; return; }
            out.users.push({ id, ...cleanUser(entry) });
        };
        const addAd = (raw) => {
            const adId = /^\d{1,15}$/.test(String(raw)) ? String(raw) : getAdIdFromUrl(raw);
            if (adId) out.ads.push(adId); else out.invalid++;
        };

        if (text.startsWith('{') || text.startsWith('[')) {
            let data;
            try { data = JSON.parse(text); } catch (e) { throw new Error('Die JSON-Datei ist fehlerhaft.'); }
            if (Array.isArray(data)) data = { users: data };
            if (!isObj(data)) throw new Error('Unbekanntes Format.');
            if (data.format && data.format !== CONFIG.listFormat) throw new Error(`Unbekanntes Listenformat „${String(data.format).slice(0, 40)}“.`);
            out.title = clip(data.title, 120);
            (Array.isArray(data.users) ? data.users : []).forEach(addUser);
            (Array.isArray(data.ads) ? data.ads : []).forEach(addAd);
            return out;
        }

        for (const rawLine of text.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line) continue;
            if (line.startsWith('!')) {
                const m = line.match(/^!\s*(?:titel|title)\s*:\s*(.+)$/i);
                if (m) out.title = clip(m[1], 120);
                continue;
            }
            if (line.startsWith('#')) continue;
            const hash = line.indexOf('#');
            const main = (hash >= 0 ? line.slice(0, hash) : line).trim();
            const note = hash >= 0 ? line.slice(hash + 1).trim() : '';
            const token = main.split(/\s+/)[0];
            const adMatch = token.match(/^anzeige:(\d{1,15})$/i);
            if (adMatch || getAdIdFromUrl(token)) { addAd(adMatch ? adMatch[1] : token); continue; }
            const id = normalizeUserId(token);
            if (!id) { out.invalid++; continue; }
            out.users.push({ id, ...cleanUser({ name: main.slice(token.length), note }) });
        }
        return out;
    }

    function importList(list, replace) {
        const result = { added: 0, existing: 0, ads: 0 };
        if (replace) {
            state.users = {};
            state.ads = {};
        }
        for (const u of list.users) {
            const cur = state.users[u.id];
            if (cur) {
                result.existing++;
                if (!cur.name && u.name) cur.name = u.name;
                if (!cur.note && u.note) cur.note = u.note;
            } else {
                state.users[u.id] = { name: u.name, note: u.note, added: u.added };
                result.added++;
            }
        }
        for (const adId of list.ads) {
            if (!state.ads[adId]) { state.ads[adId] = Date.now(); result.ads++; }
        }
        saveUsers();
        saveAds();
        refreshPage();
        return result;
    }

    function download(filename, text, type) {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = el('a', { href: url, download: filename, style: 'display:none' });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            const ta = el('textarea', { value: text, style: 'position:fixed;left:-9999px;top:0' });
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            ta.remove();
            return ok;
        }
    }

    // ------------------------------------------------------------------
    // Verwaltung (Dialog)
    // ------------------------------------------------------------------

    let panel = null; // { overlay, box, note, cleanup }

    function closePanel() {
        if (!panel) return;
        panel.cleanup();
        panel.overlay.remove();
        panel = null;
    }

    function openPanel() {
        closePopover();
        closePanel();
        const box = el('div', { className: 'kua-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Blockliste' });
        const overlay = el('div', { className: 'kua-ui kua-overlay' }, box);
        overlay.addEventListener('pointerdown', e => { if (e.target === overlay) closePanel(); });
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } };
        document.addEventListener('keydown', onKey, true);
        panel = { overlay, box, note: null, cleanup: () => document.removeEventListener('keydown', onKey, true) };
        document.body.appendChild(overlay);
        renderPanel();
        const first = box.querySelector('input');
        if (first) first.focus();
    }

    function renderPanel() {
        if (!panel) return;
        const { box } = panel;
        const scrollTop = box.scrollTop;
        const ids = Object.keys(state.users);
        const adCounts = {};
        Object.values(state.index).forEach(uid => { if (state.users[uid]) adCounts[uid] = (adCounts[uid] || 0) + 1; });

        // --- Anbieter hinzufügen
        const addId = el('input', { className: 'kua-input', type: 'text', placeholder: 'Nutzer-ID oder Link zur Bestandsliste', 'aria-label': 'Nutzer-ID oder Link' });
        const addName = el('input', { className: 'kua-input', type: 'text', maxLength: CONFIG.nameMax, placeholder: 'Name (optional)', 'aria-label': 'Name' });
        const addStatus = el('p', { className: 'kua-note', role: 'status', hidden: true });
        const doAdd = () => {
            const id = normalizeUserId(addId.value);
            if (!id) {
                addStatus.hidden = false;
                addStatus.dataset.kind = 'error';
                addStatus.textContent = 'Keine gültige Nutzer-ID. Erwartet wird z. B. 12345678 oder ein Link wie …/s-bestandsliste.html?userId=12345678.';
                return;
            }
            if (state.users[id]) {
                addStatus.hidden = false;
                addStatus.dataset.kind = 'ok';
                addStatus.textContent = `„${userLabel(id)}“ ist bereits blockiert.`;
                return;
            }
            blockUser(id, addName.value, '');
            renderPanel();
        };
        addId.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

        // --- Liste
        const filter = el('input', { className: 'kua-input', type: 'search', placeholder: 'Liste durchsuchen', 'aria-label': 'Liste durchsuchen' });
        const listBox = el('div', { className: 'kua-users' });
        const drawList = () => {
            const q = filter.value.trim().toLowerCase();
            const rows = ids
                .filter(id => state.users[id])
                .sort((a, b) => state.users[b].added - state.users[a].added)
                .filter(id => !q || [id, state.users[id].name, state.users[id].note].join(' ').toLowerCase().includes(q))
                .map(id => {
                    const u = state.users[id];
                    const noteInput = el('input', { className: 'kua-input', type: 'text', value: u.note, maxLength: CONFIG.noteMax,
                        placeholder: 'Notiz', 'aria-label': `Notiz zu ${userLabel(id)}`,
                        onchange: (e) => { if (state.users[id]) { state.users[id].note = clip(e.target.value, CONFIG.noteMax); saveUsers(); } } });
                    const known = adCounts[id] || 0;
                    return el('div', { className: 'kua-user' },
                        el('div', { className: 'kua-user-main' },
                            el('a', { href: CONFIG.sellerUrl(id), target: '_blank', rel: 'noopener' }, userLabel(id)),
                            el('span', { className: 'kua-muted' },
                                `${id.startsWith('pro:') ? 'Shop' : 'ID ' + id} · seit ${fmtDate(u.added)} · ${known} bekannte Anzeige${known === 1 ? '' : 'n'}`
                                + (state.scanned[id] ? ` · Bestandsliste geprüft ${fmtDate(state.scanned[id])}` : '')),
                            noteInput),
                        el('button', { type: 'button', className: 'kua-action', dataset: { danger: '' },
                            onclick: () => { unblockUser(id); renderPanel(); } }, 'Freigeben'));
                });
            listBox.replaceChildren(...(rows.length ? rows : [el('p', { className: 'kua-hint' },
                ids.length ? 'Keine Treffer.' : 'Noch niemand blockiert. Nutze „Ausblenden“ an einer Anzeige oder füge oben eine Nutzer-ID hinzu.')]));
        };
        filter.addEventListener('input', drawList);
        drawList();

        // --- Einzelne Anzeigen
        const hiddenAds = Object.keys(state.ads).length;

        // --- Einstellungen
        const setting = (key, value) => { state.settings[key] = value; saveSettings(); refreshPage(); };
        const modeRadio = (value, text) => el('label', { className: 'kua-check' },
            el('input', { type: 'radio', name: 'kua-mode', value, checked: state.settings.mode === value,
                onchange: () => setting('mode', value) }), el('span', {}, text));
        const checkbox = (key, text) => el('label', { className: 'kua-check' },
            el('input', { type: 'checkbox', checked: state.settings[key], onchange: (e) => setting(key, e.target.checked) }),
            el('span', {}, text));

        // --- Import / Export
        const importText = el('textarea', { className: 'kua-input', rows: 4, spellcheck: false,
            placeholder: 'Liste hier einfügen (JSON oder eine Nutzer-ID pro Zeile)', 'aria-label': 'Liste zum Importieren' });
        const replaceBox = el('input', { type: 'checkbox' });
        const ioStatus = el('p', { className: 'kua-note', role: 'status', hidden: true });
        const showIo = (msg, kind) => {
            ioStatus.hidden = false;
            ioStatus.textContent = msg;
            if (kind) ioStatus.dataset.kind = kind; else delete ioStatus.dataset.kind;
        };
        const runImport = (text) => {
            let list;
            try { list = parseList(text); } catch (e) { showIo(e.message, 'error'); return; }
            if (!list.users.length && !list.ads.length) {
                showIo(`Keine Einträge gefunden${list.invalid ? ` (${list.invalid} ungültige Zeilen)` : ''}.`, 'error');
                return;
            }
            if (replaceBox.checked && !window.confirm('Die bisherige Blockliste wird vollständig ersetzt. Fortfahren?')) return;
            const r = importList(list, replaceBox.checked);
            renderPanel();
            showPanelNote(`Import${list.title ? ` „${list.title}“` : ''}: ${r.added} neu, ${r.existing} bereits vorhanden`
                + `${r.ads ? `, ${r.ads} einzelne Anzeigen` : ''}${list.invalid ? `, ${list.invalid} ungültig übersprungen` : ''}.`
                + (r.added ? ' Die Bestandslisten der neuen Anbieter werden nach und nach geladen.' : ''), 'ok');
            if (r.added) refreshBlockedSellers().then(() => renderPanel());
        };
        const fileInput = el('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', hidden: true,
            onchange: async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { showIo('Die Datei ist zu groß (max. 2 MB).', 'error'); return; }
                runImport(await file.text());
                e.target.value = '';
            } });
        const stamp = new Date().toISOString().slice(0, 10);

        const body = el('div', { className: 'kua-body' },
            el('div', { className: 'kua-note', role: 'status', hidden: !panel.note, dataset: panel.note && panel.note.kind ? { slot: 'note', kind: panel.note.kind } : { slot: 'note' } },
                panel.note ? panel.note.msg : ''),
            el('section', { className: 'kua-section' },
                el('h3', {}, `Blockierte Anbieter (${ids.length})`),
                el('div', { className: 'kua-row' }, addId, addName,
                    el('button', { type: 'button', className: 'kua-action', dataset: { primary: '' }, onclick: doAdd }, 'Blockieren')),
                addStatus,
                ids.length > 5 ? filter : null,
                listBox),
            el('section', { className: 'kua-section' },
                el('h3', {}, 'Einzeln ausgeblendete Anzeigen'),
                el('div', { className: 'kua-row' },
                    el('span', { className: 'kua-spacer' }, `${hiddenAds} Anzeige${hiddenAds === 1 ? '' : 'n'}`),
                    el('button', { type: 'button', className: 'kua-action', disabled: !hiddenAds,
                        onclick: () => {
                            if (!window.confirm('Alle einzeln ausgeblendeten Anzeigen wieder einblenden?')) return;
                            state.ads = {}; saveAds(); refreshPage(); renderPanel();
                        } }, 'Alle wieder einblenden'))),
            el('section', { className: 'kua-section' },
                el('h3', {}, 'Darstellung'),
                modeRadio('collapse', 'Einklappen: eine Hinweiszeile bleibt stehen (mit „Kurz zeigen“ und „Freigeben“)'),
                modeRadio('hide', 'Ganz ausblenden: die Anzeige verschwindet aus der Liste'),
                el('h3', {}, 'Erkennung'),
                checkbox('dailyRefresh', 'Bestandslisten blockierter Anbieter einmal täglich neu laden, damit auch neue Anzeigen erkannt werden (empfohlen)'),
                checkbox('autoResolve', 'Unbekannte Anzeigen der Übersicht im Hintergrund prüfen (lädt dafür bis zu 30 Anzeigenseiten pro Seitenaufruf)')),
            el('section', { className: 'kua-section' },
                el('h3', {}, 'Export und Import'),
                el('div', { className: 'kua-row' },
                    el('button', { type: 'button', className: 'kua-action',
                        onclick: () => download(`kleinanzeigen-blockliste-${stamp}.json`, exportJson(), 'application/json') }, 'Als JSON speichern'),
                    el('button', { type: 'button', className: 'kua-action',
                        onclick: () => download(`kleinanzeigen-blockliste-${stamp}.txt`, exportText(), 'text/plain') }, 'Als Textliste speichern'),
                    el('button', { type: 'button', className: 'kua-action',
                        onclick: async () => showIo(await copyText(exportText()) ? 'Textliste in die Zwischenablage kopiert.' : 'Kopieren nicht möglich.', null) }, 'Kopieren')),
                el('div', { className: 'kua-row' },
                    el('button', { type: 'button', className: 'kua-action', onclick: () => fileInput.click() }, 'Datei importieren …'),
                    fileInput,
                    el('label', { className: 'kua-check' }, replaceBox, el('span', {}, 'Bisherige Liste ersetzen statt ergänzen'))),
                importText,
                el('div', { className: 'kua-row' },
                    el('span', { className: 'kua-spacer' }),
                    el('button', { type: 'button', className: 'kua-action', onclick: () => runImport(importText.value) }, 'Eingefügte Liste importieren')),
                ioStatus,
                el('p', { className: 'kua-hint' }, 'Gespeichert wird nur lokal in deinem Browser bzw. in deinem Userscript-Manager. Es werden keine Daten an fremde Server gesendet.')),
            el('p', { className: 'kua-hint' }, `Nutzer ausblenden ${VERSION} · `,
                el('a', { href: 'https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden', target: '_blank', rel: 'noopener' }, 'Projektseite')));

        box.replaceChildren(headBar('Blockliste', closePanel), body);
        box.scrollTop = scrollTop;
    }

    // Bleibt beim Neuzeichnen stehen (z. B. wenn danach Bestandslisten fertig geladen sind)
    function showPanelNote(msg, kind) {
        if (!panel) return;
        panel.note = { msg, kind };
        const slot = panel.box.querySelector('[data-slot="note"]');
        if (!slot) return;
        slot.hidden = false;
        slot.textContent = msg;
        if (kind) slot.dataset.kind = kind;
        panel.box.scrollTop = 0;
    }

    // ------------------------------------------------------------------
    // Änderungen aus anderen Tabs übernehmen
    // ------------------------------------------------------------------

    function onExternalChange() {
        const pending = pendingIndex;
        state = loadState();
        Object.assign(state.index, pending);
        refreshPage();
        if (panel) renderPanel();
    }

    function watchStorage() {
        const keys = [CONFIG.keys.users, CONFIG.keys.ads, CONFIG.keys.settings];
        if (hasGM && typeof GM_addValueChangeListener === 'function') {
            keys.forEach(k => GM_addValueChangeListener(k, (name, oldValue, newValue, remote) => { if (remote) onExternalChange(); }));
        } else if (!hasGM) {
            window.addEventListener('storage', e => { if (keys.includes(e.key)) onExternalChange(); });
        }
    }

    // ------------------------------------------------------------------
    // Start
    // ------------------------------------------------------------------

    injectStyles();
    watchStorage();
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Blockliste verwalten', () => openPanel());
    }

    if (isDetailPage) {
        runDetail();
    } else {
        runOverview();
    }
})();
