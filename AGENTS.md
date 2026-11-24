# Regole di progetto — PRJ_COLOGNO1_QR

Web app Next.js 15 / React 19 / TypeScript per la registrazione presenze dell'**Assemblea dei Soci del Gruppo Scout Cologno Monzese 1 (27/11/2026)** tramite Google Sheets (`Liste_Assemblea`, foglio `Presenze`).

Queste regole sono permanenti e si applicano a qualunque modello o agente operi su questo repository.

## 1. Documentazione e allineamento continuo

- **Lettura obbligatoria all'avvio**: all'inizio di ogni sessione leggere integralmente tutti i file `.md` in `docs/` (`docs/PROGETTO.md`, `docs/SETUP.md` ed eventuali ulteriori documenti).
- **Aggiornamento dopo ogni modifica rilevante**: dopo ogni intervento significativo su architettura, flusso utente, API, area amministratore, schema colonne o variabili d'ambiente, aggiornare coerentemente i file `.md` in `docs/` (inclusa la sezione `Cronologia` e `Questioni aperte` in `docs/PROGETTO.md`, `docs/SETUP.md` e `.env.example`).

## 2. Privacy e protezione dei dati personali

- **Nessun dato personale reale nel repo, nei log o nei test**: non inserire mai dati personali reali in codice, commenti, test, mock, log (`console.log` / `console.error`), messaggi d'errore o commit Git. Non aprire né committare file locali sensibili (`*.xlsx`, `*.xls`, `*.csv`, `.env.local`, `json/`, chiavi `*service-account*.json` / `*-key.json`).
- **Risposte API pubbliche minime**: `/api/lookup` e `/api/register` devono restituire solo i campi del riepilogo (`nome`, `cognome`, `dataNascita`, `luogoNascita`, `email`, più `kids`, `adultKids` e `coTutors` con soli `nome`, `cognome`, `dataNascita`, `registered`, e per stato `minor` i `tutors` con soli `nome`, `cognome`, `dataNascita`, `luogoNascita`, `registered`). Non restituire mai elenchi in blocco, credenziali, `Codice Fiscale`, `Cellulare`, `USER_IP` (colonna `N`, salvato solo sul foglio e mai esposto) o `ID_UNIQUE` di altri.
- **Nessuna riemissione di `ID_UNIQUE`**: se una persona risulta già registrata (`Presenza = TRUE`), non effettuare nuove scritture e restituire esclusivamente stato `already` e `timestamp` (mai `ID_UNIQUE`).
- **Report Admin (`lib/report.ts`, `/api/report`, `/api/report/unregister`)**: esporre esclusivamente `codiceSocio`, `nome`, `cognome`, `dataNascita`, `luogoNascita`, `tipo`, `presente`. **Mai** includere `ID_UNIQUE`, `USER_IP`, `email`, `Codice Fiscale` o `Cellulare`.
- **Gestione Associati Admin (`lib/associates.ts`, `/api/associates*`)**: l'elenco tabellare (`/api/associates`) espone solo `rowNumber`, `fingerprint`, `codiceSocio`, `nome`, `cognome`, `dataNascita`, `luogoNascita`, `tipo`, `adultoGiovane`, `votante` (mai CF, cellulare, email, data delibera, ID o IP in blocco). I dettagli completi (inclusi `Codice Fiscale`, `Cellulare`, `Email`, `Data Delibera Ammissione`, `Votante`) vengono restituiti solo on-demand per singola riga (`/api/associates/detail` / `/api/associates/update`), **mai** `ID_UNIQUE` o `USER_IP`, e le scritture/cancellazioni richiedono sempre verifica dell'impronta della riga dopo rilettura (`getRows()`). I nuovi inserimenti (`/api/associates/create`) avvengono solo con verifica duplicati dopo rilettura e con `Presenza = FALSE`.
- **Indicizzazione e cache**: mantenere `robots: { index: false, follow: false }` (`noindex`) e `Cache-Control: no-store` su tutte le risposte API.

## 3. Sicurezza, concorrenza e integrità su Google Sheets

- **Verifica codici lato server a tempo costante**: verificare `ACCESS_CODE` e `ADMIN_CODE` esclusivamente lato server tramite hash crittografico e confronto a tempo costante (`timingSafeEqual` in `lib/server.ts`). In produzione, senza variabile impostata l'accesso deve essere sempre negato.
- **Rate limit e validazione lato server**: mantenere il rate limiting su tutte le API (`/api/access`, `/api/lookup`, `/api/register`, `/api/stats`, `/api/report`, `/api/config`, `/api/report/lookup`, `/api/report/register`, `/api/report/unregister`, `/api/associates`, `/api/associates/detail`, `/api/associates/update`, `/api/associates/delete`, `/api/associates/create`), validare rigorosamente gli input lato server (`parseInput`, `validateAssociateUpdate`, `validateCreateSocio`, `validateCreateTutor`) e restituire errori generici senza rivelare dettagli interni.
- **Prevenzione race condition (read-before-write)**: prima di ogni scrittura in `register()` (`lib/service.ts`), rileggere sempre le righe aggiornate da Google Sheets (`store.getRows()`), ricontrollare che la persona non sia già registrata e verificare l'unicità di `ID_UNIQUE` (8 caratteri `A–Z0–9` generati con RNG crittografico `node:crypto`).
- **Gestione collegata Tutori e Ragazzi**: quando si registra un `Tutore`, scrivere le sue righe (anche eventuale riga `Socio Adulto` o altri `Codice Socio`) e **solo** le righe `Tipo = Socio` minorenni (`< 18 anni`) collegate con lo stesso `Codice Socio` che hanno `presente = false`, con lo stesso `ID_UNIQUE`, `USER_IP` e `timestamp` (fuso `Europe/Rome`), **senza mai modificare le righe di altri `Tutore`** (né di figli già maggiorenni) e **senza mai sovrascrivere** le righe già registrate (`presente = true`). Se la stessa persona compare su più righe, mantenerle coerenti.

## 4. Modalità mock e verifica obbligatoria

- **Sincronizzazione di `lib/mock.ts`**: mantenere sempre allineati `fakeRows()` e `MockSheetStore` (`MOCK_SHEET=1`) con `SheetRow`, `SheetStore` e il comportamento di `GoogleSheetStore`, usando esclusivamente dati interamente fittizi.
- **Test obbligatori**: eseguire sempre `npm run test` (Vitest) dopo ogni intervento sulla logica (`lib/`, `app/api/`, o componenti con logica applicativa) e verificare che tutti i test passino prima di concludere. Aggiungere o aggiornare test in `tests/` (solo dati fittizi) per ogni nuova funzionalità o correzione.
