# Próximos passos
~~1. Refatorar o service de tradução para os Assistants OpenAI~~
  ~~Finalizar Service e refatorar o Controllers e Routes~~
  ~~Ajustar funções e fluxo da tradução.~~
    ~~Refatorar as principais funções: dividir em chunks (não acho que é mais necessário), traduzir (agora é um Assistant), formatar a resposta e montar o arquivo final, acompanhamento do progresso e status, precificação, etc~~
~~2. Cargos e roles para os usuários (Superuser; Tradutor; Editor)~~
  Refatorar o front, com funções específicas para cada cargo.~~
~~3. Uma nova aba de Admin, disponível apenas para Superuser
  - Gerenciar usuários - Da para acessar individual as informaçes de cada usuário, como usage, custos, arquivos, prompts personalizados, arquivos traduzidos, últimas atividades.
  - Gerenciar o Assistant Padrão - Temperatura, Modelo, instrução, etc.
4. Refatorar o types do frontend
5. Refatorar e transferir o serviço de Base de Conhecimento para o OpenAI
  A Base de Dados agora deve ser de 1:N arquivos (máximo permitido pela Vector Store).
  Usar a Vector Store para armazenar e buscar informações, facilitando nosso service
  Service e Controllers e Routes
  Refatorar o front para que seja possível adicionar e remover arquivos da Base de Conhecimento.
6. Refatorar e transferir o serviço de Prompts Personalizados para o OpenAI
  Mudar nomenclatura (dos arquivos e afins) de Prompts para Assistants. Assim cada vez mais similar a OpenAI.
  Controllers e Routes
  Refatorar o front para que seja possível configurar a temperatura, modelo, instrução dos assistentes personalizados.
  Função de visibilidade Global ou Privado para cada assistente. (a nível de Tradutores)
7. Refatorar OpenAI.ts
8. Refatorar o front da aba de tradução:
  Função para compartilhar arquivos com os editores.
  Para os usuários Editor:
    O Editor não tem permissão para traduzir ou as outras abas. Sua função é apenas editar o conteúdo dos arquivos traduzidos. É um diagramador. Ele poderá visualizar os arquivos compartilhados com ele
9. Refatorar função de cálculo de custos de tradução.
10. Documentar o projeto por completo com explicação e detalhamento de cada parte do código e explicação de onde está cada infraestrutura (Railway, Vercel, etc)

