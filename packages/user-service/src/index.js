require('dotenv').config();
const { router } = require('microrouter');
const routes = require('./routes');

module.exports = router.apply(this, routes);