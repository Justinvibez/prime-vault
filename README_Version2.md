# prime-vault-demo — local demo banking app

This is a demo "fake money" online banking application (for testing / demo only). Do NOT use in production or for real money.

Quick setup

1. Copy the example env:
   cp .env.example .env
2. Edit .env and set:
   - JWT_SECRET (set a secure random secret)
   - ADMIN_EMAIL (e.g. admin@prime-vault.test)
   - ADMIN_PASSWORD (e.g. StrongAdminPass123!)
   - DATABASE_FILE (optional, defaults to ./prime-vault.db)
3. Install dependencies:
   npm install
4. Initialize DB and seed admin:
   npm run migrate
   - OR run the interactive helper to create/update admin:
     node create-admin.js
5. Start the server:
   npm start
6. Open the demo UI:
   - Customer UI: http://localhost:4000/
   - Admin UI: http://localhost:4000/admin.html

Admin login:
- POST /api/login
- JSON body: { "email": "<ADMIN_EMAIL>", "password": "<ADMIN_PASSWORD>" }
- The server responds with a JWT token for admin actions.

Notes
- Admin account number is reserved as `0000000000`.
- The admin credentials are read from the environment when seeding the DB (see .env or use create-admin.js).
- This is a demo app meant for local testing only — do not deploy as-is or use for real value transfers.