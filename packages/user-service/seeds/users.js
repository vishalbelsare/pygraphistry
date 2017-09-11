const bcrypt = require('bcryptjs');

exports.seed = function(knex, Promise) {
  // Deletes ALL existing entries
  return knex('users').del()
    .then(function () {
      // Inserts seed entries
      const salt = bcrypt.genSaltSync();
      const hash = bcrypt.hashSync('graphs4lyfe', salt);
      return Promise.join(
        knex('users').insert({
          username: 'myk',
          password: hash,
          admin: true
        })
      );
    });
};
