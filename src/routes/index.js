const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const auth = require("../middleware/auth");
const { Admin, Motoqueiro, Lancamento, Total } = require("../models");
const { Op, fn, col, where: whereFn } = require("sequelize");

const routes = express.Router();

/* ======================================================
   🔧 FUNÇÃO CENTRAL — RECALCULAR TOTAL DO DIA
====================================================== */
async function recalcularTotalDia(MotoqueiroId, data) {
  const lancamentos = await Lancamento.findAll({
    where: { MotoqueiroId, data }
  });

  // Se não houver lançamentos, remove o total
  if (lancamentos.length === 0) {
    await Total.destroy({ where: { MotoqueiroId, data } });
    return;
  }

  let totalCalculado = 0;

  lancamentos.forEach(l => {
    totalCalculado +=
      l.diaria +
      l.taxa +
      l.qtd_taxas_acima_10 -
      l.qtd_entregas -
      l.vales;
  });

  const [registro] = await Total.findOrCreate({
    where: { MotoqueiroId, data },
    defaults: { total: totalCalculado }
  });

  if (registro.total !== totalCalculado) {
    registro.total = totalCalculado;
    await registro.save();
  }
}

/* ======================================================
   🔓 LOGIN ADMIN
====================================================== */
routes.post("/login", async (req, res) => {
  const { login, senha } = req.body;

  const admin = await Admin.findOne({ where: { login } });
  if (!admin) return res.status(401).json({ erro: "Login inválido" });

  const ok = await bcrypt.compare(senha, admin.senha);
  if (!ok) return res.status(401).json({ erro: "Senha inválida" });

  const token = jwt.sign(
    { id: admin.id, tipo: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({ token });
});

/* ======================================================
   🔓 LOGIN MOTOQUEIRO
====================================================== */
routes.post("/login-motoqueiro", async (req, res) => {
  const { login, senha } = req.body;

  const motoqueiro = await Motoqueiro.findOne({ where: { login } });
  if (!motoqueiro) return res.status(401).json({ erro: "Login inválido" });

  const ok = await bcrypt.compare(senha, motoqueiro.senha);
  if (!ok) return res.status(401).json({ erro: "Senha inválida" });

  const token = jwt.sign(
    { id: motoqueiro.id, tipo: "motoqueiro" },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({
    token,
    motoqueiro: {
      id: motoqueiro.id,
      nome: motoqueiro.nome
    }
  });
});

/* ======================================================
   🔐 ROTAS PROTEGIDAS
====================================================== */
routes.use(auth);

/* ======================================================
   👤 MOTOQUEIROS (ADMIN)
====================================================== */
routes.post("/motoqueiros", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  req.body.senha = await bcrypt.hash(req.body.senha, 10);
  res.json(await Motoqueiro.create(req.body));
});

routes.get("/motoqueiros", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  res.json(await Motoqueiro.findAll());
});

/* ======================================================
   📦 LANÇAMENTOS (ADMIN)
====================================================== */
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

/* ======================================================
   💰 TOTAIS — ADMIN
====================================================== */
routes.get("/totais", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  const totais = await Total.findAll({
    include: {
      model: Motoqueiro,
      attributes: ["id", "nome"]
    },
    order: [["data", "DESC"]]
  });

  res.json(totais);
});

/* ======================================================
   💰 TOTAIS — MOTOQUEIRO (DASHBOARD)
====================================================== */
routes.get("/totais/me", async (req, res) => {
  try {
    const { inicio, fim } = req.query;

    const where = {
      MotoqueiroId: req.user.id
    };

    // 📅 Últimos 7 dias (padrão)
    if (inicio && fim) {
      where.data = { [Op.between]: [inicio, fim] };
    } else {
      const hoje = new Date();
      const seteDias = new Date();
      seteDias.setDate(hoje.getDate() - 6);

      where.data = {
        [Op.gte]: seteDias.toISOString().split("T")[0]
      };
    }

    const totais = await Total.findAll({
      where,
      attributes: ["data", "total", "pago"],
      order: [["data", "ASC"]]
    });

    const lancamentos = await Lancamento.findAll({
      where,
      attributes: [
        "data",
        [fn("SUM", col("qtd_entregas")), "qtd_entregas"],
        [fn("SUM", col("qtd_taxas_acima_10")), "qtd_taxas_acima_10"]
      ],
      group: ["data"]
    });

    const mapa = {};
    lancamentos.forEach(l => {
      mapa[l.data] = {
        qtd_entregas: Number(l.getDataValue("qtd_entregas")) || 0,
        qtd_taxas_acima_10:
          Number(l.getDataValue("qtd_taxas_acima_10")) || 0
      };
    });

    const resultado = totais.map(t => ({
      data: t.data,
      total: Number(t.total),
      pago: Boolean(t.pago),
      qtd_entregas: mapa[t.data]?.qtd_entregas || 0,
      qtd_taxas_acima_10: mapa[t.data]?.qtd_taxas_acima_10 || 0
    }));

    res.json(resultado);
  } catch (err) {
    console.error("ERRO TOTAIS:", err);
    res.status(500).json({ erro: "Erro ao buscar dados do dashboard" });
  }
});

/* ======================================================
   💸 MARCAR TOTAL COMO PAGO (ADMIN)
====================================================== */
routes.put("/totais/:id/pagar", async (req, res) => {
  if (req.user.tipo !== "admin")
    return res.status(403).json({ erro: "Acesso negado" });

  const total = await Total.findByPk(req.params.id);
  if (!total)
    return res.status(404).json({ erro: "Total não encontrado" });

  total.pago = true;
  await total.save();

  res.json(total);
});

module.exports = routes;
