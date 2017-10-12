const { router } = require('microrouter');
const routes = require('./routing');

module.exports = router.apply(this, routes);
