NGINX_VERSION=1.4.0.32
cd deploy/dockerfiles/nginx
docker build -t graphistry/nginx-central-vizservers:${NGINX_VERSION} -f Dockerfile .
docker build -t graphistry/nginx-central-vizservers:${NGINX_VERSION}.httponly -f Dockerfile-insecure .
