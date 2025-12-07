// create-admin.js
// Interactive helper to create or update the reserved admin account (account_number = "0000000000")
//
// Usage: node create-admin.js
// This script will prompt for admin email and password and create/update the admin user in the configured DB.

const readline = require('readline');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
require('dotenv').config();

const DB_FILE = process.env.DATABASE_FILE || './prime-vault.db';
const ADMIN_ACCOUNT = '0000000000';

if (!fs.existsSync(DB_FILE)) {
  console.error(`Database file not found: ${DB_FILE}`);
  console.error('Run the migrations first: node db.js');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

(async () => {
  try {
    const email = (await question('Admin email: ')).trim();
    const password = (await question('Admin password: ')).trim();
    if (!email || !password) {
      console.error('Email and password are required.');
      rl.close();
      process.exit(1);
    }
    const password_hash = await bcrypt.hash(password, 10);

    const db = new sqlite3.Database(DB_FILE);

    db.serialize(() => {
      // If another user is using the reserved admin account number, update it.
      db.get('SELECT * FROM users WHERE account_number = ?', [ADMIN_ACCOUNT], (err, row) => {
        if (err) {
          console.error('DB error:', err);
          db.close();
          rl.close();
          process.exit(1);
        }
        if (row) {
          // Update existing admin row
          db.run('UPDATE users SET email = ?, password_hash = ?, name = ?, is_authorized = 1 WHERE account_number = ?', [email, password_hash, 'Admin', ADMIN_ACCOUNT], function (uErr) {
            if (uErr) {
              console.error('Failed to update admin:', uErr);
            } else {
              console.log('Admin account updated. account_number =', ADMIN_ACCOUNT);
            }
            db.close();
            rl.close();
          });
        } else {
          // Ensure email is not used by a different account
          db.get('SELECT * FROM users WHERE email = ?', [email], (eErr, existing) => {
            if (eErr) {
              console.error('DB error:', eErr);
              db.close();
              rl.close();
              process.exit(1);
            }
            if (existing) {
              console.error('That email is already used by another account. Choose a different email or remove the existing user first.');
              db.close();
              rl.close();
              process.exit(1);
            }
            db.run('INSERT INTO users (name, email, password_hash, account_number, balance_cents, is_authorized) VALUES (?, ?, ?, ?, ?, ?)',
              ['Admin', email, password_hash, ADMIN_ACCOUNT, 0, 1],
              function (insErr) {
                if (insErr) {
                  console.error('Failed to create admin:', insErr);
                } else {
                  console.log('Admin account created. account_number =', ADMIN_ACCOUNT);
                }
                db.close();
                rl.close();
              });
          });
        }
      });
    });
  } catch (ex) {
    console.error('Error:', ex);
    rl.close();
    process.exit(1);
  }
})();