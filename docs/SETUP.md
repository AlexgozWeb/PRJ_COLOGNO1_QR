# Setup: Google Sheet, service account, Vercel

## 1. Preparare il Google Sheet
1. Carica `Liste_Assemblea.xlsx` su Google Drive, aprilo con Fogli Google e usa **File → Salva come Google Fogli** (serve un vero Google Sheet, non un .xlsx).
2. Nel foglio **Presenze** la riga 1 deve avere le intestazioni: Codice Socio, Cognome, Nome, Tipo, Adulto-Giovane, Codice Fiscale, Data Nascita, Comune Nascita, Cellulare, Email, Data Delibera Ammissione. Le colonne di registrazione e voto confermate sono **L = Presenza (TRUE/FALSE)**, **M = ID_UNIQUE**, **N = USER_IP**, **O = TIMESTAMP**, **P = Votante**. L'IP è solo scritto nel foglio, mai mostrato nell'app.
3. Il foglio **Config** (creato automaticamente dall'app se assente) ha alla riga 1 le intestazioni `parameter`, `value from`, `value to` e ospita il parametro `REGISTRATIONS_CLOSED` (`value from = 0` per registrazioni aperte, `1` per registrazioni chiuse). È gestibile sia direttamente dal Google Sheet sia tramite l'interruttore nell'Area Admin.
4. Copia l'**ID del foglio** dall'URL: `https://docs.google.com/spreadsheets/d/<ID>/edit`.

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
| `ADMIN_CODE` | codice amministratore: apre Statistiche e Report Presenze (segreto; senza variabile l'area admin è sempre negata) |
| `COL_VOTANTE` | opzionale: colonna "Votante" se l'intestazione non è trovata (default P) |
| `SHEET_NAME`, `CONFIG_SHEET_NAME`, `COL_PRESENZA`, `COL_ID`, `COL_IP`, `COL_TIMESTAMP` | opzionali (Presenze, Config, L, M, N, O) |

Per lo sviluppo locale copia `.env.example` in `.env.local` (ignorato da git).

## 5. Sviluppo locale
```
npm install
$env:MOCK_SHEET='1'; npm run dev   # dati fittizi, senza Google
npm test
```
Le variabili di `.env.local` sono lette solo all'avvio: dopo ogni modifica riavvia il server. Su Vercel le variabili valgono dal deploy successivo.

Area admin in locale: in modalità mock il codice è `admin1`; senza mock vale `ADMIN_CODE` di `.env.local`. Da lì si aprono le Statistiche e il Report Presenze.

Dati di prova nella modalità mock: Mario Rossi, 12/03/1975, Milano (tutore con 2 ragazzi); Giulia Bianchi, 15/01/1990, Cologno Monzese; Paolo Verdi, 30/11/1980, Monza (già registrato).

## 6. Deploy
Importa il repository su Vercel (framework Next.js rilevato in automatico), imposta le variabili e fai il deploy. Genera poi il QR code dell'URL di produzione.
