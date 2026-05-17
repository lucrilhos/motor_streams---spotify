const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

// Conexão com o Postgre
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'simulador_streams',
    password: 'admin', 
    port: 5432,
});

// Conexão com o Redis 
const redisClient = createClient({
    url: 'redis://localhost:6379'
});
redisClient.on('error', (err) => console.error('Erro no Redis:', err));

async function conectarBancos() {
    await redisClient.connect();
    console.log('✅ Conectado ao Redis com sucesso!');
}
conectarBancos();

// ROTA 1: O USUÁRIO DEU "PLAY"
// ==========================================
app.post('/api/playback/start', async (req, res) => {
    const { userId, trackId } = req.body;

    if (!userId || !trackId) {
        return res.status(400).json({ error: "userId e trackId são obrigatórios." });
    }

    // ID único para essa sessão de reprodução 
    const playbackSessionId = `session_${userId}_${trackId}_${Date.now()}`;

    // Salva no Redis que essa música começou a tocar agora, foi definido um tempo de expiração (TTL) de 3600 segundos para não acumular lixo de memória
    const dadosSessao = {
        userId,
        trackId,
        startTime: Date.now()
    };

    await redisClient.set(playbackSessionId, JSON.stringify(dadosSessao), { EX: 3600 });

    res.json({ 
        message: "Música iniciada. Ouvindo...", 
        playbackSessionId 
    });
});


// ROTA 2: PAUSE NA MÚSICA OU A FAIXA FOI PASSADA
// ==========================================
app.post('/api/playback/stop', async (req, res) => {
    const { playbackSessionId, currentProgressSeconds } = req.body;

    if (!playbackSessionId || currentProgressSeconds === undefined) {
        return res.status(400).json({ error: "playbackSessionId e currentProgressSeconds são obrigatórios." });
    }

    // Busca a sessão temporária no Redis
    const sessionDataText = await redisClient.get(playbackSessionId);
    
    if (!sessionDataText) {
        return res.status(400).json({ error: "Sessão expirada, inválida ou stream já contabilizado." });
    }

    const { userId, trackId } = JSON.parse(sessionDataText);

    // Só conta stream se ouviu pelo menos 30 segundos (Default dos apps de música como Spotify, Apple Music e etc.)
    if (currentProgressSeconds >= 30) {
        
        // Descobrir quem é o artista dono dessa música usando o PostgreSQL
        const musicaQuery = await pool.query('SELECT artista_id FROM musicas WHERE id = $1', [trackId]);
        
        if (musicaQuery.rows.length === 0) {
            return res.status(404).json({ error: "música não encontrada no banco de dados" });
        }
        
        const artistId = musicaQuery.rows[0].artista_id;

        // Salvar o histórico bruto no PostgreSQL para auditoria de royalties
        await pool.query(
            'INSERT INTO historico_streams (user_id, musica_id) VALUES ($1, $2)',
            [userId, trackId]
        );

        // Contador global de reproduções da música no Redis 
        await redisClient.incr(`track:${trackId}:streams`);

        // Adicionar o usuário no set do redis para calcular os 'Ouvintes Únicos do Artista'
        // O Redis garante que mesmo se o usuário userId=5 ouvir 50 vezes, o comando SADD (Set) só vai computar ele uma vez!
        await redisClient.sAdd(`artist:${artistId}:listeners`, String(userId));

        // Apaga a sessão do Redis para impedir que a mesma requisição seja enviada duas vezes, o que evita fraude
        await redisClient.del(playbackSessionId);

        return res.json({ 
            status: "STREAM CONTABILIZADO", 
            tempoOuvido: currentProgressSeconds,
            elegivelRoyalties: true 
        });
    }

    // Se pulou antes dos 30 segundos
    await redisClient.del(playbackSessionId); // limpa a sessão
    return res.json({ 
        status: "Música pulada antes dos 30 segundos. Não contabilizado para o artista.",
        tempoOuvido: currentProgressSeconds,
        elegivelRoyalties: false 
    });
});


// ROTA 3: CONSULTAR AS MÉTRICAS DO ARTISTA
// ==========================================
app.get('/api/artistas/:id/metricas', async (req, res) => {
    const artistId = req.params.id;

    // Busca todas as músicas desse artista no Postgres
    const musicasDoArtista = await pool.query('SELECT id, titulo FROM musicas WHERE artista_id = $1', [artistId]);
    
    let totalStreamsDoArtista = 0;
    let detalhesMusicas = [];

    // Para cada música, lê o total de reproduções que foi salvo no redis
    for (let musica of musicasDoArtista.rows) {
        const streamsDaMusica = await redisClient.get(`track:${musica.id}:streams`) || 0;
        totalStreamsDoArtista += parseInt(streamsDaMusica);
        
        detalhesMusicas.push({
            id: musica.id,
            titulo: musica.titulo,
            streams: parseInt(streamsDaMusica)
        });
    }

    // Calcula a quantidade de Ouvintes Únicos pegando o tamanho (cardinalidade) do set no Redis
    const totalOuvintesUnicos = await redisClient.sCard(`artist:${artistId}:listeners`) || 0;

    res.json({
        artistaId: artistId,
        totalStreamsAcumulado: totalStreamsDoArtista,
        quantidadeOuvintesUnicos: totalOuvintesUnicos,
        musicas: detalhesMusicas
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});