cd ../
cd central && npm start "{\"HTTP_LISTEN_PORT\": 3001, \"VIZ_LISTEN_PORT\": 4001, \"VIZ_LISTEN_PORTS\": [4001], \"S3UPLOADS\": false}" &
cd viz-server && npm start "{\"HTTP_LISTEN_PORT\": 3001, \"VIZ_LISTEN_PORT\": 4001, \"VIZ_LISTEN_PORTS\": [4001], \"S3UPLOADS\": false}" &
cd central && npm start "{\"HTTP_LISTEN_PORT\": 3002, \"VIZ_LISTEN_PORT\": 4002, \"VIZ_LISTEN_PORTS\": [4002], \"S3UPLOADS\": false}" &
cd viz-server && npm start "{\"HTTP_LISTEN_PORT\": 3002, \"VIZ_LISTEN_PORT\": 4002, \"VIZ_LISTEN_PORTS\": [4002], \"S3UPLOADS\": false}" &


