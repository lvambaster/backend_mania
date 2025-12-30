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


// ==============================
// 📦 LANÇAMENTOS (ADMIN)
// ==============================
routes.post('/lancamentos', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  const lancamento = await Lancamento.create(req.body)

  const {
    diaria,
    taxa,
    qtd_taxas_acima_10,
    qtd_entregas,
    vales,
    data,
    MotoqueiroId
  } = lancamento

  const totalCalculado =
    diaria + taxa + qtd_taxas_acima_10 - qtd_entregas - vales

  const total = await Total.create({
    MotoqueiroId,
    data,
    total: totalCalculado
  })

  res.json({ lancamento, total })
})


routes.get('/lancamentos', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  const { data } = req.query
  const where = {}

  if (data) {
    where[Op.and] = [
      whereFn(fn('date', col('Lancamento.data')), data)
    ]
  }

  const lancamentos = await Lancamento.findAll({
    where,
    include: {
      model: Motoqueiro,
      attributes: ['id', 'nome']
    },
    order: [['data', 'DESC']]
  })

  res.json(lancamentos)
})


routes.put('/lancamentos/:id', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  const { id } = req.params

  const lancamento = await Lancamento.findByPk(id)
  if (!lancamento) {
    return res.status(404).json({ erro: 'Lançamento não encontrado' })
  }

  await lancamento.update(req.body)

  // recalcula total
  const totalCalculado =
    lancamento.diaria +
    lancamento.taxa +
    lancamento.qtd_taxas_acima_10 -
    lancamento.qtd_entregas -
    lancamento.vales

  await Total.update(
    { total: totalCalculado },
    {
      where: {
        MotoqueiroId: lancamento.MotoqueiroId,
        data: lancamento.data
      }
    }
  )

  res.json(lancamento)
})



routes.delete('/lancamentos/:id', async (req, res) => {
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado' })
  }

  const lancamento = await Lancamento.findByPk(req.params.id)
  if (!lancamento) {
    return res.status(404).json({ erro: 'Lançamento não encontrado' })
  }

  await Total.destroy({
    where: {
      MotoqueiroId: lancamento.MotoqueiroId,
      data: lancamento.data
    }
  })

  await lancamento.destroy()

  res.json({ ok: true })
})




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

    if (inicio && fim) {
      where.data = {
        [Op.between]: [inicio, fim]
      };
    }

    const totais = await Total.findAll({
      where,
      attributes: [
        "data",
        "total",
        "qtd_entregas",
        "qtd_taxas_acima_10"
      ],
      order: [["data", "ASC"]]
    });

    res.json(totais);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar totais" });
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
