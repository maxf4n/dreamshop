require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));

// API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', publicRoutes);

// Страницы — ВАЖНО: до express.static
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/pay', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pay.html'));
});

// Статика
app.use(express.static(path.join(__dirname, '..', 'public')));

// 404 для API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Общий обработчик ошибок
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`DreamShop server started: http://localhost:${PORT}`);
});