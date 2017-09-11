exports.up = (knex, Promise) => knex.schema
    .createTable('sessions', table => {
      table.increments('id');
      table.integer('user_id').unsigned().references('users.id');
      table.uuid('session_id');
      table.timestamp('ts').defaultTo(knex.raw('now()'));
      table.timestamp('expires').defaultTo(knex.raw("now() + '1 hour'"));      
    });

exports.down = function(knex, Promise) {
  return knex.schema.dropTable('sessions');
};
