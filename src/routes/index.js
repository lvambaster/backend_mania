const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const auth = require('../middleware/auth')
const { Admin, Motoqueiro, Lancamento, Total } = require('../models')
const { Op, fn, col, where: whereFn } = require('sequelize')

const routes = express.Router()

// ==============================
// 🔓 LOGIN ADMIN
// ==============================
routes.post('/login', async (req, res) => {
  const { login, senha } = req.body

  const admin = await Admin.findOne({ where: { login } })
  if (!admin) {
    return res.status(401).json({ erro: 'Login inválido' })
  }

  const ok = await bcrypt.compare(senha, admin.senha)
  if (!ok) {
    return res.status(401).json({ erro: 'Senha inválida' })
  }

  const token = jwt.sign(
    { id: admin.id, tipo: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  )

  res.json({ token })
})

// ==============================
// 🔓 LOGIN MOTOQUEIRO
// ==============================
routes.post('/login-motoqueiro', async (req, res) => {
  const { login, senha } = req.body

  const motoqueiro = await Motoqueiro.findOne({ where: { login } })
  if (!motoqueiro) {
    return res.status(401).json({ erro: 'Login inválido' })
  }

  const ok = await bcrypt.compare(senha, motoqueiro.senha)
  if (!ok) {
    return res.status(401).json({ erro: 'Senha inválida' })
  }

  const token = jwt.sign(
    { id: motoqueiro.id, tipo: 'motoqueiro' },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  )

  res.json({
    token,
    motoqueiro: {
      id: motoqueiro.id,
      nome: motoqueiro.nome
    }
  })
})

// ==============================
// 🔐 ROTAS PROTEGIDAS
// ==============================
routes.use(auth)

// ==============================
// 👤 CRUD MOTOQUEIROS (SÓ ADMIN)
// ==============================
routes.post('/motoqueiros', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  req.body.senha = await bcrypt.hash(req.body.senha, 10)
  res.json(await Motoqueiro.create(req.body))
})

routes.get('/motoqueiros', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  res.json(await Motoqueiro.findAll())
})



routes.put('/motoqueiros/:id', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  const { id } = req.params
  const { nome, telefone, login, senha } = req.body

  const dados = { nome, telefone, login }

  if (senha && senha.trim() !== '') {
    dados.senha = await bcrypt.hash(senha, 10)
  }

  const atualizado = await Motoqueiro.update(dados, {
    where: { id }
  })

  if (!atualizado[0]) {
    return res.status(404).json({ erro: 'Motoqueiro não encontrado' })
  }

  res.json({ ok: true })
})


/* ======================================================
   📦 LANÇAMENTOS (ADMIN)
====================================================== */

// 🔹 CRIAR
routes.post("/lancamentos", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  const lancamento = await Lancamento.create(req.body);

  await recalcularTotalDia(
    lancamento.MotoqueiroId,
    lancamento.data
  );

  res.json(lancamento);
});

// 🔹 LISTAR + FILTRAR (NOME / DATA)
routes.get("/lancamentos", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  const { motoqueiroId, data } = req.query;
  const where = {};

  if (motoqueiroId) {
    where.MotoqueiroId = motoqueiroId;
  }

  if (data) {
    where.data = data;
  }

  const lancamentos = await Lancamento.findAll({
    where,
    include: {
      model: Motoqueiro,
      attributes: ["id", "nome"]
    },
    order: [["data", "DESC"]]
  });

  res.json(lancamentos);
});

// 🔹 BUSCAR POR ID (EDIÇÃO)
routes.get("/lancamentos/:id", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  const lancamento = await Lancamento.findByPk(req.params.id);

  if (!lancamento) {
    return res.status(404).json({ erro: "Lançamento não encontrado" });
  }

  res.json(lancamento);
});

