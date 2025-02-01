@echo off
echo Iniciando reset do banco de dados no Railway...

:: Configurar URL do Railway com SSL
set DATABASE_URL=postgres://postgres:KsqInWIXpEkzUkRKHrdlezOSgdILvZBQ@junction.proxy.rlwy.net:58730/railway?sslmode=require

:: Executar reset
npx prisma migrate reset --force --skip-seed
IF %ERRORLEVEL% NEQ 0 (
    echo Erro ao resetar o banco
    exit /b %ERRORLEVEL%
)

:: Push do schema
npx prisma db push --accept-data-loss
IF %ERRORLEVEL% NEQ 0 (
    echo Erro ao fazer push do schema
    exit /b %ERRORLEVEL%
)

:: Gerar cliente
npx prisma generate
IF %ERRORLEVEL% NEQ 0 (
    echo Erro ao gerar cliente Prisma
    exit /b %ERRORLEVEL%
)

:: Executar script de verificação de usuários
npx tsx src/scripts/checkUsers.ts
IF %ERRORLEVEL% NEQ 0 (
    echo Erro ao verificar usuários
    exit /b %ERRORLEVEL%
)

echo Reset concluído com sucesso! 