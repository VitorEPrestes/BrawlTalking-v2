# BrawlTalking Reborn

Repositório local sincronizado com https://github.com/VitorEPrestes/BrawlTalking-v2

Projeto de chat em tempo real para BrawlTalking, com frontend ativo em JavaScript puro e painel administrativo integrado.

Estrutura principal:
- `server.js` — servidor HTTP, API, SSE e regras de moderação
- `public/` — frontend ativo (`app.js`, `index.html`, `styles.css`, `brawlers.json`)
- `chat-config.json` — mensagens iniciais e textos de digitação por personagem
- `moderation-config.json` — persistência dos filtros e configurações de moderação do painel admin
- `BrawlTalking/frontend/` — arquivos React legados de referência, não usados pelo servidor atual
- `tests/` — smoke tests e validações básicas de configuração

Como rodar:

1. Instale dependências:

```bash
npm install
```

2. Valide sintaxe e testes:

```bash
npm run check
npm test
```

3. Inicie a aplicação:

```bash
npm start
```

Variáveis de ambiente recomendadas:

- `ADMIN_PASSWORD`: senha do painel administrativo.
- `TOKEN_SECRET`: segredo usado para assinar tokens de autenticação.

Qualquer ambiente fora de `development` exige `ADMIN_PASSWORD` e `TOKEN_SECRET` definidos com valores fortes, diferentes dos padrões locais.

Melhorias implementadas nesta versão:

- catálogo de personagens centralizado em `public/brawlers.json`
- sessão de usuário endurecida com `sessionSecret` e `streamToken`
- home com busca por personagem
- onboarding com consentimento explícito
- feedback melhor no chat e mais resiliência a falhas de API
- cache de assets versionados em produção

Persistência de moderação:

- Alterações em filtro de palavras, blacklist de apelidos e modo de moderação são salvas em `moderation-config.json`.

Contribuições são bem-vindas. Abra issues ou PRs no repositório remoto.