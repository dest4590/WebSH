@echo off
setlocal enabledelayedexpansion

docker build -t ghcr.io/dest4590/websh-frontend:latest -f frontend/Dockerfile .
docker build -t ghcr.io/dest4590/websh-backend:latest -f backend/Dockerfile .
docker push ghcr.io/dest4590/websh-frontend:latest
docker push ghcr.io/dest4590/websh-backend:latest

echo Build and push completed successfully.
popd
endlocal
