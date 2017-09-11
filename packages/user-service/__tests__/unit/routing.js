const { get } = require('microrouter');
const { createServer } = require('microrouter-test-server');
 
const routes = [
  get('/route1', () => 'route1'), 
  get('/route2', () => 'route2')
];
 
let server;
 
beforeAll(async () => {
  server = await createServer(routes);
});
 
afterAll(async () => {
  await server.close();
});
 
test('GET route1 should return expected value', async () => {
  const result = await server.get('/route1');
  expect(result).toEqual('route1');
});
 
test('GET route2 should return expected value', async () => {
  const result = await server.get('/route2');
  expect(result).toEqual('route2');
});