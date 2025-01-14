# PDF Tradutor

Uma aplicação web para tradução automática de documentos PDF utilizando a API da OpenAI.

## 🚀 Funcionalidades

- Upload de arquivos PDF
- Tradução automática entre múltiplos idiomas
- Suporte para os seguintes idiomas:
  - Português
  - Inglês
  - Espanhol
  - Francês
  - Alemão
  - Italiano
  - Japonês
  - Chinês
  - Russo
- Acompanhamento em tempo real do progresso da tradução
- Download do documento traduzido
- Interface intuitiva e responsiva

## 💻 Tecnologias

### Frontend
- React
- TypeScript
- TailwindCSS
- Socket.IO Client
- Axios

### Backend
- Node.js
- Express
- TypeScript
- Prisma (ORM)
- Socket.IO
- OpenAI API

## 🛠️ Instalação

### Pré-requisitos
- Node.js 18+
- npm ou yarn
- PostgreSQL

### Configuração do Backend

1. Clone o repositório:
```bash
git clone https://github.com/IASantaFeAgroInstituto/PDF-tradutor.git
cd PDF-tradutor
```

2. Instale as dependências do backend:
```bash
cd server
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```
Edite o arquivo `.env` com suas configurações:
- `DATABASE_URL`: URL de conexão com o PostgreSQL
- `OPENAI_API_KEY`: Sua chave da API da OpenAI
- `JWT_SECRET`: Chave secreta para autenticação
- `PORT`: Porta do servidor (padrão: 3000)

4. Execute as migrações do banco de dados:
```bash
npx prisma migrate dev
```

5. Inicie o servidor:
```bash
npm run dev
```

### Configuração do Frontend

1. Em outro terminal, instale as dependências do frontend:
```bash
cd ../
npm install
```

2. Configure as variáveis de ambiente do frontend:
```bash
cp .env.example .env
```

3. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```
## Estrutura do código:

JESSE
├── .bolt
├── knowledge_bases/
├── node_modules/
├── server/
│   ├── knowledge_bases/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── server/
│   └── src/
│       ├── config/
│       │   ├── database.ts
│       │   ├── env.ts
│       │   ├── openai.ts
│       │   ├── security.ts
│       │   └── socket.ts
│       ├── controllers/
│       ├── middlewares/
│       ├── routes/
│       ├── scripts/
│       ├── services/
│       ├── test/
│       ├── types/
│       └── utils/
│       ├── app.ts
│       ├── index.ts
│       └── server.ts
│   ├── test/
│   ├── uploads/
│   ├── .env
│   ├── .npmrc
│   └── tsconfig.json
├── src/
│   ├── @types/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── services/
│   ├── types/
│   ├── utils/
│   ├── .env
│   ├── App.tsx
│   ├── axiosConfig.ts
│   ├── index.css
│   ├── main.tsx
│   ├── socketConfig.ts
│   ├── vite-env.d.ts
│   ├── types.ts
├── test
├── uploads
├── .eslintrc.json
├── .gitignore
├── .railwayignore
├── eslint.config.js
├── index.html
├── jest.config.cjs
├── jest.config.js
├── package-lock.json
├── package.json
├── postcss.config.js
├── Procfile
├── railway.toml
├── README.md
├── tailwind.config.js
├── tsconfig.app.json
├── tsconfig.app.tsbuildinfo
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.node.tsbuildinfo
├── tsconfig.server.json
├── tsconfig.tsbuildinfo
└── vite.config.ts

## 🔧 Uso

1. Acesse a aplicação em `http://localhost:5173`
2. Faça login ou crie uma conta
3. Selecione o idioma de origem e destino
4. Faça upload do arquivo PDF que deseja traduzir
5. Acompanhe o progresso da tradução em tempo real
6. Faça o download do documento traduzido quando estiver pronto

## 📝 Notas

- O tamanho máximo do arquivo é limitado a 10MB
- A tradução é feita por chunks para otimizar o processo
- O sistema utiliza WebSockets para atualizações em tempo real
- Os arquivos são processados de forma assíncrona

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Faça commit das suas alterações (`git commit -m 'Add some AmazingFeature'`)
4. Faça push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👥 Autores

- **Instituto Agro Santa Fé** - *Desenvolvimento inicial* - [IASantaFeAgroInstituto](https://github.com/IASantaFeAgroInstituto)

## 📞 Suporte

Para suporte, envie um email para [EMAIL] ou abra uma issue no GitHub. 