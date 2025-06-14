// db.js
const mysql = require('mysql2');

// const dbConfig = {
//   host: 'localhost',
//   user: 'nodeuser',
//   password: 'Root@1234',
//   database: 'funstay_db',
// };


const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'funstaydb',
};

function createConnection() {
  return mysql.createConnection(dbConfig);
}

// Export the function for use in other modules
module.exports = { createConnection };