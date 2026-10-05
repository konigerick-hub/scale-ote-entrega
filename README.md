# Remuneração da Entrega · Scale (OTE 2026)

Calculadora de OTE da Entrega (Estrategista EP, Estrategista EC e Financeiro) conforme o Edital OTE Entrega Scale 2026.

- `index.html` — a página.
- `api/data.js` — função do Vercel que lê e grava os resultados no repositório de dados (`dados/AAAA-MM.json`).

## Variáveis de ambiente (Vercel)

| Nome | Valor |
|---|---|
| `GITHUB_TOKEN` | Token do GitHub com permissão *Contents: Read and write* no repositório de dados |
| `GITHUB_REPO` | `konigerick-hub/scale-ote-entrega-dados` |
| `GITHUB_BRANCH` | `main` (opcional) |
| `APP_SENHA` | Senha que o time digita para acessar |
