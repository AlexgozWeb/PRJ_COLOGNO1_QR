# PRJ_COLOGNO1_QR — Registrazione presenze Assemblea dei Soci

## 1. Idea
Web app (Vercel) raggiungibile inquadrando un QR code, per registrare la presenza dei soci all'**Assemblea dei Soci del 27/11/2026** (Cologno 1). I dati risiedono in un Google Sheet su Drive (`Liste_Assemblea`) con tre fogli:

| Foglio | Contenuto |
|---|---|
| Libro associati | Elenco associati |
| Votanti | Elenco aventi diritto al voto |
| **Presenze** | Unione dei due elenchi + colonne di registrazione (unico foglio letto/scritto dalla app) |

**Colonne di scrittura** nel foglio Presenze: **L** = Presenza (TRUE), **M** = ID_UNIQUE, **N** = USER_IP (indirizzo IP dell'utente, salvato solo nel foglio e **mai mostrato** in alcuna schermata né restituito dalle API), **O** = TIMESTAMP.

## 2. Flusso utente
1. **Loading** con insegna/logo Cologno 1 (grafica allegato 1; logo da fornire).
2. **Landing** con grafica allegato 2 e titolo "Registrazione Assemblea dei Soci 27/11/2026" + call to action.
3. **Form in overlay** (sfondo sfocato): Nome, Cognome, Data di nascita (GG/MM/AAAA, anche da selettore data), Luogo di nascita — tutti obbligatori. Pulsante **Prosegui**.
4. **Ricerca** nel foglio Presenze:
   - non trovato → messaggio di errore e invito a contattare l'amministratore;
   - trovato e **non ancora registrato** → **riepilogo** con solo: nome, cognome, data di nascita, luogo di nascita, email (nessun altro dato personale). Se è un **tutore** (`Tipo = Tutore`), si mostrano anche nome, cognome e data di nascita dei ragazzi seguiti (righe con stesso Codice Socio e `Tipo = Socio`, `Adulto-Giovane = Giovane`); **il tutore registra solo sé stesso**, i ragazzi sono solo informativi;
   - trovato e **già registrato** (L = TRUE) → nessuna nuova registrazione, **nessun ID mostrato**: messaggio "utente già registrato" con il solo timestamp.
5. **Registrati** → aggiornamento della riga (L, M, O); se la persona compare su più righe (stessi dati, codici socio diversi) vengono aggiornate tutte con lo stesso ID.
6. **Esito finale**: successo (con ID_UNIQUE di 8 caratteri alfanumerici maiuscoli) o KO. Download locale di un file `.txt` con dati, ID_UNIQUE e timestamp.

## 3. Architettura
- **Frontend**: pagine/viste mobile-first (loading, landing, overlay form, riepilogo, esito).
- **Backend**: funzioni serverless su Vercel (API route); **nessuna credenziale nel browser**.
- **Accesso a Google Sheets**: Google Sheets API con **service account** (foglio condiviso con il service account); credenziali in variabili d'ambiente Vercel.
- **API**:
  - `POST /api/lookup` — normalizza e cerca la persona in Presenze; restituisce dati e, se tutore, i ragazzi collegati; segnala se già registrato.
  - `POST /api/register` — rilegge la riga, verifica che non sia già registrata, genera ID_UNIQUE, scrive L/M/O, restituisce l'esito.
- **ID_UNIQUE**: 8 caratteri `A–Z0–9` generati con RNG crittografico, con controllo di unicità sulla colonna M. Non derivato dal codice fiscale (evita dati personali e prevedibilità).
- **Timestamp**: fuso Europe/Rome, salvato in colonna O.
- **Corrispondenza persona**: confronto normalizzato (maiuscole/minuscole, spazi, accenti, formato data).
- **Sicurezza**: validazione input lato server, rate limiting, nessun elenco restituito in blocco, messaggi di errore generici, concorrenza gestita rileggendo la riga prima di scrivere.
- **Privacy**: i dati restano nel Google Sheet; il browser non riceve mai credenziali né elenchi; i dati restituiti sono solo quelli del riepilogo; l'ID_UNIQUE non viene mai riemesso dopo la registrazione; nessun dato personale nei log, nel repository o nei test (solo dati fittizi); `*.xlsx` escluso da git.
- **QR code solo in loco**: il QR (URL della app) viene distribuito esclusivamente sul posto; l'URL non è indicizzabile (`noindex`). La landing richiede un **codice di accesso fisso** (`ACCESS_CODE`, variabile segreta su Vercel) comunicato solo in loco: è verificato lato server (hash + confronto a tempo costante, rate limit) su `/api/access`, `/api/lookup` e `/api/register`. Disattivare la app a fine assemblea resta valutabile in Fase 3.
- **Stack**: Next.js 15 (App Router, TypeScript) su Vercel, `google-auth-library` + Sheets REST API, Vitest. Colonne dati individuate per intestazione (Codice Socio, Cognome, Nome, Tipo, Adulto-Giovane, Data Nascita, Comune Nascita, Email); colonne di scrittura configurabili (`COL_PRESENZA`=L, `COL_ID`=M, `COL_TIMESTAMP`=O).
- **Nota sul foglio esempio**: nel file di esempio la colonna M si chiama "Votante" ed è vuota, e non esistono N/O: il foglio reale deve avere M = ID_UNIQUE e O = timestamp (da confermare, vedi SETUP).
- **Repository / destinazione**: `AlexgozWeb/PRJ_COLOGNO1_QR` — cartella locale `C:\CLAUDE\prj_Cologno1_QR`.

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
- **Futuro (opzionale)**: pannello amministratore (conteggi presenze, ricerche), verifica quorum, ricevuta PDF, esportazione.

## 6. Questioni aperte
Risolte: già registrato, tutore, privacy, QR solo in loco. Ancora aperte: grafica di riferimento (allegati 1 e 2); intestazioni definitive delle colonne L–O nel foglio reale; chiave di ricerca ammessa (oggi: nome + cognome + data + luogo, normalizzati).
