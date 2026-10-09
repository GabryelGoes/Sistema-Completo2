# NIIMBOT Web Bluetooth (vendored)

Driver MIT de [iscarelli/niimbot-web-bluetooth](https://github.com/iscarelli/niimbot-web-bluetooth).

- `niimbot.js` — driver genérico (`window.Niimbot`)
- `registry-b1.json` — recorte B1 + T50x30 (384×240 @ 203 dpi)
- `LICENSE` — MIT

A app usa o B1 via `services/niimbotService.ts` (detecta B1 Pro automaticamente).
Conexão: Chrome/Edge + HTTPS; no Android ligue também a Localização; feche o app
oficial NIIMBOT. Se a B1 não aparecer no seletor, use «Listar todos».
