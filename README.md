# BrawlTalking Reborn

Repositório local sincronizado com https://github.com/VitorEPrestes/BrawlTalking-v2

Projeto de chat/local frontend para BrawlTalking.

Estrutura principal:
- `BrawlTalking/` — frontend React
- `public/` — arquivos estáticos (`app.js`, `index.html`, `styles.css`)

Como rodar (exemplo básico):

1. Instale dependências:

```bash
npm install
```

2. Inicie a aplicação:

```bash
node server.js
```

Variáveis de ambiente recomendadas:

- `ADMIN_PASSWORD`: senha do painel administrativo.
- `TOKEN_SECRET`: segredo usado para assinar tokens de autenticação.

Em produção (`NODE_ENV=production`), o servidor exige `ADMIN_PASSWORD` e `TOKEN_SECRET` definidos com valores fortes.

Contribuições são bem-vindas. Abra issues ou PRs no repositório remoto.