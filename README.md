# BrawlTalking Reborn

**🌐 Acesse agora: [brawltalking.discloud.app](https://brawltalking.discloud.app)**

BrawlTalking é uma experiência de chat temática inspirada em **Brawl Stars**, o jogo mobile da Supercell. O usuário escolhe um Brawler (personagem do jogo) como avatar e entra em uma conversa em tempo real com um atendente humano ou moderador, como se estivesse interagindo dentro do universo do jogo.

## ✨ Funcionalidades

- 🎮 **Escolha de Brawler** — selecione seu personagem favorito (Spike, Colt, Shelly, Bull, Brock, El Primo, Angelo, Mina, Jessie, Nita) para entrar no chat
- 💬 **Chat em tempo real** — troca de mensagens via Server-Sent Events (SSE), sem necessidade de WebSocket
- 😄 **Reações** — reagia a mensagens com emojis temáticos (⭐ 🔥 💥 😂 👊 🌵)
- 🏆 **Ranking de Brawlers** — acompanhe quais personagens são mais populares no chat
- 🛡️ **Moderação** — painel de administração com filtro de palavrões, blacklist de nomes e modo de moderação configurável
- 📊 **Métricas** — acompanhamento de sessões ativas, tempos de resposta e duração das sessões

## 🗂️ Estrutura do projeto

```
BrawlTalking-v2/
├── server.js          # Servidor HTTP em Node.js puro (sem frameworks)
├── public/            # Frontend servido estaticamente
│   ├── index.html     # Página principal
│   ├── app.js         # Lógica do cliente em JavaScript puro
│   └── styles.css     # Estilos da interface
├── Portraits/         # Imagens dos Brawlers
├── BrawlTalking/      # Frontend legado (React)
├── discloud.config    # Configuração de deploy na Discloud
└── package.json
```

## 🚀 Como rodar localmente

**Pré-requisito:** Node.js 18 ou superior.

1. Clone o repositório e instale as dependências:

```bash
git clone https://github.com/VitorEPrestes/BrawlTalking-v2.git
cd BrawlTalking-v2
npm install
```

2. Inicie o servidor:

```bash
node server.js
```

3. Acesse `http://localhost:8080` no navegador.

### Variáveis de ambiente (opcionais)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `8080` | Porta do servidor |
| `HOST` | `0.0.0.0` | Host de escuta |
| `ADMIN_PASSWORD` | `admin123` | Senha do painel de administração |
| `TOKEN_SECRET` | *(valor padrão dev)* | Segredo para assinatura dos tokens JWT |

> ⚠️ Altere `ADMIN_PASSWORD` e `TOKEN_SECRET` em produção.

## 🛠️ Tecnologias

- **Backend:** Node.js puro (sem Express ou outros frameworks)
- **Frontend:** JavaScript vanilla, HTML e CSS (sem React ou bundlers)
- **Deploy:** [Discloud](https://discloud.app)

## 🤝 Contribuindo

Contribuições são bem-vindas! Abra uma issue ou envie um Pull Request.