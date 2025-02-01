@echo off
echo Iniciando deploy das migrations...

:: Configurar URL do Railway com SSL
set DATABASE_URL=postgres://postgres:KsqInWIXpEkzUkRKHrdlezOSgdILvZBQ@junction.proxy.rlwy.net:58730/railway?sslmode=require

:: Executar migrations
npx prisma migrate deploy
IF %ERRORLEVEL% NEQ 0 (
    echo Erro ao executar migrations
    exit /b %ERRORLEVEL%
)

:: Gerar cliente Prisma
npx prisma generate
IF %ERRORLEVEL% NEQ 0 (
    echo Erro ao gerar cliente Prisma
    exit /b %ERRORLEVEL%
)

echo Deploy concluído com sucesso! 