require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const { sequelize, Admin } = require('./models')
const routes = require('./routes')

const app = express()

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))


app.use(express.json())
app.use(routes)

sequelize.sync({ alter: true })
  .then(async () => {
    console.log('✅ Banco conectado ao Neon')

    const adminExistente = await Admin.findOne({
      where: { login: 'admin' }
    })

    if (!adminExistente) {
      const senhaHash = await bcrypt.hash('admin123', 10)
      await Admin.create({
        login: 'admin',
        senha: senhaHash
      })
      console.log('👤 Admin criado com sucesso')
    }

    app.listen(process.env.PORT || 3000, () => {
      console.log(`🚀 Servidor rodando na porta ${process.env.PORT || 3000}`)
    })
  })
  .catch(err => {
    console.error('❌ Erro ao conectar no banco:', err)
  })
