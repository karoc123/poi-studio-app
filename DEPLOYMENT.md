# Deployment Guide — Collaborative Trip & POI Planner (`poi-studio-2`)

Diese Anleitung beschreibt alle Bereitstellungsoptionen (Deployment) für **POI Studio 2**, vom einfachsten Docker-Setup bis hin zu Bare-Metal Linux / Raspberry Pi und Cloud-PaaS.

---

## Inhaltsverzeichnis
1. [Architektur & Voraussetzungen](#1-architektur--voraussetzungen)
2. [Methode A: Docker & Docker Compose (Empfohlen)](#2-methode-a-docker--docker-compose-empfohlen)
3. [Methode B: Bare-Metal Linux / Raspberry Pi (Systemd)](#3-methode-b-bare-metal-linux--raspberry-pi-systemd)
4. [Methode C: Cloud & PaaS (Coolify, Dokku, Fly.io, Railway)](#4-methode-c-cloud--paas-coolify-dokku-flyio-railway)
5. [Methode D: Vercel / Serverless mit Turso SQLite](#5-methode-d-vercel--serverless-mit-turso-sqlite)
6. [Reverse Proxy & SSL (Caddy, Nginx, Cloudflare Tunnel)](#6-reverse-proxy--ssl-caddy-nginx-cloudflare-tunnel)
7. [Datenbank-Backup & Wartung](#7-datenbank-backup--wartung)
8. [Umgebungsvariablen (Referenz)](#8-umgebungsvariablen-referenz)

---

## 1. Architektur & Voraussetzungen

- **Runtime**: Node.js 20+ oder 22+ (im Docker-Image vorkonfiguriert).
- **Standalone Build**: Next.js 15 kompiliert in einen minimalen Standalone-Server (`.next/standalone`), der extrem ressourcenschonend auf jedem Linux-Server oder Raspberry Pi läuft (typisch < 80 MB RAM).
- **Datenbank**: LibSQL / SQLite mit automatischem **WAL-Modus** (Write-Ahead-Logging). Es ist **kein separater Datenbankserver** (wie Postgres oder MySQL) nötig. Die Datenbank besteht aus einer einzelnen Datei (`local.db`) mit WAL-Dateien.

---

## 2. Methode A: Docker & Docker Compose (Empfohlen)

Die einfachste und sauberste Methode für eigene Server (VPS, Home Server, Synology, Unraid, Raspberry Pi):

### Schnellstart mit Docker Compose

1. **Repository klonen**:
   ```bash
   git clone https://github.com/dein-user/poi-studio-2.git
   cd poi-studio-2
   ```

2. **Starten**:
   ```bash
   docker compose up -d --build
   ```

3. **Status prüfen**:
   ```bash
   docker compose ps
   docker compose logs -f
   ```

4. **App aufrufen**:
   Öffne `http://<deine-server-ip>:3000` im Browser.

### Was passiert im Hintergrund?
- Das Multi-Stage `Dockerfile` baut die Next.js Standalone-App.
- Der Container läuft als unprivilegierter Benutzer `nextjs` (Sicherheits-Best-Practice).
- Die SQLite-Datenbank wird im persistenten Docker-Volume `poi_studio_data` unter `/app/data/local.db` gespeichert und bleibt bei Updates, Neustarts und Container-Rebuilds erhalten.
- Ein automatischer Healthcheck prüft alle 30 Sekunden die Verfügbarkeit.

### Container stoppen & aktualisieren:
```bash
# Stoppen
docker compose down

# Aktualisieren nach Code-Änderungen
git pull
docker compose up -d --build
```

---

## 3. Methode B: Bare-Metal Linux / Raspberry Pi (Systemd)

Wenn du die App direkt ohne Docker auf einem Raspberry Pi oder Linux-Server (Ubuntu, Debian, DietPi) betreiben möchtest:

### 1. Abhängigkeiten & Build
```bash
# Node.js 22 LTS installieren (falls noch nicht vorhanden)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Repository klonen & bauen
cd /opt
sudo git clone https://github.com/dein-user/poi-studio-2.git
sudo chown -R $USER:$USER /opt/poi-studio-2
cd /opt/poi-studio-2

npm ci
npm run build
```

### 2. Systemd Service einrichten
Kopiere die mitgelieferte Service-Datei:
```bash
sudo cp deploy/poi-studio.service /etc/systemd/system/poi-studio.service
```

Passe Pfad und Benutzer in `/etc/systemd/system/poi-studio.service` an:
```ini
[Unit]
Description=POI Studio 2 - Collaborative Trip & POI Planner
After=network.target

[Service]
Type=simple
User=dein-benutzer
WorkingDirectory=/opt/poi-studio-2
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=DATABASE_URL=file:./local.db

[Install]
WantedBy=multi-user.target
```

### 3. Service aktivieren & starten
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now poi-studio.service
sudo systemctl status poi-studio.service
```

---

## 4. Methode C: Cloud & PaaS (Coolify, Dokku, Fly.io, Railway)

### Coolify (Self-Hosted PaaS)
1. Neues Projekt in Coolify anlegen.
2. Repository auswählen oder Git URL angeben.
3. Build Pack: **Dockerfile** auswählen.
4. Persistent Storage (Volume) hinzufügen:
   - Mount Path: `/app/data`
5. Domain hinterlegen (Coolify konfiguriert Traefik / Let's Encrypt automatisch).

### Dokku
```bash
# Auf dem Dokku-Server:
dokku apps:create poi-studio
dokku storage:mount poi-studio /var/lib/dokku/data/storage/poi-studio:/app/data
dokku config:set poi-studio DATABASE_URL=file:/app/data/local.db
# Git push vom lokalen Rechner:
git remote add dokku dokku@dein-server:poi-studio
git push dokku main
```

### Fly.io
Fly.io unterstützt persistente Volumes für SQLite:
```bash
fly launch --no-deploy
fly volumes create poi_data --size 1 --region fra
```
In `fly.toml`:
```toml
[mounts]
  source = "poi_data"
  destination = "/app/data"

[env]
  DATABASE_URL = "file:/app/data/local.db"
```
Anschließend `fly deploy` ausführen.

---

## 5. Methode D: Vercel / Serverless mit Turso SQLite

Wenn du auf **Vercel** oder anderen ephemeren Serverless-Plattformen deployen möchtest (wo lokale Dateien nicht persistent gespeichert werden können):

1. Erstelle eine kostenlose Turso-Datenbank ([turso.tech](https://turso.tech)):
   ```bash
   turso db create poi-studio
   turso db show poi-studio --url
   turso db tokens create poi-studio
   ```

2. Setze die Umgebungsvariablen in Vercel:
   - `DATABASE_URL`: `libsql://poi-studio-[username].turso.io`
   - `DATABASE_AUTH_TOKEN`: `<dein-turso-token>`

3. Repository mit Vercel verknüpfen und deployen. Der in POI Studio integrierte `@libsql/client` schaltet automatisch nahtlos auf die Turso-Cloud-Datenbank um!

---

## 6. Reverse Proxy & SSL (Caddy, Nginx, Cloudflare Tunnel)

### Option 1: Caddy (Automatische HTTPS-Zertifikate via Let's Encrypt)
Erstelle ein `Caddyfile`:
```caddy
trips.deinedomain.de {
    reverse_proxy 127.0.0.1:3000
}
```
Caddy kümmert sich vollautomatisch um Ausstellung und Erneuerung von SSL-Zertifikaten.

### Option 2: Nginx
```nginx
server {
    listen 80;
    server_name trips.deinedomain.de;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name trips.deinedomain.de;

    ssl_certificate /etc/letsencrypt/live/trips.deinedomain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/trips.deinedomain.de/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option 3: Cloudflare Tunnel (Keine Portweiterleitung im Router nötig)
Ideal für Raspberry Pi oder Home Server hinter DSL/Glasfaser ohne feste IPv4:
```bash
cloudflared tunnel create poi-studio
cloudflared tunnel route dns poi-studio trips.deinedomain.de
cloudflared tunnel run --url http://localhost:3000 poi-studio
```

---

## 7. Datenbank-Backup & Wartung

### Backup erstellen (Live im laufenden Betrieb via SQLite VACUUM INTO)
Da SQLite im WAL-Modus läuft, kann ein sicheres, konsistentes Backup ohne Serverstopp erstellt werden:

**Im Docker-Container**:
```bash
docker exec -it poi-studio sh -c "sqlite3 /app/data/local.db '.backup /app/data/backup-$(date +%Y%m%d).sqlite'"
```

**Auf Bare-Metal / Linux**:
```bash
sqlite3 /opt/poi-studio-2/local.db ".backup /backup/poi-studio-$(date +%Y%m%d).sqlite"
```

Alternativ bietet die Web-App unter dem Export-Menü einen vollständigen **1-Klick JSON-Backup-Export und -Import** an.

---

## 8. Umgebungsvariablen (Referenz)

| Variable | Standardwert | Beschreibung |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port, auf dem der HTTP-Server lauscht |
| `HOSTNAME` | `0.0.0.0` | Bind-Adresse für Netzwerkverbindungen |
| `NODE_ENV` | `production` | Laufzeitumgebung (aktiviert Caching & Optimierungen) |
| `DATABASE_URL` | `file:./local.db` | Pfad zur lokalen SQLite-Datei oder Turso URL (`libsql://...`) |
| `DATABASE_AUTH_TOKEN` | *(leer)* | Authentifizierungs-Token bei Verwendung von Turso Cloud |
| `SESSION_SECRET` | *(integriertes JWT Secret)* | Optionaler benutzerdefinierter Schlüssel für JWT-Cookies |
