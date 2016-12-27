# Client-API

## Updating the demo

1. Build Client-API bundle
`cd viz-app && npm run build-api`

2. Test Demo locally
`open viz-app/tests/client-api/demo/combined/index.html`

3. Make central serve demo html file
`cp viz-app/tests/client-api/demo/combined/index.html ../central/assets/client-api-demo.html`

4. Move API Bundle into central's assets
`cp viz-app/www/graphistryJS.js ../central/assets/graphistryJS.js`
4. Test on central at [http://localhost:3000/client-api-demo.html](http://localhost:3000/client-api-demo.html)
`cd central && npm run start`
`cd viz-app && npm run start`

4. Commit and push a new version of central, and deploy

##

## Docs

### Preview the docs

- `npm run serve:docs`

### Compile the docs

- `npm run docs `

### Updating public documentation

- Our client-side api can be found here:
[Interactions API](https://graphistry.github.io/docs/interactions/index.html).
- In order to update the docs

1. Copy the documentation:

`cp -r viz-app/src/api-client/docs/ docs/interactions/`

2. Commit and push updated documentation
3. Verify the date at the button of [https://graphistry.github.io/docs/interactions/index.html](https://graphistry.github.io/docs/interactions/index.html).





