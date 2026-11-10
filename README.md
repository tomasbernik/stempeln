# Kikin Stempel

Einfache mobile PWA zur Zeiterfassung. Kika kann die App öffnen, auf `Einstempeln` oder `Ausstempeln` tippen, einen Tag manuell korrigieren und den Monat als Excel-Datei exportieren oder per E-Mail teilen.

## Neon-Einrichtung

Die Anwendung verwendet das separate Neon-Projekt `bold-forest-85779959`:

- Neon Auth mit numerischem E-Mail-OTP
- Neon Data API und RLS für `public.stempeln_work_entries`
- GitHub Pages unter `https://tomasbernik.github.io/stempeln/`

Die öffentlichen Endpunkte stehen in `neon-config.js`. `neon-sdk.js` wird aus
`neon-client-source.js` und `@neondatabase/neon-js` erzeugt; die Produktion ist
damit nicht von einer externen JavaScript-CDN abhängig.

## Lokal starten

Die statischen Dateien lassen sich über einen lokalen Server öffnen:

```powershell
python -m http.server 4187 --bind 127.0.0.1
```

Öffne danach `http://127.0.0.1:4187/`.

## Installation am Handy

Nach dem Öffnen der GitHub-Pages-Adresse am Handy kannst du im Browser `Add to Home Screen` / `Zum Startbildschirm hinzufügen` verwenden. Die App hat ein Manifest und einen Service Worker, verhält sich also wie eine installierbare Web-App.

## Export

`Export Excel` lädt eine `.xls`-Datei für den ausgewählten Monat herunter. `Excel per E-Mail` übergibt dieselbe Excel-Datei an die mobile Dateifreigabe, wenn der Browser sie unterstützt; sonst wird sie heruntergeladen.

## Wochenstunden

Der Stundenplan gilt pro Datum bei fünf Arbeitstagen pro Woche: bis September
2026 jeweils 3:15 h von Montag bis Freitag (16,25 h/Woche). Ab 1. Oktober 2026
gelten montags und freitags 4:45 h sowie dienstags bis donnerstags 3:15 h
(19,25 h/Woche). Weitere Änderungen lassen sich unter „Wochenstunden ändern“
mit einem Gültigkeitsdatum speichern. Der
Überstundensaldo wird kumulativ ab 1. Juni 2026 berechnet und summiert die für
jeden Wochentag gültigen Sollminuten; spätere Änderungen verändern frühere Tage
nicht. Urlaub, Krankheit und Feiertage schreiben ohne Zeitangaben den für den
jeweiligen Wochentag gültigen Tagessollwert wie einen normalen Arbeitstag gut.
Bei Arbeit zählen dagegen ausschließlich die tatsächlich erfassten Zeiten.
Dadurch erscheinen Abwesenheitsstunden im Monat und Export, ohne das Saldo zu
verändern. Bruchteile von Minuten werden erst für den gesamten
Berechnungszeitraum gerundet.

Zusätzliche Pläne werden pro Benutzer in Neon gespeichert und über Geräte
synchronisiert. Beim ersten Laden nach der Migration werden vorhandene lokale
Pläne ergänzt, ohne abweichende Neon-Werte still zu überschreiben. Die lokale
Kopie bleibt als Sicherung erhalten. Die beiden Vorgaben für 2026 sind fest
hinterlegt und bleiben erhalten.

Prüfen: `node --test tests/target-history.test.cjs`
