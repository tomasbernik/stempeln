# Kikin Stempel

Jednoducha PWA dochadzka pre mobil. Kika vie otvorit appku, klepnut na `Einstempeln` alebo `Ausstempeln`, manualne opravit den a exportovat mesiac do CSV pre Excel.

## Co treba nastavit

1. V Supabase vytvor novy projekt.
2. V SQL editore spusti obsah suboru `supabase.sql`.
3. V Supabase zapni Auth provider Google alebo aspon email magic link.
4. V `Authentication -> URL Configuration` nastav Site URL na GitHub Pages adresu, napriklad `https://tomasbernik.github.io/stempeln/`.
5. Do Redirect URLs pridaj tu istu adresu.
6. V `config.js` dopln `SUPABASE_URL` a `SUPABASE_ANON_KEY` z Project Settings -> API.
7. Pushni repo na GitHub a zapni GitHub Pages z branchu `main`.

## Lokalne spustenie

Staticke subory sa daju otvorit cez lokalny server:

```powershell
python -m http.server 4187 --bind 127.0.0.1
```

Potom otvor `http://127.0.0.1:4187/`.

## Instalacia do mobilu

Po otvoreni GitHub Pages adresy v mobile pouzi v prehliadaci `Add to Home Screen` / `Pridat na plochu`. Appka ma manifest a service worker, takze sa bude spravat ako instalovatelna webova appka.

## Export

`Export CSV` stiahne subor za vybrany mesiac. `Zdielat` pouzije mobilne zdielanie suborov, ak ho prehliadac podporuje; inak subor stiahne.

## Zdroje

Implementacia pouziva Supabase JavaScript Auth OAuth redirect a database upsert/select vzor podla oficialnych Supabase docs:

- https://supabase.com/docs/reference/javascript/auth-signinwithoauth
- https://supabase.com/docs/reference/javascript/upsert
- https://supabase.com/docs/guides/auth/social-login/auth-google
