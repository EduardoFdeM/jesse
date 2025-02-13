# Próximos passos
1. Refatorar o service de tradução para os Assistants OpenAI
  Finalizar Service e refatorar o Controllers e Routes
  Ajustar funções e fluxo da tradução.
  Lógica:
    Escolhe-se um idioma de origem e um de destino, e seleciona-se o arquivo que deseja traduzir.
    É possível selecionar uma Base de Conhecimento (Vector Store), que vai ser o contexto para o assistant traduzir o arquivo.
      Caso não seja selecionado, o arquivo é traduzido pelo Assistant padrão, sem contexto adicional.
      É importante entender que os assistants não são vinculados as vector stores. Queremos que seja mutável. Que a cada tradução, possamos vincular diferentes bases de conhecimento a diferentes assistentes.
    É possível selecionar um assistant personalizado, que vai ser o assistant que vai traduzir o conteúdo do arquivo selecionado.
      Caso não seja selecionado, o arquivo é traduzido pelo Assistant padrão.   
    Perceba que toda função de contextualização na tradução, é feita pela própria openai. Não é necessário fazer nada no nosso sistema. E parte de quebra de chunks, e reformatação de input... também não.
    Mais para frente é mais detalhado e explicado individualmente a parte da base de conhecimento e assistentes personalizados..
  Fluxo/algoritimo:
    Usuário abre a aba de tradução.
    Puxa-se os históricos de traduções do usuário, que estão registrados no banco de dados.
    Escolhe o idioma de origem e o de destino. Seleciona o arquivo que deseja traduzir.
    Caso deseje, seleciona uma base de conhecimento e/ou um assistant personalizado.
    Clica em traduzir.
    Captura-se o conteúdo do arquivo enviado para enviar apenas o texto para openai já que não é possível enviar o arquivo inteiro nas requisições.
    Verifica-se o tamanho do arquivo e se respeita o limite de 128k de tokens do modelo que está sendo utilizado (GPT-4o-mini).
      Caso o tamanho do arquivo seja maior que o limite, é feito um split do arquivo em partes menores, que tenham menos de 128k de tokens cada e um leve overlap para não perder informações e contexto.
    O sistema faz a requisição para o OpenAI:
      Cria-se uma thread (/v1/threads).
        Caso seja selecionado uma base de conhecimento, é adicionado o ID da vector store na requisição de criação da thread.
      Cria-se uma message (/v1/threads/{thread_id}/messages). Aqui é adicionado o conteúdo do arquivo texto e o role de 'user'. Pois aqui é como se fosse o usuário enviando o arquivo para o assistant traduzir. O assistant já foi configurado na thread.
      Cria-se uma run (/v1/threads/{thread_id}/runs).
        Caso seja selecionado um assistant personalizado, é adicionado o ID do assistant personalizado na requisição de criação da run.
      É feito um loop de requisição para capturar o status da run e assim pegar o retorno do OpenAI (/v1/threads/{thread_id}/runs/{run_id}).
      Quando a run está completed, é pego o retorno do OpenAI e montado o arquivo final com o conteúdo traduzido e mantendo a formatação original do arquivo.
      Retorna-se o arquivo final para o bucket de arquivos.
      Salva-se o histórico de tradução no banco de dados.
      Atualiza o frontend para que seja possível visualizar o histórico de traduções e os novos arquivos traduzidos.
~~2. Cargos e roles para os usuários (Superuser; Tradutor; Editor)~~
  ~~Refatorar o front, com funções específicas para cada cargo.~~
~~3. Uma nova aba de Admin, disponível apenas para Superuser~~
  ~~- Gerenciar usuários - Da para acessar individual as informaçes de cada usuário, como usage, custos, arquivos, prompts personalizados, arquivos traduzidos, últimas atividades~~
  ~~- Gerenciar o Assistant Padrão - Temperatura, Modelo, instrução, etc.~~
