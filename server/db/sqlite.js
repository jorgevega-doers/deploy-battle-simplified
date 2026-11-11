// Apertura de una base de datos SQLite con una API de promesas (async/await) en lugar de las funciones de retorno ("callbacks") de sqlite3.
// La usan el ranking (leaderboard.js) y los contactos (contacts.js). Qué NO hace: no crea tablas ni sabe de qué datos guardan.
import sqlite3 from 'sqlite3';

function promisifyDatabase(db) {
  return {
    exec: (sql) => new Promise((resolve, reject) => db.exec(sql, (err) => (err ? reject(err) : resolve()))),
    run: (sql, params = []) => new Promise((resolve, reject) => {
      db.run(sql, params, function onRun(err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
    }),
    all: (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))),
    close: () => new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve()))),
  };
}

// Abre (o crea) el archivo "file" (o ':memory:' en los tests) y devuelve { exec, run, all, close }.
export async function openDatabase(file) {
  const raw = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => (err ? reject(err) : resolve(db)));
  });
  return promisifyDatabase(raw);
}
