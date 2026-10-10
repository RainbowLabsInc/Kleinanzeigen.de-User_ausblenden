<div align="center">

<img src="assets/logo.png" alt="RainbowlabsInc" width="96">

# 🚫 Kleinanzeigen – Nutzer ausblenden

**Eine eigene Blockliste für Kleinanzeigen.de: Anzeigen von Anbietern, die du blockierst, verschwinden aus deinen Suchergebnissen.**

[![Version](https://img.shields.io/badge/version-0.1.3-blue?style=flat-square)](https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden/raw/main/script.user.js)
[![Plattform](https://img.shields.io/badge/plattform-Kleinanzeigen.de-green?style=flat-square)](https://www.kleinanzeigen.de)
[![Userscript](https://img.shields.io/badge/Tampermonkey-Violentmonkey-black?style=flat-square&logo=tampermonkey)](#%EF%B8%8F-installation)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20RainbowlabsInc-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/rainbowlabsinc)

*Chrome · Firefox · Edge · Kein Server · Kein Tracking · Liste exportieren und importieren*

</div>

---

Manche Anbieter tauchen in jeder Suche wieder auf: mit Lockpreisen wie **„2 € VB“**, mit „nur Tausch“-Anzeigen oder mit Dutzenden fast gleichen Inseraten. Kleinanzeigen bietet keine Möglichkeit, diese Anbieter in der Suche auszublenden.

**Dieses Userscript ergänzt eine Blockliste.** Neben dem Preis jeder Anzeige sitzt ein Button „Ausblenden“. Damit blockierst du den Anbieter oder blendest nur diese eine Anzeige aus. Alle Anzeigen blockierter Anbieter werden danach eingeklappt oder verschwinden ganz. Die Liste lässt sich exportieren, weitergeben und importieren, ähnlich wie eine Filterliste gegen Werbung.

<p align="center">
  <img src="assets/vorschau-menue.png" alt="Menü am Button Ausblenden: Anbieter erkannt, Name und Notiz, Button Anbieter blockieren" width="480">
  <br><sub>Das Menü am Button „Ausblenden“ (Darstellung an einer nachgebauten Seite).</sub>
</p>

<p align="center">
  <img src="assets/vorschau-liste.png" alt="Suchergebnisse: zwei Anzeigen des blockierten Anbieters sind eingeklappt" width="480">
  <br><sub>Nach dem Blockieren: Beide Anzeigen des Anbieters sind eingeklappt, die anderen bleiben sichtbar.</sub>
</p>

---

## ✨ Features

* 🚫 **Anbieter blockieren:** Ein Klick auf „Ausblenden“ neben dem Preis öffnet ein kleines Menü. Das Script ermittelt den Anbieter, du gibst ihm optional einen Namen und eine Notiz, fertig.
* 🙈 **Einzelne Anzeigen ausblenden:** Wenn dich nur eine Anzeige stört und nicht der ganze Anbieter.
* 📋 **Einklappen oder ganz ausblenden:** Standardmäßig bleibt eine schmale Hinweiszeile mit „Kurz zeigen“ und „Freigeben“ stehen. Wer will, lässt die Anzeigen ganz verschwinden.
* 🔎 **Auch auf der Anzeigenseite:** Am Anbieter-Namen und unten links steht ein Button „Blockieren“. Bei blockierten Anbietern erscheint unten ein Hinweis.
* 📒 **Verwaltung:** Über den Button „Blockliste“ unten links (oder das Tampermonkey-Menü) siehst du alle blockierten Anbieter mit Notiz, Datum und Zahl der bekannten Anzeigen. Du kannst auch eine Nutzer-ID oder einen Link zur Bestandsliste direkt eintragen.
* 💾 **Export und Import:** als JSON-Datei, als Textliste oder über die Zwischenablage. Beim Import wird ergänzt, auf Wunsch ersetzt.
* 🔄 **Mehrere Tabs:** Änderungen gelten sofort auch in anderen offenen Kleinanzeigen-Tabs.
* 🔒 **Strikt begrenzt:** läuft nur auf `https://www.kleinanzeigen.de` und dort nur auf Seiten unter `/s-…` (Suche, Anzeigen, Bestandslisten).

<p align="center">
  <img src="assets/vorschau-verwaltung.png" alt="Verwaltung der Blockliste mit Anbieterliste, Darstellung, Erkennung sowie Export und Import" width="480">
  <br><sub>Die Verwaltung der Blockliste.</sub>
</p>

---

## ⚙️ Installation

**Schritt 1: Userscript-Erweiterung installieren** (kostenlos)

| Browser | Erweiterung |
|---|---|
| Chrome / Edge | [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) oder [Violentmonkey](https://chrome.google.com/webstore/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag) |
| Firefox | [Tampermonkey](https://addons.mozilla.org/de/firefox/addon/tampermonkey/) oder [Violentmonkey](https://addons.mozilla.org/de/firefox/addon/violentmonkey/) |

> **Chrome/Edge:** Bei neueren Tampermonkey-Versionen muss in den Erweiterungs-Details „Benutzerskripte zulassen“ bzw. der Entwicklermodus aktiviert sein.

**Schritt 2: Script installieren**

[![Installieren](https://img.shields.io/badge/Installieren-Nutzer%20ausblenden-1e1e1e?style=for-the-badge&logo=tampermonkey)](https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden/raw/main/script.user.js)

*(Alternativ: Inhalt von `script.user.js` kopieren und in Tampermonkey als neues Skript einfügen.)*

Updates holt sich Tampermonkey automatisch aus diesem Repo. Das Script verträgt sich mit [Kleinanzeigen – Anzeige melden](https://github.com/RainbowLabsInc/Kleinanzeigen.de_Anzeige_melden): Beide Buttons stehen dann nebeneinander in der Preiszeile.

---

## 🛠️ Bedienung

1. Ganz normal auf Kleinanzeigen suchen. Ein Login ist nicht nötig.
2. Bei einer störenden Anzeige neben dem Preis auf **„Ausblenden“** klicken.
3. Im Menü wird der Anbieter ermittelt. Optional Name und Notiz anpassen, dann **„Anbieter blockieren“**. Oder **„Nur diese Anzeige ausblenden“**.
4. Ein Hinweis unten zeigt, wie viele Anzeigen des Anbieters gefunden wurden. Mit **„Rückgängig“** lässt sich das sofort zurücknehmen.

**Freigeben:** in der Hinweiszeile einer eingeklappten Anzeige, im Menü am Button, auf der Anzeigenseite oder in der Verwaltung.

---

## 🔧 Wie es technisch funktioniert

Kleinanzeigen zeigt in den Suchergebnissen in der Regel nicht an, **wer** eine Anzeige eingestellt hat. Das Script merkt sich deshalb, welche Anzeige zu welchem Anbieter gehört (der **Anzeigen-Index**, lokal gespeichert).

| Situation | Was passiert |
|---|---|
| Klick auf „Ausblenden“ | Das Script lädt die Anzeigenseite, wie beim normalen Öffnen, und liest den Anbieter aus dem Link zu seiner Bestandsliste (`/s-bestandsliste.html?userId=…`). Gewerbliche Shops ohne diesen Link werden über `/pro/<shop>` erkannt. |
| „Anbieter blockieren“ | Die Bestandsliste des Anbieters wird einmal geladen (höchstens 5 Seiten). Alle dort gelisteten Anzeigen kommen in den Index und werden sofort ausgeblendet. |
| Neue Anzeigen eines blockierten Anbieters | Die Bestandslisten blockierter Anbieter werden höchstens einmal am Tag neu geladen, pro Seitenaufruf für höchstens 3 Anbieter. Das lässt sich in der Verwaltung abschalten. |
| Anzeige oder Bestandsliste öffnen | Die Zuordnung wird nebenbei gelernt, ohne zusätzliche Anfrage. |
| Optional: „Unbekannte Anzeigen im Hintergrund prüfen“ | Standardmäßig **aus**. Wenn eingeschaltet, lädt das Script bis zu 30 Anzeigenseiten pro Seitenaufruf nacheinander (mit Pause), um auch Anzeigen zu erkennen, die in keiner geladenen Bestandsliste standen. |
| Ausblenden | Die Anzeigen-Karte bekommt nur ein Attribut und eine Hinweiszeile. Die Seite selbst wird nicht verändert, nachgeladene Ergebnisse werden per `MutationObserver` erfasst. |

Gespeichert wird im Speicher des Userscript-Managers (`GM_setValue`). Fehlt der, nutzt das Script den `localStorage` von kleinanzeigen.de. Alle Selektoren und Grenzwerte stehen gesammelt im `CONFIG`-Block am Anfang von `script.user.js`.

---

## 📄 Listenformat

Die Blockliste lässt sich in zwei Formaten austauschen. Beide werden beim Import automatisch erkannt.

**Textliste** (ähnlich einer Filterliste, gut zum Pflegen von Hand):

```text
! Titel: Meine Kleinanzeigen-Blockliste
# Kommentarzeilen beginnen mit # oder !
# Eine Zeile pro Anbieter: <Nutzer-ID> [Name] [# Notiz]
12345678 Beispielname  # Lockpreise
https://www.kleinanzeigen.de/s-bestandsliste.html?userId=87654321
pro:beispiel-shop
# Einzelne Anzeigen:
anzeige:3500000000
```

* Eine Nutzer-ID ist die Zahl aus dem Link zur Bestandsliste eines Anbieters („Weitere Anzeigen“ auf der Anzeigenseite). Statt der Zahl darf auch der ganze Link in der Zeile stehen.
* `pro:<shop>` steht für gewerbliche Shops mit eigener Seite unter `kleinanzeigen.de/pro/<shop>`.
* Ungültige Zeilen werden beim Import übersprungen und gezählt.

**JSON** (vollständig, mit Datum):

```json
{
  "format": "kleinanzeigen-blockliste",
  "version": 1,
  "title": "Meine Kleinanzeigen-Blockliste",
  "exported": "2026-10-10T12:00:00.000Z",
  "users": [
    { "id": "12345678", "name": "Beispielname", "note": "Lockpreise", "added": "2026-10-10T11:00:00.000Z" }
  ],
  "ads": ["3500000000"]
}
```

Beide Formate sind schlichte Textdateien. Eine gemeinsame Liste kann also später einfach als Datei auf einem Server oder in einem GitHub-Repo liegen (siehe [Ideen für später](#%EF%B8%8F-ideen-für-später)).

---

## 🧪 Getestet

| Browser | Erweiterung | Stand |
|---|---|---|
| Chromium | (Testumgebung mit nachgebauten Seiten) | ✅ Blockieren, Einklappen, Ganz ausblenden, Kurz zeigen, Freigeben, einzelne Anzeigen, Shops (`/pro/`), Anzeigenseite, Bestandsliste, Export und Import (Text, JSON, Ersetzen, fehlerhafte Dateien), Speicher über `GM_setValue` und `localStorage` |
| Firefox / Chrome / Edge | Tampermonkey / Violentmonkey | ⏳ **noch nicht auf der Live-Seite getestet** |

> **Wichtig für Version 0.1.0:** Das Script wurde bisher nur an nachgebauten Seiten getestet. Wo genau Kleinanzeigen den Anbieter-Link auf der Anzeigenseite und die Ergebnisliste auf der Bestandsliste ablegt, ist aus dem echten HTML noch nicht bestätigt. Die Erkennung ist bewusst breit angelegt (erst feste Bereiche wie `#viewad-contact`, dann der einzige Link zu einer Bestandsliste auf der Seite). Wenn ein Anbieter nicht erkannt wird, hilft ein Issue.

Funktioniert etwas nicht, hilft ein [Issue](https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden/issues) mit:

1. einem Screenshot und dem Link zur betroffenen Seite,
2. dem HTML des betroffenen Elements (DevTools → Element → Rechtsklick → *Copy → Copy outerHTML*), z. B. des Anbieter-Kastens auf der Anzeigenseite.

Bitte **keine** Cookies, Tokens oder persönlichen Daten mitschicken.

---

## 📋 Versionen

| Version | Änderungen |
|---|---|
| **0.1.3** | Gewerbliche Anbieter: Schreibweise der Shop-Adresse (`/pro/<Shop>`) bleibt erhalten, damit die Shop-Seite beim Einlesen gefunden wird; Händler-Kasten `#viewad-bizteaser` als bekannter Bereich |
| **0.1.2** | Anzeigenseite: zusätzlich ein fester Button „Anbieter blockieren“ unten links, der auch dann bleibt, wenn die Seite den Anbieter-Kasten neu aufbaut. Styles, Buttons und Hinweise werden wieder eingesetzt, auch wenn die Seite größere Teile des Dokuments austauscht |
| **0.1.1** | Button auf der Anzeigenseite verschwand kurz nach dem Laden: Wird der Anbieter-Kasten von der Seite neu aufgebaut, setzt das Script den Button wieder ein. Ebenso für Buttons und Hinweiszeilen in den Suchergebnissen |
| **0.1.0** | Erste Version: Anbieter blockieren, einzelne Anzeigen ausblenden, Einklappen oder ganz Ausblenden, Verwaltung mit Notizen, Export und Import (JSON und Textliste), Anzeigen-Index mit täglicher Aktualisierung der Bestandslisten |

---

## 🗺️ Ideen für später

* **Gemeinsame Listen abonnieren:** Eine oder mehrere Listen-URLs eintragen (z. B. eine Datei in einem GitHub-Repo), die das Script regelmäßig abruft, ähnlich wie Filterlisten in Werbeblockern. Dafür braucht das Script die Berechtigung `GM_xmlhttpRequest` für die jeweilige Adresse. Abonnierte Einträge würden getrennt von der eigenen Liste geführt, damit man sie einzeln ausnehmen kann.
* Anbieter nach Merkmalen ausblenden (z. B. nur gewerbliche Anbieter, bestimmte Orte).
* Browser-Extension (Chrome/Edge/Firefox) auf Basis desselben Codes.

---

## ⚖️ Disclaimer

> Dieses Skript ist ein inoffizielles Tool und steht in keiner Verbindung zu Kleinanzeigen. Die Nutzung erfolgt auf eigene Gefahr. Blockieren wirkt nur in deinem Browser: Der Anbieter erfährt davon nichts, und seine Anzeigen bleiben für alle anderen sichtbar.

* Es liest keine Passwörter oder Nachrichten aus und sendet nichts an fremde Server.
* An Kleinanzeigen stellt es nur lesende Anfragen, wie beim normalen Öffnen einer Seite: die Anzeigenseite beim Klick auf „Ausblenden“ und die Bestandslisten blockierter Anbieter (siehe [Wie es technisch funktioniert](#-wie-es-technisch-funktioniert)).
* Blockliste, Notizen und Anzeigen-Index liegen nur lokal im Speicher deines Userscript-Managers bzw. Browsers.
* Es läuft **ausschließlich auf `https://www.kleinanzeigen.de`**, und dort nur auf Seiten unter `/s-…`. Auf allen anderen Websites ist es inaktiv.
* Aufbau und Teile des Codes (Erkennung der Anzeigen-Karten und der Preiszeile) stammen aus [Kleinanzeigen – Anzeige melden](https://github.com/RainbowLabsInc/Kleinanzeigen.de_Anzeige_melden).

---

## ☕ Unterstütze das Projekt

<a href="https://ko-fi.com/rainbowlabsinc" target="_blank">
  <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi" height="36">
</a>

Dieses Userscript ist ein kostenloses Open-Source-Hobbyprojekt. Wenn es dir Zeit und Nerven bei der Suche auf Kleinanzeigen spart, freue ich mich über einen Kaffee.

---

## 📄 Lizenz

MIT License: frei nutzbar, veränderbar und weitergebbar. Siehe [LICENSE](LICENSE).

---

<div align="center">

**Made with ❤️ by RainbowlabsInc**

[Installieren](https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden/raw/main/script.user.js) · [Issues](https://github.com/RainbowLabsInc/Kleinanzeigen.de-User_ausblenden/issues) · [☕ Spenden](https://ko-fi.com/rainbowlabsinc)

</div>
