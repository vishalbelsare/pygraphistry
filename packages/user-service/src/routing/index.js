const { get, post, put } = require('microrouter');

module.exports = [
  post('/', require('./createUser')),
  get('/', require('./getCurrentUser')),
  get('/:id', require('./getUserById')),
  post('/login', require('./login')),
  post('/logout', require('./logout')),
  put('/:id', require('./updateUser'))
];