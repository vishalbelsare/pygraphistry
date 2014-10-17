'use strict';

module.exports = {
    db: ' mongodb://graphistry:graphtheplanet@ds047030.mongolab.com:47030/graphistry-test',
	port: 3001,
	app: {
		title: 'Graphistry test'
	},
	mailer: {
		from: process.env.MAILER_FROM || 'MAILER_FROM',
		options: {
			service: process.env.MAILER_SERVICE_PROVIDER || 'MAILER_SERVICE_PROVIDER',
			auth: {
				user: process.env.MAILER_EMAIL_ID || 'MAILER_EMAIL_ID',
				pass: process.env.MAILER_PASSWORD || 'MAILER_PASSWORD'
			}
		}
	}
};
