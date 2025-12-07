// server.js - simple demo banking backend (demo/fake money only)
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DATABASE_FILE || './prime-vault.db';
const JWT_SECRET = process.env.JWT_SECRET || 'please-set-a-secret';
const PORT = process.env.PORT || 4000;

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

if (!fs.existsSync(path.join(__dirname, 'migrations', 'init.sql'))) {
  console.error('migrations/init.sql missing. Run db.js or create migrations folder with init.sql.');
  process.exit(1);
}

const db = new sqlite3.Database(DB_FILE);

// helper
function generateAccountNumber() {
  // 10 digit numeric account
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

// routes
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  const account_number = generateAccountNumber();
  const password_hash = await bcrypt.hash(password, 10);
  db.run(
    'INSERT INTO users (name, email, password_hash, account_number, balance_cents, is_authorized) VALUES (?, ?, ?, ?, ?, ?)',
    [name, email, password_hash, account_number, 0, 0],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already used' });
        return res.status(500).json({ error: 'DB error', details: err.message });
      }
      return res.json({ message: 'Registered', account_number });
    }
  );
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const is_admin = user.account_number === '0000000000'; // reserved admin account
    const token = jwt.sign(
      { user_id: user.id, account_number: user.account_number, email: user.email, is_admin, is_authorized: !!user.is_authorized },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, account_number: user.account_number, is_authorized: !!user.is_authorized, is_admin });
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  db.get('SELECT id, name, email, account_number, balance_cents, is_authorized, created_at FROM users WHERE account_number = ?', [req.user.account_number], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ user: row });
  });
});

// admin deposit any amount to any account (amount in decimal)
app.post('/api/admin/deposit', authMiddleware, adminOnly, (req, res) => {
  const { account_number, amount } = req.body || {};
  if (!account_number || !amount) return res.status(400).json({ error: 'account_number and amount required' });
  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'amount must be positive number' });
  db.get('SELECT * FROM users WHERE account_number = ?', [account_number], (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    const newBalance = user.balance_cents + amountCents;
    db.run('UPDATE users SET balance_cents = ? WHERE account_number = ?', [newBalance, account_number], function (err2) {
      if (err2) return res.status(500).json({ error: 'DB error' });
      db.run('INSERT INTO transactions (from_account, to_account, amount_cents, type, note) VALUES (?, ?, ?, ?, ?)',
        ['admin', account_number, amountCents, 'deposit', 'admin deposit'], (e) => {
          if (e) console.error('tx insert failed', e);
          res.json({ message: 'Deposited', account_number, amount_cents: amountCents, new_balance_cents: newBalance });
        });
    });
  });
});

// admin authorize / unauthorize an account
app.post('/api/admin/authorize', authMiddleware, adminOnly, (req, res) => {
  const { account_number, authorize } = req.body || {};
  if (!account_number || typeof authorize !== 'boolean') return res.status(400).json({ error: 'account_number and authorize(boolean) required' });
  db.get('SELECT * FROM users WHERE account_number = ?', [account_number], (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    db.run('UPDATE users SET is_authorized = ? WHERE account_number = ?', [authorize ? 1 : 0, account_number], function (err2) {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json({ message: 'Updated authorization', account_number, is_authorized: authorize });
    });
  });
});

// transfer between users (only if sender is authorized)
app.post('/api/transfer', authMiddleware, (req, res) => {
  const { to_account, amount, note } = req.body || {};
  if (!to_account || !amount) return res.status(400).json({ error: 'to_account and amount required' });
  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'amount must be positive' });
  const from_account = req.user.account_number;
  db.get('SELECT * FROM users WHERE account_number = ?', [from_account], (err, fromUser) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!fromUser) return res.status(404).json({ error: 'Sender account not found' });
    if (!fromUser.is_authorized) return res.status(403).json({ error: 'Your account is not authorized to transfer. Contact admin.' });
    if (fromUser.balance_cents < amountCents) return res.status(400).json({ error: 'Insufficient funds' });
    db.get('SELECT * FROM users WHERE account_number = ?', [to_account], (err2, toUser) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      if (!toUser) return res.status(404).json({ error: 'Recipient account not found' });
      const newFromBalance = fromUser.balance_cents - amountCents;
      const newToBalance = toUser.balance_cents + amountCents;
      const stmt = db.prepare('UPDATE users SET balance_cents = ? WHERE account_number = ?');
      stmt.run(newFromBalance, from_account);
      stmt.run(newToBalance, to_account, (e) => {
        if (e) return res.status(500).json({ error: 'DB error' });
        db.run('INSERT INTO transactions (from_account, to_account, amount_cents, type, note) VALUES (?, ?, ?, ?, ?)', [from_account, to_account, amountCents, 'transfer', note || null], (ex) => {
          if (ex) console.error('tx insert failed', ex);
          res.json({ message: 'Transfer successful', from_account, to_account, amount_cents: amountCents });
        });
      });
    });
  });
});

// support message endpoint
app.post('/api/support', authMiddleware, (req, res) => {
  const { subject, message } = req.body || {};
  if (!subject || !message) return res.status(400).json({ error: 'subject and message required' });
  const account_number = req.user.account_number;
  db.run('INSERT INTO support_messages (account_number, subject, message) VALUES (?, ?, ?)', [account_number, subject, message], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ message: 'Support message submitted' });
  });
});

// fetch transactions for account
app.get('/api/transactions', authMiddleware, (req, res) => {
  const account_number = req.user.account_number;
  db.all('SELECT * FROM transactions WHERE from_account = ? OR to_account = ? ORDER BY created_at DESC LIMIT 200', [account_number, account_number], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ transactions: rows });
  });
});

app.listen(PORT, () => {
  console.log(`Prime Vault demo server running on http://localhost:${PORT}`);
});