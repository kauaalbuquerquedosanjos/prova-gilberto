import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Conexão dinâmica (Usa a variável da Vercel ou string local)
const uri = process.env.MONGODB_URI || "SUA_URL_DO_MONGO_AQUI";
const client = new MongoClient(uri);
let db;

async function conectarBanco() {
  try {
    await client.connect();
    db = client.db('techshop');
    console.log("Conectado ao MongoDB com sucesso!");
  } catch (erro) {
    console.error("Falha ao conectar no MongoDB:", erro);
  }
}
conectarBanco();

// Middleware de Controle de Acesso (RBAC)
const verificarAcesso = (nivelRequerido) => {
  return (req, res, next) => {
    const nivelUsuario = req.headers['user-level'];
    if (!nivelUsuario) return res.status(401).json({ erro: 'Usuário não identificado.' });
    if (nivelRequerido === 'Admin' && nivelUsuario !== 'Admin') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas Administradores podem fazer alterações.' });
    }
    next();
  };
};

// -------------------------------------------------------------
// ENDPOINTS DE LEITURA (GET)
// -------------------------------------------------------------
app.get('/api/relatorio-vendas', async (req, res) => {
  try {
    const vendas = await db.collection('pedidos').aggregate([
      {
        \$lookup: {
          from: 'clientes',
          localField: 'id_cliente',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { unwind: 'cliente' },
      {
        \$project: {
          id_pedido: '\$_id',
          nome_cliente: '\$cliente.nome',
          total_pedido: '\$total',
          status_pedido: '\$status'
        }
      }
    ]).toArray();
    res.json(vendas);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get('/api/estoque', async (req, res) => {
  try {
    const estoque = await db.collection('produtos').find({}).toArray();
    const formatado = estoque.map(p => ({
      id_produto: p._id,
      nome_produto: p.nome,
      estoque_atual: p.estoque,
      total_unidades_vendidas: p.vendas || 0
    }));
    res.json(formatado);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// -------------------------------------------------------------
// ENDPOINTS DE MANIPULAÇÃO DE DADOS (PUT / DELETE) - Protegidos para Admin
// -------------------------------------------------------------
// Atualizar estoque
app.put('/api/produtos/:id', verificarAcesso('Admin'), async (req, res) => {
  const { id } = req.params;
  const { novoEstoque } = req.body;

  if (novoEstoque === undefined || novoEstoque < 0) {
    return res.status(400).json({ erro: 'Quantidade inválida.' });
  }
  try {
    const result = await db.collection('produtos').updateOne(
      { _id: new ObjectId(id) },
      { \$set: { estoque: novoEstoque } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ erro: 'Produto não encontrado.' });
    res.json({ mensagem: 'Estoque atualizado no MongoDB com privilégios de Admin!' });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Excluir pedido/venda
app.delete('/api/vendas/:id', verificarAcesso('Admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.collection('pedidos').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json({ mensagem: 'Pedido removido com sucesso com privilégios de Admin!' });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Excluir produto do estoque
app.delete('/api/produtos/:id', verificarAcesso('Admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.collection('produtos').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ erro: 'Produto não encontrado.' });
    res.json({ mensagem: 'Produto excluído com sucesso com privilégios de Admin!' });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