~~4. Refatorar o types do frontend~~
5. Refatorar e transferir o serviço de Base de Conhecimento para o OpenAI
  A Base de Dados agora deve ser de 1:N arquivos (máximo permitido pela Vector Store).
  Usar a Vector Store para armazenar e buscar informações, facilitando nosso service
  Service e Controllers e Routes
  Refatorar o front para que seja possível adicionar e remover arquivos da Base de Conhecimento.
  Lógica:
    Na tradução:
      Caso seja selecionado uma Base de Conhecimento (Vector Store), então é adicionado o ID da vector store na requisição de criação da thread, para que sirva de contexto para o Assistant.
      Caso não seja selecionado, o Assistant traduz apenas o conteúdo do arquivo selecionado e a instrução na qual ele tem, seja o assistant padrão ou um personalizado.
    Na aba base de conhecimento - sub-aba base de conhecimento:
      Será possível criar, editar e deletar as vector stores.
      Será possível adicionar arquivos a estas vector stores.
      Será possível visualizar as informações de cada vector store.
      Na criação de uma vector store, será possível vincular um arquivo da OpenAI (via dropbox) que já existe, ou subir diretamente na vizualização. 
    Na aba base de conhecimento - sub-aba arquivos da OpenAI:
      Será possível criar e deletar os arquivos.
      Será possível visualizar as informações de cada arquivo.
    Perceba que toda função de contextualização na tradução, é feita pela própria openai. Não é necessário fazer nada no nosso sistema.
  Fluxo/algoritimo:
    Sub-aba base de conhecimento:
      Usuário abre a aba base de conhecimento, já na sub-aba base de conhecimento.
      Envia-se uma requisição do tipo GET (/v1/vector_stores) para a rota de listagem de vector stores.
      Clica em criar nova base
      Cria uma vector store
        Usuário adiciona nome, descrição e seleciona o arquivo(s) da OpenAI que deseja usar na vector store, ou sobe novos, até 10 arquivos, respeitando o limite da OpenAI.
      Se o usuário não subiu novos arquivos no momento de criação da vector store, envia-se uma requisição do tipo POST (/v1/vector_stores) para a rota de criação de vector store, passando o(s) arquivo(s) selecionado(s) (/v1/vector_stores/vs_abc123/files) e o nome.
      O nome e descrição serão metadados que vão para banco de dados. OpenAI não recebe descrição. 
      Agora caso o usuário tenha subido novos arquivos, envia-se primeiro requisições para subir esses arquivos para openai (POST /v1/files individualmente por arquivo), e depois uma requisição do tipo POST (/v1/vector_stores) para a rota de criação de vector store, passando o(s) arquivo(s) selecionado(s) (/v1/vector_stores/vs_abc123/files).
      Ao deletar uma vector store, envia-se uma requisição do tipo DELETE (v1/vector_stores/vs_abc123/files/file-abc123) para a rota de deletar uma vector store. Não é necessário apagar os arquivos da OpenAI, apenas a vector store.
      Ao deletar arquivo de vector store, envia-se uma requisição do tipo DELETE (v1/vector_stores/vs_abc123/files/file-abc123) para a rota de deletar um arquivo de vector store. Não é necessário apagar o arquivo da OpenAI, apenas o arquivo da vector store.
    Na sub-aba arquivos da OpenAI:
      E na aba de arquivos da OpenAI, envia-se uma requisição do tipo GET (/v1/files) para a rota de listagem de arquivos da OpenAI.
      Ao clicar para enviar novos arquivos, envia-se uma requisição do tipo POST (/v1/files) para a rota de criação de arquivos da OpenAI.
      Ao deletar um arquivo, envia-se uma requisição do tipo DELETE (v1/files/file-abc123) para a rota de deletar um arquivo da OpenAI.
6. Refatorar e transferir o serviço de Assistants Personalizados para o OpenAI
  Controllers e Routes
  Refatorar o front para que seja possível configurar a temperatura, modelo, instrução dos assistentes personalizados.
  Função de visibilidade Global ou Privado para cada assistente. (a nível de Tradutores)
  Lógica:
    Na tradução:
      Caso seja selecionado um assistant personalizado, então é adicionado o ID do assistant personalizado na requisição de criação da Run (/v1/threads/{thread_id}/runs), invés do prompt padrão.
      Caso não seja selecionado, é enviado o ID do assistant padrão, que está no arquivo do server/.env.
    Na aba assistant:
      Será possível criar, editar e deletar assistentes personalizados. Dando nome, instrução, modelo, temperatura, que são todas informações necessárias para a criação de um assistant na plataforma da openai.
  Fluxo/algoritimo:
    Usuário abre a aba assistant.
    Envia-se uma requisição do tipo GET (/v1/assistants) para a rota de listagem de assistentes.
      Filtra-se os assistentes pelo usuário logado, de acordo com a visibilidade do assistant, se é global ou privado.
      E remove-se da vizualização o assistant padrão..
    Cria um novo assistant
      Usuário adiciona nome, instrução, modelo, temperatura, que são todas informações necessárias para a criação de um assistant na plataforma da openai.
      E também é possível adionar tags para o assistant, e classificar como global ou privado. Esses dados são enviados para o banco de dados.
    Ao salvar, envia-se uma requisição do tipo POST (/v1/assistants) para a rota de criação de assistant na plataforma da openai.
    
    
7. Refatorar OpenAI.ts
~~8. Refatorar o front da aba de tradução:~~
  ~~Função para compartilhar arquivos com os editores.~~
  ~~Para os usuários Editor:~~
    ~~O Editor não tem permissão para traduzir ou as outras abas. Sua função é apenas editar o conteúdo dos arquivos traduzidos. É um diagramador. Ele poderá visualizar os arquivos compartilhados com ele~~
9. Refatorar função de cálculo de custos de tradução.
~~10. Documentar o projeto por completo com explicação e detalhamento de cada parte do código e explicação de onde está cada infraestrutura (Railway, Vercel, etc)~~

