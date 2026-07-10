# Kikin Stempel

Einfache mobile PWA zur Zeiterfassung. Kika kann die App öffnen, auf `Einstempeln` oder `Ausstempeln` tippen, einen Tag manuell korrigieren und den Monat als CSV für Excel exportieren.

## Einrichtung

1. In Supabase kannst du ein bestehendes Projekt verwenden.
2. Führe im SQL-Editor den Inhalt von `supabase.sql` aus; dadurch wird die Tabelle `stempeln_work_entries` erstellt, damit sich die Daten nicht mit anderen Apps mischen.
3. Aktiviere in Supabase den Auth-Provider Google oder zumindest den E-Mail-Magic-Link.
4. Setze unter `Authentication -> URL Configuration` die Site URL auf die GitHub-Pages-Adresse, zum Beispiel `https://tomasbernik.github.io/stempeln/`.
5. Füge dieselbe Adresse zu den Redirect URLs hinzu.
6. Trage in `config.js` `SUPABASE_URL` und `SUPABASE_ANON_KEY` aus Project Settings -> API ein.
7. Pushe das Repo zu GitHub und aktiviere GitHub Pages vom Branch `main`.

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

## Quellen

Die Implementierung verwendet Supabase JavaScript Auth OAuth Redirect sowie das Database-Upsert/Select-Muster aus den offiziellen Supabase-Dokumenten:

- https://supabase.com/docs/reference/javascript/auth-signinwithoauth
- https://supabase.com/docs/reference/javascript/upsert
- https://supabase.com/docs/guides/auth/social-login/auth-google
