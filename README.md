# Backend Youcine Scraper/API

## Como rodar localmente

```bash
cd backend
npm install
npm start
```

## Como rodar com Docker

```bash
docker build -t youcine-backend .
docker run -p 3000:3000 youcine-backend
```

## Endpoints
- `/movies` — filmes
- `/series` — séries
- `/animes` — animes
- `/kids` — kids
- `/recommend` — recomendados
- `/live` — canais ao vivo
- `/search?q=...` — busca

Todos os endpoints retornam JSON pronto para o app Roku consumir.

---

## Observação
- O scraper pode ser adaptado caso o site mude a estrutura.
- O backend serve apenas dados públicos (não requer login).
