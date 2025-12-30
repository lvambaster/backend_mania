require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { sequelize, Admin } = require('./models')
const routes = require('./routes')

const app = express()

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174']
}))
app.use(express.json())
app.use(routes)


sequelize.sync().then(async () => {
  const bcrypt = require('bcryptjs')

  const adminExistente = await Admin.findOne({
    where: { login: 'admin' }
  })

  if (!adminExistente) {
    const senhaHash = await bcrypt.hash('admin123', 10)
    await Admin.create({
      login: 'admin',
      senha: senhaHash
    })
    console.log('Admin criado com sucesso')
  }

  app.listen(process.env.PORT, () =>
    console.log('Servidor rodando na porta ' + process.env.PORT)
  )
})