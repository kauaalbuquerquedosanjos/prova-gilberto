import express from 'express';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Ajuste a senha ('password') se o MySQL da escola exigir uma
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // Deixe vazio se for o padrão sem senha do laboratório
  database: 'techshop',
  waitForConnections: true,
  connectionLimit: 10
});

const verificarAcesso = (nivelRequerido) => {
  return (req, res, next) => {
    const nivelUsuario = req.headers['user-level'];
    if (!nivelUsuario) {
      return res.status(401).json({ erro: 'Usuário não identificado.' });
    }
    if (nivelRequerido === 'Admin' && nivelUsuario !== 'Admin') {
      return res.status(403).json({ erro: 'Acesso negado. Apenas Administradores podem alterar dados.' });
    }
    next();
  };
};

app.get('/api/relatorio-vendas', async (req, res) => {
  try {
    const query = `
      SELECT p.id_pedido, c.nome AS nome_cliente,
      SUM(i.quantidade * i.preco_unitario) AS total_pedido, p.status_pedido
      FROM pedidos p
      INNER JOIN clientes c ON p.id_cliente = c.id_cliente
      INNER JOIN itens_pedido i ON p.id_pedido = i.id_pedido
      GROUP BY p.id_pedido, c.nome, p.status_pedido;
    `;
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get('/api/estoque', async (req, res) => {
  try {
    const query = `
      SELECT prod.id_produto, prod.nome_produto, prod.estoque AS estoque_atual,
      IFNULL(SUM(itens.quantidade), 0) AS total_unidades_vendidas
      FROM produtos prod
      LEFT JOIN itens_pedido itens ON prod.id_produto = itens.id_produto
      GROUP BY prod.id_produto, prod.nome_produto, prod.estoque;
    `;
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.put('/api/produtos/:id', verificarAcesso('Admin'), async (req, res) => {
  const { id } = req.params;
  const { novoEstoque } = req.body;

  if (novoEstoque === undefined || novoEstoque < 0) {
    return res.status(400).json({ erro: 'Quantidade de estoque inválida.' });
  }
  try {
    const [result] = await pool.query(
      'UPDATE produtos SET estoque = ? WHERE id_produto = ?',
      [novoEstoque, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    res.json({ mensagem: 'Estoque updated com sucesso com privilégios de Admin!' });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor TechShop rodando em http://localhost:${PORT}`);
});
