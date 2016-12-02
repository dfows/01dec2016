var pg = require('pg');
var connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/dec01';

function query(sql, values, callback) {
  pg.connect(connectionString, function(err, client, done) {
    client.query(sql, values, function(err, result) {
      done();
      callback(err, result);
    });
  });
}

exports.qq = query;
