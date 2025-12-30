const { Sequelize, DataTypes } = require('sequelize')

/* =====================
   CONEXÃO POSTGRES (NEON)
===================== */
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  timezone: '-03:00' // IMPORTANTE para não voltar um dia
})

/* =====================
   ADMIN
===================== */
const Admin = sequelize.define('Admin', {
  login: {
    type: DataTypes.STRING,
    allowNull: false
  },
  senha: {
    type: DataTypes.STRING,
    allowNull: false
  }
})

/* =====================
   MOTOQUEIRO
===================== */
const Motoqueiro = sequelize.define('Motoqueiro', {
  nome: {
    type: DataTypes.STRING,
    allowNull: false
  },
  telefone: DataTypes.STRING,
  login: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  senha: {
    type: DataTypes.STRING,
    allowNull: false
  }
})

/* =====================
   LANÇAMENTO
===================== */
const Lancamento = sequelize.define('Lancamento', {
  data: {
    type: DataTypes.DATEONLY, // 🔥 NÃO USE DATE
    allowNull: false
  },
  diaria: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  taxa: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  qtd_entregas: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  qtd_taxas_acima_10: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  vales: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  }
})

/* =====================
   TOTAL
===================== */
const Total = sequelize.define('Total', {
  data: {
    type: DataTypes.DATEONLY, // 🔥 evita bug de data -1
    allowNull: false
  },
  total: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  pago: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
})

/* =====================
   RELACIONAMENTOS
===================== */
Motoqueiro.hasMany(Lancamento, {
  foreignKey: { allowNull: false },
  onDelete: 'CASCADE'
})
Lancamento.belongsTo(Motoqueiro)

Motoqueiro.hasMany(Total, {
  foreignKey: { allowNull: false },
  onDelete: 'CASCADE'
})
Total.belongsTo(Motoqueiro)

/* =====================
   EXPORTS
===================== */
module.exports = {
  sequelize,
  Admin,
  Motoqueiro,
  Lancamento,
  Total
}
