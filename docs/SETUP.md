# Setup: Google Sheet, service account, Vercel

## 1. Preparare il Google Sheet
1. Carica `Liste_Assemblea.xlsx` su Google Drive, aprilo con Fogli Google e usa **File → Salva come Google Fogli** (serve un vero Google Sheet, non un .xlsx).
2. Nel foglio **Presenze** la riga 1 deve avere le intestazioni: Codice Socio, Cognome, Nome, Tipo, Adulto-Giovane, Codice Fiscale, Data Nascita, Comune Nascita, Cellulare, Email, Data Delibera Ammissione. Le colonne di registrazione sono **L = Presenza (TRUE/FALSE)**, **M = ID_UNIQUE**, **N = USER_IP**, **O = TIMESTAMP**. (Nel file di esempio M è "Votante" e N/O non esistono: rinomina/aggiungi le intestazioni, oppure cambia `COL_ID`/`COL_IP`/`COL_TIMESTAMP`.) L'IP è solo scritto nel foglio, mai mostrato nell'app.
3. Copia l'**ID del foglio** dall'URL: `https://docs.google.com/spreadsheets/d/<ID>/edit`.

## 2. Creare il service account
1. Vai su <https://console.cloud.google.com> e crea un progetto (es. `cologno1-qr`).
2. **API e servizi → Libreria** → cerca **Google Sheets API** → **Abilita**.
3. **API e servizi → Credenziali → Crea credenziali → Account di servizio**. Nome: `qr-assemblea`. Ruoli: nessuno. Fine.
4. Apri l'account creato → scheda **Chiavi → Aggiungi chiave → Crea nuova chiave → JSON**. Si scarica un file: **non metterlo mai nel repository** né inviarlo in chat.
5. Dal JSON ti servono `client_email` e `private_key`.

## 3. Condividere il foglio
Nel Google Sheet: **Condividi** → incolla la `client_email` del service account (`...@...iam.gserviceaccount.com`) → ruolo **Editor** → togli la spunta "Invia notifica" → Condividi.

## 4. Variabili d'ambiente (Vercel → Project → Settings → Environment Variables)
| Nome | Valore |
|---|---|
| `GOOGLE_SHEET_ID` | ID del foglio |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` |
| `GOOGLE_PRIVATE_KEY` | `private_key` completa (con i `\n`) |
| `ACCESS_CODE` | codice di accesso fisso chiesto nella landing (segreto) |
| `SHEET_NAME`, `COL_PRESENZA`, `COL_ID`, `COL_IP`, `COL_TIMESTAMP` | opzionali (Presenze, L, M, N, O) |

Per lo sviluppo locale copia `.env.example` in `.env.local` (ignorato da git).

## 5. Sviluppo locale
```
npm install
$env:MOCK_SHEET='1'; npm run dev   # dati fittizi, senza Google
npm test
```
Dati di prova nella modalità mock: Mario Rossi, 12/03/1975, Milano (tutore con 2 ragazzi); Giulia Bianchi, 15/01/1990, Cologno Monzese; Paolo Verdi, 30/11/1980, Monza (già registrato).

## 6. Deploy
Importa il repository su Vercel (framework Next.js rilevato in automatico), imposta le variabili e fai il deploy. Genera poi il QR code dell'URL di produzione.
