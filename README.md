# Kikin Stempel

Einfache mobile PWA zur Zeiterfassung. Kika kann die App öffnen, auf `Einstempeln` oder `Ausstempeln` tippen, einen Tag manuell korrigieren und den Monat als CSV für Excel exportieren.

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

`Export CSV` lädt die Datei für den ausgewählten Monat herunter. `Teilen` nutzt die mobile Dateifreigabe, wenn der Browser sie unterstützt; sonst wird die Datei heruntergeladen.