// 🔹 EDITAR
routes.put("/lancamentos/:id", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  const lancamento = await Lancamento.findByPk(req.params.id);
  if (!lancamento)
    return res.status(404).json({ erro: "Lançamento não encontrado" });

  const dataAntiga = lancamento.data;

  await lancamento.update(req.body);

  await recalcularTotalDia(lancamento.MotoqueiroId, dataAntiga);
  await recalcularTotalDia(lancamento.MotoqueiroId, lancamento.data);

  res.json(lancamento);
});

// 🔹 EXCLUIR
routes.delete("/lancamentos/:id", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  const lancamento = await Lancamento.findByPk(req.params.id);
  if (!lancamento)
    return res.status(404).json({ erro: "Lançamento não encontrado" });

  const { MotoqueiroId, data } = lancamento;

  await lancamento.destroy();
  await recalcularTotalDia(MotoqueiroId, data);

  res.json({ ok: true });
});

// ==============================
// 💰 TOTAIS — ADMIN
// ==============================
routes.get('/totais', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  const { motoqueiroId, data } = req.query
  const where = {}

  if (motoqueiroId) where.MotoqueiroId = motoqueiroId
  if (data) {
    where[Op.and] = [whereFn(fn('date', col('Total.data')), data)]
  }

  const totais = await Total.findAll({
    where,
    include: {
      model: Motoqueiro,
      attributes: ['id', 'nome']
    },
    order: [['data', 'DESC']]
  })

  res.json(totais)
})


// ==============================
// 💰 TOTAIS — MOTOQUEIRO LOGADO
// ==============================
routes.get("/totais/me", async (req, res) => {
  try {
    const { inicio, fim } = req.query;

    const where = {
      MotoqueiroId: req.user.id
    };

    // 📅 FILTRO DE DATA (PADRÃO = ÚLTIMOS 7 DIAS)
    if (inicio && fim) {
      where.data = {
        [Op.between]: [inicio, fim]
      };
    } else {
      const hoje = new Date();
      const seteDias = new Date();
      seteDias.setDate(hoje.getDate() - 6);

      where.data = {
        [Op.gte]: seteDias.toISOString().split("T")[0]
      };
    }

    // 🔹 1️⃣ BUSCA TOTAIS (VALOR + PAGO)
    const totais = await Total.findAll({
      where,
      attributes: ["data", "total", "pago"],
      order: [["data", "ASC"]]
    });

    // 🔹 2️⃣ BUSCA MÉTRICAS (MESMO FILTRO!)
    const lancamentos = await Lancamento.findAll({
      where,
      attributes: [
        "data",
        [fn("SUM", col("qtd_entregas")), "qtd_entregas"],
        [fn("SUM", col("qtd_taxas_acima_10")), "qtd_taxas_acima_10"]
      ],
      group: ["data"]
    });

    // 🔹 3️⃣ MAPA DE MÉTRICAS POR DATA
    const mapaLancamentos = {};
    lancamentos.forEach(l => {
      const data = l.data;
      mapaLancamentos[data] = {
        qtd_entregas: Number(l.getDataValue("qtd_entregas")) || 0,
        qtd_taxas_acima_10:
          Number(l.getDataValue("qtd_taxas_acima_10")) || 0
      };
    });

    // 🔹 4️⃣ RESULTADO FINAL (SEM DUPLICAR)
    const resultado = totais.map(t => {
      const data = t.data;

      return {
        data,
        total: Number(t.total) || 0,
        pago: Boolean(t.pago),
        qtd_entregas: mapaLancamentos[data]?.qtd_entregas || 0,
        qtd_taxas_acima_10:
          mapaLancamentos[data]?.qtd_taxas_acima_10 || 0
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error("ERRO TOTAIS:", err);
    res.status(500).json({ erro: "Erro ao buscar dados do dashboard" });
  }
});


// ==============================
// 💸 MARCAR COMO PAGO (ADMIN)
// ==============================
routes.put('/totais/:id/pagar', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  const total = await Total.findByPk(req.params.id)
  if (!total) {
    return res.status(404).json({ erro: 'Total não encontrado' })
  }

  total.pago = true
  await total.save()

  res.json(total)
})

module.exports = routes
