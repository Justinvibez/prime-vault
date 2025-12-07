// db.js - initializes the SQLite DB and seeds an admin user
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
require('dotenv').config();

const DB_FILE = process.env.DATABASE_FILE || './prime-vault.db';
const MIGRATION_SQL = fs.readFileSync(path.join(__dirname, 'migrations', 'init.sql'), 'utf8');

const db = new sqlite3.Database(DB_FILE);

db.serialize(async () => {
  db.exec(MIGRATION_SQL, async (err) => {
    if (err) {
      console.error('Migration failed', err);
      process.exit(1);
    }
    console.log('Migration applied.');

    // seed admin user if not exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@prime-vault.test';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
    db.get('SELECT * FROM users WHERE email = ?', [adminEmail], async (err, row) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      if (row) {
        console.log('Admin user already exists:', adminEmail);
        db.close();
        return;
      }
      const password_hash = await bcrypt.hash(adminPassword, 10);
      const account_number = '0000000000'; // reserved admin account number
      db.run(
        'INSERT INTO users (name, email, password_hash, account_number, balance_cents, is_authorized) VALUES (?, ?, ?, ?, ?, ?)',
        ['Admin', adminEmail, password_hash, account_number, 0, 1],
        function (err) {
          if (err) {
            console.error('Failed to create admin user', err);
            process.exit(1);
          }
          console.log('Seeded admin user:', adminEmail, 'account_number:', account_number);
          db.close();
        }
      );
    });
  });
});