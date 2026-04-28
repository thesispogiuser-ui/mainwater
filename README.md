# Monitoreo del Agua 💧

HydraTrack Pro — water monitoring dashboard for ESP32-CAM + AI-on-the-Edge-Device watermeter.

## Run locally

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000

## Deploy to Railway

1. Push this repo to GitHub.
2. On https://railway.com → **New Project → Deploy from GitHub repo**.
3. Add a **PostgreSQL** database (Railway → + New → Database → PostgreSQL).
4. In the web service → **Variables**, set:
   - `SECRET_KEY` = long random string
   - `ESP_PUBLIC_URL` = public tunnel URL of your home ESP bridge
5. Redeploy.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | prod | Flask session secret |
| `DATABASE_URL` | prod | Auto-set by Railway Postgres |
| `ESP_PUBLIC_URL` | prod | Public URL of cloudflared tunnel pointing to the ESP |
| `PORT` | auto | Set by Railway |

## ESP bridge (home side)

The Flask backend proxies requests to the ESP watermeter. In production the
server is in a datacenter and can't reach your LAN, so run a Cloudflare quick
tunnel on a PC at home:

```
cloudflared tunnel --url http://192.168.1.222
```

Copy the printed `https://…trycloudflare.com` URL into Railway as `ESP_PUBLIC_URL`.
