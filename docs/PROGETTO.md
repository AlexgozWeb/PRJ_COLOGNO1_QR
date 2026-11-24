# PRJ_COLOGNO1_QR — Registrazione presenze Assemblea dei Soci

## 1. Idea
Web app (Vercel) raggiungibile inquadrando un QR code, per registrare la presenza dei soci all'**Assemblea dei Soci del 27/11/2026** (Cologno 1). I dati risiedono in un Google Sheet su Drive (`Liste_Assemblea`) con tre fogli:

| Foglio | Contenuto |
|---|---|
| Libro associati | Elenco associati |
| Votanti | Elenco aventi diritto al voto |
| **Presenze** | Unione dei due elenchi + colonne di registrazione (unico foglio letto/scritto per le presenze) |
| **Config** | Parametri di configurazione (`parameter`, `value from`, `value to`; es. `REGISTRATIONS_CLOSED` = `1`/`0`) |

**Colonne di scrittura** nel foglio Presenze: **L** = Presenza (TRUE), **M** = ID_UNIQUE, **N** = USER_IP (indirizzo IP dell'utente, salvato solo nel foglio e **mai mostrato** in alcuna schermata né restituito dalle API), **O** = TIMESTAMP. Colonna **P** = Votante.

## 2. Flusso utente
1. **Loading** con insegna/logo Cologno 1.
2. **Landing** con grafica mobile-first, titolo "Registrazione Assemblea dei Soci 27/11/2026", codice di accesso e call to action.
3. **Form in overlay** (sfondo sfocato): Nome, Cognome, Data di nascita (GG/MM/AAAA, anche da selettore data), Luogo di nascita — tutti obbligatori. Pulsante **Prosegui**.
4. **Ricerca** nel foglio Presenze:
   - non trovato → messaggio di errore e invito a contattare l'amministratore;
   - trovato e **non ancora registrato** → **riepilogo** con solo: nome, cognome, data di nascita, luogo di nascita, email (nessun altro dato personale):
     - se è un **socio minorenne** (< 18 anni in base alla data di nascita), la registrazione autonoma non è consentita: il riepilogo mostra `"Socio minorenne: impossibile registrarsi autonomamente."`. Se sul foglio risultano **tutori** associati (stesso Codice Socio, `Tipo = Tutore`), mostra `"Sei un tutore di <Nome Cognome>?"` con l'elenco dei tutori, le spunte di stato (verde = già registrato, grigia = non ancora registrato) e, accanto a chi non è ancora registrato, il link `Registrati →` per ricaricare direttamente il riepilogo compilato con i dati del tutore selezionato e procedere come tutore adulto. Se non risultano tutori associati, mostra l'invito a contattare l'amministratore e il tasto **Esci**;
     - se è un **tutore** (`Tipo = Tutore`), si mostrano anche nome, cognome e data di nascita dei **Ragazzi minorenni seguiti** (righe con stesso Codice Socio, `Tipo = Socio` e `< 18 anni`) e, in riquadri solo informativi (attenuati in grigio), degli eventuali **Ragazzi maggiorenni seguiti** (se presenti) e degli **Altri tutori** (stesso Codice Socio, `Tipo = Tutore`); **la registrazione del tutore vale per sé stesso e per gli eventuali ragazzi minorenni seguiti non ancora registrati, ma non sui maggiorenni né sugli altri tutori**: tutte le righe del tutore e i ragazzi minorenni ancora assenti ricevono TRUE, lo stesso ID_UNIQUE, IP e timestamp (le righe già registrate non vengono sovrascritte, e gli altri tutori così come i maggiorenni restano autonomi). Un socio maggiorenne non tutore registra solo sé stesso;
   - trovato e **già registrato** (L = TRUE, anche se minorenne) → nessuna nuova registrazione, **nessun ID mostrato**: messaggio "utente già registrato" con il solo timestamp.
   Prima di **Registrati** (per maggiorenni e tutori) va spuntato il **consenso** a comunicare i dati al Gruppo Scout Cologno Monzese 1, esclusivamente per la gestione delle presenze (il pulsante resta disabilitato finché non è spuntato).
5. **Registrati** → aggiornamento della riga (L, M, N, O); se la persona compare su più righe (stessi dati, codici socio diversi) vengono aggiornate tutte con lo stesso ID.
6. **Esito finale**: successo (con ID_UNIQUE di 8 caratteri alfanumerici maiuscoli), chiuso (se registrazioni disabilitate) o KO. Download locale di un file `.txt` con dati, ID_UNIQUE e timestamp.

## 3. Architettura
- **Frontend**: pagine/viste mobile-first (loading, landing, overlay form, riepilogo, esito).
- **Backend**: funzioni serverless su Vercel (API route); **nessuna credenziale nel browser**.
- **Accesso a Google Sheets**: Google Sheets API con **service account** (foglio condiviso con il service account); credenziali in variabili d'ambiente Vercel.
- **API**:
  - `POST /api/lookup` — verifica che le registrazioni siano aperte, normalizza e cerca la persona in Presenze; restituisce dati e, se tutore, i ragazzi collegati; se minorenne non registrato restituisce `status: "minor"` con gli eventuali tutori; segnala se già registrato (403 `status: "closed"` se chiuse).
  - `POST /api/register` — verifica che le registrazioni siano aperte, rilegge la riga, verifica che non sia già registrata e che la persona non sia minorenne (403 `status: "minor"`), genera ID_UNIQUE, scrive L/M/N/O, restituisce l'esito (403 `status: "closed"` se chiuse).
  - `POST /api/access` — verifica il codice inserito nella landing: `ACCESS_CODE` per la registrazione (bloccato con 403 `status: "closed"` se `REGISTRATIONS_CLOSED` è attivo), `ADMIN_CODE` per l'area amministratore (risposta `admin: true`, sempre consentita anche a registrazioni chiuse).
  - `POST /api/stats` — solo admin: conteggi, quorum e stato apertura/chiusura registrazioni (`registrationsClosed`).
  - `POST /api/report` — solo admin: elenco di dettaglio (solo i campi del report e stato `registrationsClosed`).
  - `POST /api/report/lookup` — solo admin: ricerca persona dal Report Presenze per registrazione rapida (bloccata con 403 se `REGISTRATIONS_CLOSED` è attivo).
  - `POST /api/report/register` — solo admin: registrazione rapida dal Report Presenze senza checkbox consenso (bloccata con 403 se `REGISTRATIONS_CLOSED` è attivo o minorenne).
  - `POST /api/report/unregister` — solo admin: anteprima (`dryRun: true`) ed esecuzione (`dryRun: false`) della cancellazione presenza a cascata (`L=FALSE`, `M=""`, `N=""`, `O=""`), bloccata con 403 se `REGISTRATIONS_CLOSED` è attivo.
  - `POST /api/config` — solo admin: apre o chiude le registrazioni aggiornando `REGISTRATIONS_CLOSED` (`1`/`0`) sul foglio `Config`.
  - `POST /api/associates` — solo admin (attivo anche a registrazioni chiuse): restituisce l'elenco base per la tabella `Gestisci Associati` (senza CF, cellulare, email, data delibera, ID o IP).
  - `POST /api/associates/detail` — solo admin: restituisce on-demand tutti i campi anagrafici (inclusi `Codice Fiscale`, `Cellulare`, `Email`, `Data Delibera Ammissione`, `Votante`) e gli eventuali tutori/ragazzi collegati per la singola riga selezionata (mai `ID_UNIQUE` o `USER_IP`), con verifica d'impronta contro modifiche concorrenti.
  - `POST /api/associates/update` — solo admin: valida i campi secondo le regole previste, impedisce `Codice Socio` duplicati tra `Socio` (e tutori duplicati), salva `Codice Socio` come numero sul foglio Google e aggiorna le sole colonne anagrafiche senza alterare `Tipo` e colonne `L–O`; se la modifica cambia il `Codice Socio` di un `Socio` con tutori collegati o tocca un nominativo presente su più righe, richiede conferma prima di aggiornare in blocco i tutori collegati / propagare le modifiche alle altre righe della stessa persona (lasciando invariati `Tipo`, `Adulto-Giovane` e i rispettivi `Codice Socio`). Con controllo d'impronta anti-concorrenza.
  - `POST /api/associates/delete` — solo admin: verifica l'impronta della riga ed elimina fisicamente la riga dal foglio `Presenze` (`deleteDimension`).
  - `POST /api/associates/create` — solo admin (attivo anche a registrazioni chiuse): inserisce in coda a `Presenze` (`append` con `L=FALSE`, `M/N/O=""`) un nuovo `Socio` (`kind: "socio"`, blocco duplicati sullo stesso `Codice Socio`, campi testuali salvati in MAIUSCOLO) oppure uno o più record `Tutore` (`kind: "tutor"`, maggiorenne, associato a uno o più `Socio Giovane` selezionati, con `Adulto-Giovane=""`, `Votante=NO`, controllo duplicati e campi testuali in MAIUSCOLO).
- **ID_UNIQUE**: 8 caratteri `A–Z0–9` generati con RNG crittografico, con controllo di unicità sulla colonna M. Non derivato dal codice fiscale (evita dati personali e prevedibilità).
- **Timestamp**: fuso Europe/Rome, salvato in colonna O.
- **Corrispondenza persona**: confronto normalizzato (maiuscole/minuscole, spazi, accenti, formato data).
- **Sicurezza**: validazione input lato server, rate limiting, nessun elenco restituito in blocco, messaggi di errore generici, concorrenza gestita rileggendo la riga prima di scrivere.
- **Privacy**: i dati restano nel Google Sheet; il browser non riceve mai credenziali né elenchi; i dati restituiti sono solo quelli del riepilogo; l'ID_UNIQUE non viene mai riemesso dopo la registrazione; nessun dato personale nei log, nel repository o nei test (solo dati fittizi); `*.xlsx` escluso da git.
- **QR code solo in loco**: il QR (URL della app) viene distribuito esclusivamente sul posto; l'URL non è indicizzabile (`noindex`). La landing richiede un **codice di accesso fisso** (`ACCESS_CODE`, variabile segreta su Vercel) comunicato solo in loco: è verificato lato server (hash + confronto a tempo costante, rate limit) su `/api/access`, `/api/lookup` e `/api/register`. A fine assemblea l'amministratore può chiudere le registrazioni dall'Area Admin tramite l'interruttore su `Config` (`REGISTRATIONS_CLOSED`).
- **Stack**: Next.js 15 (App Router, TypeScript) su Vercel, `google-auth-library` + Sheets REST API, Vitest. Colonne dati individuate per intestazione (`Codice Socio`, `Cognome`, `Nome`, `Tipo`, `Adulto-Giovane`, `Codice Fiscale`, `Data Nascita`, `Comune Nascita`, `Cellulare`, `Email`, `Data Delibera Ammissione`, `Votante`); colonne di scrittura presenze configurabili (`COL_PRESENZA`=L, `COL_ID`=M, `COL_IP`=N, `COL_TIMESTAMP`=O, `COL_VOTANTE`=P, `CONFIG_SHEET_NAME`=Config).
- **Schema colonne confermato (foglio Presenze)**: `L` = Presenza, `M` = ID_UNIQUE, `N` = USER_IP, `O` = TIMESTAMP, `P` = Votante.
- **Repository / destinazione**: `AlexgozWeb/PRJ_COLOGNO1_QR` — cartella locale `C:\CLAUDE\prj_Cologno1_QR`.

## 3 bis. Area amministratore
Inserendo `ADMIN_CODE` (variabile segreta, distinta da `ACCESS_CODE`) nella landing si apre la pagina **Statistiche Assemblea** invece del form. In modalità mock (`MOCK_SHEET=1`) il codice admin è `admin1`. Le API admin hanno rate limit e rispondono 401 senza codice valido. In alto a destra (in **Statistiche Assemblea**, **Report Presenze** e **Gestisci Associati**) è mostrato il badge versione (`v03.00_<commit/deploy>`).

**Statistiche e chiusura registrazioni** (aggiornamento ogni 10 s):
- Stato in tempo reale (`Registrazioni APERTE` / `Registrazioni CHIUSE`) e griglia azioni a due righe: riga 1 con **Gestisci Associati** (verde) e **Report di dettaglio** (`#f59e0b`), riga 2 con **Chiudi registrazioni** (rosso, o verde *Riapri registrazioni* se chiuse) ed **Esci** (rosso). L'interruttore con conferma (`POST /api/config`) aggiorna la cella `value from` di `REGISTRATIONS_CLOSED` (`1` = chiuse, `0` = aperte) nel foglio `Config` lasciando intatta `value to` ed eventuali altri parametri. A registrazioni chiuse le API pubbliche (`/api/access` per `ACCESS_CODE`, `/api/lookup`, `/api/register`) bloccano nuove registrazioni con HTTP 403, mentre l'Area Admin rimane sempre accessibile.
- Soci (esclusi i tutori) e soci aventi diritto al voto (colonna **P = Votante**, riconosce TRUE e SI).
- Persone registrate (Soci + Tutori, contate per riga) e aventi diritto al voto registrati.
- **Quorum**: 100% = aventi diritto al voto; raggiunto con 50% + 1 presenti. L'indicatore a semicerchio è rosso fino al 15%, giallo fino al 35%, giallo chiaro oltre, verde con la maggioranza.

**Gestisci Associati** (pulsante verde **Gestisci Associati** nelle Statistiche, aggiornamento ogni 10 s):
- Barra azioni superiore con i pulsanti verdi **Aggiungi Socio** e **Aggiungi Tutore** (sempre attivi anche a registrazioni chiuse) e pulsante **Torna alle statistiche** in alto a destra:
  - **Aggiungi Socio**: form in modal su sfondo sfocato (`Codice Socio` numerico max 15 cifre e blocco se già presente come `Socio`, `Tipo` fisso `Socio`, `Cognome` e `Nome` sole lettere in MAIUSCOLO, `Adulto-Giovane` obbligatorio `Adulto`/`Giovane`, `Votante` default `No`, `Data Nascita` `GG/MM/AAAA`, `Comune Nascita` max 50 in MAIUSCOLO, facoltativi `Codice Fiscale`, `Cellulare`, `Email`, `Data Delibera Ammissione` in MAIUSCOLO); salva una nuova riga in coda con `L=FALSE` e `M/N/O` vuote.
  - **Aggiungi Tutore**: selettore iniziale filtrabile dei `Socio` `Giovane` in elenco (con selezione singola o multipla); finché non viene selezionato almeno un ragazzo nessun campo è compilabile. Sblocca quindi sia una sezione facoltativa a selezione singola (*Precompila da Socio Adulto o Tutore già presente*, che carica on-demand via `/api/associates/detail` i dati anagrafici lasciando intatti `Tipo`, `Adulto-Giovane`, `Votante` e derivando `Codice Socio` dai ragazzi scelti) sia il form con `Codice Socio` precompilato dai ragazzi scelti (non editabile), `Tipo` fisso `Tutore`, `Adulto-Giovane` vuoto, `Votante` fisso `No`, verifica maggiore età (`>= 18` anni) sulla data di nascita e salvataggio testi in MAIUSCOLO creando una riga `Tutore` (`L=FALSE`) per ciascun `Codice Socio` selezionato (con blocco duplicati).
- Elenco di tutti gli associati con colonne `Codice socio`, `Nome`, `Cognome`, `Data di nascita`, `Comune di nascita`, `Titolo`, `Votante` (`Sì`/`No`, con filtro menu Tutti/Sì/No e ordinamento) e `Azioni` con 3 iconcine cliccabili sempre attive anche a registrazioni chiuse:
  - **Visualizza** (documento blu): carica on-demand e mostra in modal di sola lettura i 12 campi (`Codice Socio`, `Cognome`, `Nome`, `Tipo`, `Adulto-Giovane`, `Codice Fiscale`, `Data Nascita`, `Comune Nascita`, `Cellulare`, `Email`, `Data Delibera Ammissione`, `Votante`).
  - **Modifica** (matita arancione): consente di modificare i campi (`Codice Socio` numerico max 15 cifre scritto come numero sul foglio con blocco duplicati, editabile solo per i `Socio` e bloccato per i `Tutore`, `Cognome`/`Nome` solo lettere convertite in MAIUSCOLO al salvataggio, `Tipo` non editabile, `Adulto-Giovane` a tendina editabile solo per i `Socio` e bloccato per i `Tutore`, `Votante` a tendina, `Codice Fiscale`, `Data Nascita`, `Comune Nascita` max 50 caratteri, `Cellulare`, `Email`, `Data Delibera Ammissione`) aggiornando le sole celle anagrafiche sul foglio Google senza alterare `L–O`. Se il cambio di `Codice Socio` di un `Socio` coinvolge tutori collegati o il nominativo compare su più righe, mostra una conferma esplicita e aggiorna automaticamente anche i tutori collegati e tutte le altre righe della stessa persona (lasciando invariati `Tipo`, `Adulto-Giovane` e rispettivi `Codice Socio`).
  - **Elimina** (cestino grigio): apre una conferma con eventuale avviso sulla presenza di tutori/ragazzi collegati o presenza già registrata e, alla conferma, elimina fisicamente l'intera riga dal foglio Google (`deleteDimension`), con controllo d'impronta anti-concorrenza.
- **Mai** esposti `ID_UNIQUE` o `USER_IP`.

**Report Presenze** (pulsante "Report di dettaglio" nelle Statistiche, aggiornamento ogni 10 s):
- Elenco delle persone con colonne Codice socio, Nome, Cognome, Data di nascita, Comune di nascita, Titolo, Presenza (✔ verde = presente, ✔ grigia = assente).
- Ordine iniziale: codice socio, tipo, cognome, presenza (presenti prima).
- Ordinamento per colonna con le frecce ▲ ▼ (secondo clic sulla stessa freccia = ordine iniziale); filtri a testo per colonna e menu Tutti/Presenti/Assenti per la presenza. Ordine e filtri sono mantenuti negli aggiornamenti.
- **Spunte `✔` cliccabili** (attive solo a registrazioni aperte; disabilitate quando `REGISTRATIONS_CLOSED = 1`):
  - **✔ verde (cancellazione)**: apre un modal di conferma su sfondo sfocato con anagrafica della persona, eventuale anteprima di altri nominativi legati (`ATTENZIONE:` con distinzione tra chi verrà cancellato a cascata e chi resta invariato), applicando Regola A per Adulto/Tutore (cancella il minore collegato solo se resta senza altri tutori presenti) e Opzione B2 prudente per Minorenne (cancella il tutore solo se non è anche Socio Adulto né segue altri ragazzi presenti; altrimenti spegne solo la riga tutore dedicata al codice del minore). Alla conferma azzera `L=FALSE`, `M=""`, `N=""`, `O=""` e aggiorna subito il report.
  - **✔ grigia (registrazione rapida admin)**: apre in overlay il riepilogo precompilato (senza checkbox consenso) o il flusso minorenne → tutore, aggiorna il foglio e riporta al Report aggiornato.
- Non mostra mai ID_UNIQUE, IP, email o altri dati personali nella tabella. Pulsante "Torna alle statistiche" in alto a destra.

## 4. Struttura (proposta)
```
/ (progetto web, hosting Vercel)
├─ app/ o pages/     viste: loading, landing, riepilogo, esito
├─ components/       overlay form, card dati, spinner
├─ api/              lookup, register
├─ lib/              client Google Sheets, normalizzazione, generazione ID
├─ public/           logo e immagini
└─ docs/PROGETTO.md  questo documento
```

## 5. Evoluzione
- **Fase 1 — MVP**: flusso completo come sopra, ricevuta `.txt`.
- **Fase 2 — Rifinitura**: grafica definitiva con logo, gestione già registrato, rate limiting, test end-to-end sul foglio reale.
- **Fase 3 — Pubblicazione**: deploy Vercel, variabili d'ambiente, QR code definitivo, prova generale prima del 27/11/2026.
- **Realizzato oltre l'MVP**: codice di accesso, consenso, registrazione di gruppo per i tutori, area amministratore con statistiche, quorum e Report Presenze (vedi cronologia).
- **Futuro (opzionale)**: ricevuta PDF, esportazione dell'elenco, ricerche nel pannello admin.

### Cronologia
| Data | Modifica |
|---|---|
| 18/11/2026 | MVP registrazione presenze; USER_IP salvato in colonna N (mai mostrato) |
| 18/11/2026 | Pulsante "Torna alla home" nelle schermate finali; codice di accesso nella landing (`ACCESS_CODE`); consenso al trattamento dati |
| 18/11/2026 | Registrazione di gruppo per tutori (ragazzi e altri tutori) con spunte di stato |
| 18/11/2026 | Pagina statistiche admin con grafico quorum; Votante riconosce anche SI; consenso semplificato; registrati contati per riga; etichette |
| 19/11/2026 | Report Presenze: elenco di dettaglio con ordinamento e filtri; pulsante in alto a destra |
| 20/11/2026 | Interruttore apertura/chiusura registrazioni da Area Admin su foglio Config (`REGISTRATIONS_CLOSED`); allineamento `.env.example`, mock e test; nel Report Presenze aggiunta colonna `Comune di nascita` (ordinabile/filtrabile) e rinomina `Tipo` → `Titolo`; blocco registrazione autonoma soci minorenni con selezione rapida tutore; registrazione tutore estesa ai soli ragazzi minorenni seguiti (riepilogo diviso in `Ragazzi minorenni seguiti`, eventuale `Ragazzi maggiorenni seguiti` informativo e `Altri tutori` informativo); spunte ✔ cliccabili nel Report Presenze (cancellazione a cascata con anteprima e registrazione rapida admin); badge versione `v02.00` in alto a destra nell'Area Admin |
| 24/11/2026 | Release `v03.00`: layout azioni in `Statistiche Assemblea` su due righe con nuovo tasto verde `Gestisci Associati`; nuova schermata Admin `Gestisci Associati` con tabella ordinabile/filtrabile comprensiva di `Votante` (`Sì`/`No`), azioni per riga Visualizza, Modifica (blocco duplicati, aggiornamento `Codice Socio` in formato numerico, conferma e cascata su tutori collegati e propagazione anagrafica sulle eventuali altre righe dello stesso nominativo) ed Elimina riga su Google Sheets, modali e API `/api/associates/create` per `Aggiungi Socio` e `Aggiungi Tutore` (selezione singola/multipla di Soci Giovani, blocco campi pre-selezione, precompilazione facoltativa da Socio Adulto o Tutore già presente, maiuscolo, maggiore età tutore, controllo duplicati) e componente `DatePickerButton` su tutta l'app |

## 6. Questioni aperte
Risolte: già registrato, tutore, privacy, QR solo in loco, area amministratore, grafica definitiva (`public/logo.png` e layout mobile-first attuale), colonne L–P (`L=Presenza`, `M=ID_UNIQUE`, `N=USER_IP`, `O=TIMESTAMP`, `P=Votante`), chiusura post-assemblea (interruttore Admin su foglio `Config`).
Ancora aperte: chiave di ricerca ammessa (oggi: nome + cognome + data + luogo, normalizzati); Fase 3 (deploy Vercel, verifica variabili d'ambiente, QR code definitivo e prova generale prima del 27/11/2026).
