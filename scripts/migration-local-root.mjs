import process from 'node:process';

// Explicit local maintenance only. Imported before TypeORM loads its datasource.
// Credentials apply to this process; no .env file, account or grant is changed.
if (process.env.NODE_ENV !== 'development' || process.env.DB_HOST !== '127.0.0.1') {
  throw new Error('La migración con root sin contraseña requiere NODE_ENV=development y DB_HOST=127.0.0.1.');
}
process.env.DB_USERNAME = 'root';
process.env.DB_PASSWORD = '';
process.env.DB_ALLOW_EMPTY_PASSWORD = '1';
