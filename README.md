# 🎧 Simulador de Streams Musicais (Estilo Spotify)

> **✨ Nota do Autor:** Este é um projeto totalmente pessoal, desenvolvido e movido pelo meu entusiasmo genuíno por música e pela minha paixão pela arquitetura Back-End! O meu grande objetivo aqui foi abrir a "caixa preta" e simular os desafios de engenharia que plataformas reais como o Spotify e a Apple Music enfrentam todos os dias para processar milhões de dados sem travar.

Este sistema simula com precisão o motor de contagem de reproduções de uma plataforma de streaming, aplicando regras de validação de tempo para contabilização e relatórios atualizados em tempo real.

---

## 🛠️ Tecnologias e Arquitetura

Para resolver o desafio de lidar com grandes volumes de cliques e dados, montei uma arquitetura utilizando uma abordagem híbrida de bancos de dados:

* **Node.js + Express:** A base do nosso servidor, gerenciando as rotas de forma leve e extremamente rápida.
* **Redis (NoSQL em memória):** A nossa camada de alta velocidade. Utilizado para segurar as sessões de reprodução ativas e computar os contadores na velocidade da luz diretamente na memória do computador.
* **PostgreSQL (Banco Relacional):** A nossa base de dados focada na consistência e segurança, armazenando de forma permanente o catálogo de artistas, músicas e os logs de histórico de reprodução.

---

## 🧠 Regras de Negócio e Fluxo do Sistema

1.  **O "Play" (`POST /api/playback/start`):** Quando o usuário escolhe uma faixa, o Node.js cria instantaneamente uma sessão temporária no Redis vinculando aquele usuário à música.
2.  **A Validação dos 30 Segundos (`POST /api/playback/stop`):** Ao parar ou passar a música, o progresso é avaliado:
    * *Se ouviu menos de 30 segundos:* A sessão é descartada no Redis e nada é cobrado ou computado (bloqueio automático de pulos rápidos).
    * *Se ouviu 30 segundos ou mais:* O stream é validado! O Node salva o log definitivo no PostgreSQL para futuras auditorias e incrementa os painéis rápidos do Redis.
3.  **Métricas em Tempo Real (`GET /api/artistas/:id/metricas`):** O painel consolida o total acumulado de streams e calcula a quantidade de ouvintes únicos de forma instantânea.

---

## ⚙️ Como Executar o Projeto Localmente

### 1. Pré-requisitos
* **Node.js** instalado na máquina.
* **PostgreSQL** rodando localmente.

### 2. Inicializando o Redis (Nativo)
Para este projeto, foi utilizada uma abordagem leve rodando o Redis nativo diretamente de uma pasta local do Windows:
1. Abra a pasta do seu executável do Redis.
2. Execute o arquivo `redis-server.exe` para ligar o banco na porta padrão `6379`.

### 3. Estruturando o Banco de Dados (PostgreSQL)
Abra o seu gerenciador de banco de dados (como o pgAdmin) e execute o script abaixo para criar as tabelas do catálogo e do histórico:

```sql
CREATE TABLE artistas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL
);

CREATE TABLE musicas (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    artista_id INT REFERENCES artistas(id)
);

CREATE TABLE historico_streams (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    musica_id INT REFERENCES musicas(id),
    escutado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserindo dados iniciais para testes
INSERT INTO artistas (id, nome) VALUES (1, 'Future');
INSERT INTO musicas (id, titulo, artista_id) VALUES (1, 'March Madness', 1);

4. Instalando os Módulos e Ligando o Servidor
Abra o terminal na pasta do projeto e rode os comandos abaixo para instalar as dependências necessárias e ligar a API:

Bash
# Instala o Express e os drivers oficiais do Redis e Postgres
npm install express redis pg

# Inicia a aplicação
node index.js
Se tudo estiver configurado, o terminal mostrará as mensagens de sucesso de conexão com os servidores!

🏁 Rotas para Testes Rápidos (Thunder Client / Postman)
🟢 Iniciar uma Reprodução (POST)
URL: http://localhost:3000/api/playback/start

Body (JSON):

JSON
{
  "userId": 99,
  "trackId": 1
}
Guarde o playbackSessionId que você vai receber de resposta!

🔴 Parar/Pular a Faixa (POST)
URL: http://localhost:3000/api/playback/stop

Body (JSON):

JSON
{
  "playbackSessionId": "COLE_O_ID_RECEBIDO_AQUI",
  "currentProgressSeconds": 35
}
📊 Consultar o Painel do Artista (GET)
URL: http://localhost:3000/api/artistas/1/metricas

💡 Projeto construído focado em estudos de alta performance, manipulação de cache em memória com bancos NoSQL e persistência estruturada relacional
