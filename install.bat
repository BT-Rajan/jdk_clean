@echo off
setlocal EnableDelayedExpansion

REM ===================================================================
REM Interactive installer for jdk_clean (Windows) -- sets up the backend
REM (FastAPI), frontend (React), and process management (pm2).
REM
REM Safe to re-run: existing .env files, an existing venv/node_modules,
REM an existing database/schema, and an existing admin user are all
REM detected and left alone (or you're asked before anything is
REM overwritten).
REM
REM Usage: install.bat   (run from the repo root, e.g. by double-clicking
REM                        or from a "Developer" / regular cmd.exe prompt)
REM ===================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "BACKEND_DIR=%SCRIPT_DIR%\backend"
set "FRONTEND_DIR=%SCRIPT_DIR%\frontend"

if not exist "%BACKEND_DIR%\" (
  call :Fail "Could not find backend\ next to this script. Run install.bat from the repo root."
  goto :EndFail
)
if not exist "%FRONTEND_DIR%\" (
  call :Fail "Could not find frontend\ next to this script. Run install.bat from the repo root."
  goto :EndFail
)

echo.
echo jdk_clean - interactive installer (Windows)
echo Sets up the backend, frontend, and pm2 process management.

REM -------------------------------------------------------------------
REM Prerequisites
REM -------------------------------------------------------------------
call :Heading "Checking prerequisites"

set "PYLAUNCHER="
where python >nul 2>&1
if not errorlevel 1 (
  set "PYLAUNCHER=python"
) else (
  where py >nul 2>&1
  if not errorlevel 1 (
    set "PYLAUNCHER=py -3"
  )
)
if "%PYLAUNCHER%"=="" (
  call :Fail "Python not found. Install Python 3.11+ from https://python.org (check 'Add python.exe to PATH' during setup)."
  goto :EndFail
)

where node >nul 2>&1
if errorlevel 1 (
  call :Fail "Node.js not found. Install Node.js 20+ from https://nodejs.org."
  goto :EndFail
)
where npm >nul 2>&1
if errorlevel 1 (
  call :Fail "npm not found (it ships with Node.js -- try opening a new terminal after installing)."
  goto :EndFail
)

for /f "delims=" %%V in ('%PYLAUNCHER% -c "import sys; print(str(sys.version_info[0]) + chr(46) + str(sys.version_info[1]))"') do set "PY_VERSION=%%V"
call :Ok "python !PY_VERSION!"
for /f "delims=" %%V in ('node -v') do call :Ok "node %%V"
for /f "delims=" %%V in ('npm -v') do call :Ok "npm %%V"

where pm2 >nul 2>&1
if errorlevel 1 (
  call :Warn "pm2 is not installed globally."
  call :AskYesNo "Install it now (npm install -g pm2)?" Y PM2_INSTALL
  if /i "!PM2_INSTALL!"=="Y" (
    call npm install -g pm2
    if errorlevel 1 (
      call :Fail "npm install -g pm2 failed. You may need to run this prompt as Administrator."
      goto :EndFail
    )
  ) else (
    call :Fail "pm2 is required to continue (or run the backend/frontend manually instead of using this script)."
    goto :EndFail
  )
)
for /f "delims=" %%V in ('pm2 -v 2^>nul') do call :Ok "pm2 %%V"

REM -------------------------------------------------------------------
REM Gather configuration
REM -------------------------------------------------------------------
call :Heading "Configuration"

call :AskYesNo "Set up the database and .env files now? (Answer No if your DB and .env are already configured -- this jumps straight to dependency install / process setup)" Y DO_DB_ENV_SETUP

call :Heading "Database"

set "DB_HOST=" & set "DB_PORT=" & set "DB_NAME=" & set "DB_USER=" & set "DB_PASSWORD="
set "CREATE_DB=N"
set "LOAD_SCHEMA=N"
set "ADMIN_DB_USER="
set "ADMIN_DB_PASSWORD="
if /i "!DO_DB_ENV_SETUP!"=="Y" (
  call :AskDefault "MySQL host" "localhost" DB_HOST
  call :AskDefault "MySQL port" "3306" DB_PORT
  call :AskDefault "Database name" "jdk_clean" DB_NAME
  call :AskDefault "Database user" "erp_user" DB_USER
  call :AskSecret "Database password" DB_PASSWORD

  call :AskYesNo "Create the database/user now with a MySQL admin login (skip if you've already created them)?" Y CREATE_DB
  if /i "!CREATE_DB!"=="Y" (
    call :AskDefault "MySQL admin user (for CREATE DATABASE/USER)" "root" ADMIN_DB_USER
    call :AskSecret "MySQL admin password" ADMIN_DB_PASSWORD
  )

  call :AskYesNo "Load backend\schema.sql into the database now (safe to re-run)?" Y LOAD_SCHEMA
) else (
  call :Info "Skipping database setup -- using your existing database."
)

call :Heading "Backend"

call :AskPortFree "Backend port" "8000" BACKEND_PORT

set "JWT_SECRET=" & set "ACCESS_TOKEN_EXPIRE_MINUTES=" & set "REFRESH_TOKEN_EXPIRE_DAYS="
if /i "!DO_DB_ENV_SETUP!"=="Y" (
  call :AskYesNo "Auto-generate a secure JWT secret?" Y GEN_JWT
  if /i "!GEN_JWT!"=="Y" (
    for /f "delims=" %%S in ('%PYLAUNCHER% -c "import secrets; print(secrets.token_urlsafe(48))"') do set "JWT_SECRET=%%S"
    call :Ok "Generated a JWT secret."
  ) else (
    call :AskSecretMinLen "Paste your JWT secret" 32 JWT_SECRET
  )

  call :AskDefault "Access token lifetime (minutes)" "60" ACCESS_TOKEN_EXPIRE_MINUTES
  call :AskDefault "Refresh token lifetime (days)" "7" REFRESH_TOKEN_EXPIRE_DAYS
)

call :Heading "Frontend"

call :AskPortFree "Frontend port" "4173" FRONTEND_PORT

set "FRONTEND_ORIGIN=http://localhost:!FRONTEND_PORT!"
if /i "!DO_DB_ENV_SETUP!"=="Y" (
  call :AskDefault "Frontend origin (used for the backend's CORS_ORIGINS)" "!FRONTEND_ORIGIN!" FRONTEND_ORIGIN
)
call :AskDefault "Backend base URL (used for the frontend's VITE_API_BASE_URL)" "http://localhost:!BACKEND_PORT!" BACKEND_URL

call :Heading "Bootstrap admin account"

call :AskYesNo "Create a bootstrap admin user now?" Y SEED_ADMIN
set "ADMIN_USERNAME=" & set "ADMIN_EMAIL=" & set "ADMIN_FULL_NAME=" & set "ADMIN_PASSWORD=" & set "ADMIN_PASSWORD_GENERATED=N"
if /i "!SEED_ADMIN!"=="Y" (
  call :AskDefault "Admin username" "admin" ADMIN_USERNAME
  call :AskDefault "Admin email" "admin@example.com" ADMIN_EMAIL
  call :AskDefault "Admin full name" "Administrator" ADMIN_FULL_NAME
  call :AskYesNo "Auto-generate a strong admin password (recommended)?" Y GEN_ADMIN_PW
  if /i "!GEN_ADMIN_PW!"=="Y" (
    REM Charset avoids cmd.exe metacharacters ^ ^& ^| ^< ^> " %% so the
    REM generated password is always safe to pass on a command line or
    REM write into a .env file without any special quoting. The Python
    REM below avoids quote characters entirely (chr() instead of string
    REM literals, writelines instead of a joined/printed string) so it
    REM can't be misparsed by cmd's own quote/paren matching either.
    for /f "delims=" %%S in ('%PYLAUNCHER% -c "import secrets, string, sys; a = string.ascii_letters + string.digits + chr(45) + chr(95) + chr(46); sys.stdout.writelines(secrets.choice(a) for _ in range(18)); sys.stdout.write(chr(10))"') do set "ADMIN_PASSWORD=%%S"
    set "ADMIN_PASSWORD_GENERATED=Y"
  ) else (
    call :AskSecretMinLen "Admin password" 8 ADMIN_PASSWORD
  )
)

call :Heading "Process management"

call :AskYesNo "Start both apps under pm2 when setup finishes?" Y START_PM2
set "PM2_WIN_STARTUP=N"
if /i "!START_PM2!"=="Y" (
  call :AskYesNo "Try to make pm2 auto-start at Windows login (installs the pm2-windows-startup package)?" N PM2_WIN_STARTUP
)

REM -------------------------------------------------------------------
REM Database setup
REM -------------------------------------------------------------------
set "NEED_MYSQL=N"
if /i "!CREATE_DB!"=="Y" set "NEED_MYSQL=Y"
if /i "!LOAD_SCHEMA!"=="Y" set "NEED_MYSQL=Y"

set "MYSQL_CMD=mysql"
if /i "!NEED_MYSQL!"=="Y" (
  call :Heading "Setting up the database"
  call :FindMysqlClient MYSQL_CMD
  if "!MYSQL_CMD!"=="" (
    call :Warn "Could not find the mysql client on this machine (checked PATH and the usual MySQL/XAMPP/WAMP install locations)."
    call :AskDefault "Full path to mysql.exe (leave blank to skip database setup and do it yourself)" "" MYSQL_CMD
    if "!MYSQL_CMD!"=="" (
      call :Warn "Skipping database setup -- run backend\schema.sql yourself, then re-run install.bat and answer No to the DB questions."
      set "CREATE_DB=N"
      set "LOAD_SCHEMA=N"
      set "NEED_MYSQL=N"
    ) else if not exist "!MYSQL_CMD!" (
      call :Fail "No file found at '!MYSQL_CMD!'."
      goto :EndFail
    )
  )
)

if /i "!CREATE_DB!"=="Y" (
  call :Info "Creating database and user..."
  set "TEMP_SQL=%TEMP%\jdk_clean_create_db_%RANDOM%.sql"
  (
    echo CREATE DATABASE IF NOT EXISTS `!DB_NAME!` CHARACTER SET utf8mb4;
    echo CREATE USER IF NOT EXISTS '!DB_USER!'@'%%' IDENTIFIED BY '!DB_PASSWORD!';
    echo GRANT ALL PRIVILEGES ON `!DB_NAME!`.* TO '!DB_USER!'@'%%';
    echo FLUSH PRIVILEGES;
  ) > "!TEMP_SQL!"
  set "MYSQL_PWD=!ADMIN_DB_PASSWORD!"
  "!MYSQL_CMD!" -h "!DB_HOST!" -P "!DB_PORT!" -u "!ADMIN_DB_USER!" < "!TEMP_SQL!"
  set "CREATE_DB_RESULT=!errorlevel!"
  set "MYSQL_PWD="
  del /q "!TEMP_SQL!" >nul 2>&1
  if not "!CREATE_DB_RESULT!"=="0" (
    call :Fail "Could not create the database/user. Check the MySQL admin credentials above."
    goto :EndFail
  )
  call :Ok "Database and user ready."
)

if /i "!LOAD_SCHEMA!"=="Y" (
  call :Info "Loading schema..."
  set "MYSQL_PWD=!DB_PASSWORD!"
  "!MYSQL_CMD!" -h "!DB_HOST!" -P "!DB_PORT!" -u "!DB_USER!" "!DB_NAME!" < "%BACKEND_DIR%\schema.sql"
  set "SCHEMA_RESULT=!errorlevel!"
  set "MYSQL_PWD="
  if not "!SCHEMA_RESULT!"=="0" (
    call :Fail "Could not load schema.sql. Check the database credentials above and that '!DB_USER!' has privileges on '!DB_NAME!'."
    goto :EndFail
  )
  call :Ok "Schema loaded."
)

REM -------------------------------------------------------------------
REM Backend setup
REM -------------------------------------------------------------------
call :Heading "Setting up the backend"
pushd "%BACKEND_DIR%"

if not exist "venv\" (
  call :Info "Creating virtual environment..."
  %PYLAUNCHER% -m venv venv
  if errorlevel 1 (
    call :Fail "Could not create the virtual environment."
    popd
    goto :EndFail
  )
)
set "PY=%BACKEND_DIR%\venv\Scripts\python.exe"

call :Info "Installing Python dependencies..."
"%PY%" -m pip install --quiet --upgrade pip
"%PY%" -m pip install --quiet -r requirements.txt
if errorlevel 1 (
  call :Fail "pip install failed -- see the output above."
  popd
  goto :EndFail
)
call :Ok "Backend dependencies installed."

set "WRITE_BACKEND_ENV=N"
if /i "!DO_DB_ENV_SETUP!"=="Y" (
  set "WRITE_BACKEND_ENV=Y"
  if exist ".env" (
    call :AskYesNo ".env already exists in backend\ -- overwrite it with these settings?" N WRITE_BACKEND_ENV
  )
)

if /i "!WRITE_BACKEND_ENV!"=="Y" (
  (
    echo DB_HOST=!DB_HOST!
    echo DB_PORT=!DB_PORT!
    echo DB_USER=!DB_USER!
    echo DB_PASSWORD=!DB_PASSWORD!
    echo DB_NAME=!DB_NAME!
    echo.
    echo JWT_SECRET_KEY=!JWT_SECRET!
    echo ACCESS_TOKEN_EXPIRE_MINUTES=!ACCESS_TOKEN_EXPIRE_MINUTES!
    echo REFRESH_TOKEN_EXPIRE_DAYS=!REFRESH_TOKEN_EXPIRE_DAYS!
    echo.
    echo CORS_ORIGINS=!FRONTEND_ORIGIN!
  ) > ".env"
  call :Ok "Wrote backend\.env"
) else if /i "!DO_DB_ENV_SETUP!"=="Y" (
  call :Warn "Left the existing backend\.env untouched."
) else (
  call :Info "Using existing backend\.env as-is."
)

call :Info "Applying database migrations (safe to re-run; already-applied changes are skipped)..."
"%PY%" scripts\run_migrations.py
if errorlevel 1 (
  call :Fail "Applying migrations failed -- see the output above."
  popd
  goto :EndFail
)
call :Ok "Migrations applied."

if /i "!SEED_ADMIN!"=="Y" (
  call :Info "Seeding bootstrap admin + number series..."
  "%PY%" scripts\seed_admin.py --username "!ADMIN_USERNAME!" --email "!ADMIN_EMAIL!" --full-name "!ADMIN_FULL_NAME!" --password "!ADMIN_PASSWORD!"
  if errorlevel 1 (
    call :Fail "Seeding the admin account failed -- see the output above."
    popd
    goto :EndFail
  )
  call :Ok "Admin account ready."
)

popd

REM -------------------------------------------------------------------
REM Frontend setup
REM -------------------------------------------------------------------
call :Heading "Setting up the frontend"
pushd "%FRONTEND_DIR%"

call :Info "Installing Node dependencies..."
call npm install
if errorlevel 1 (
  call :Fail "npm install failed -- see the output above."
  popd
  goto :EndFail
)
call :Ok "Frontend dependencies installed."

set "WRITE_FRONTEND_ENV=N"
if /i "!DO_DB_ENV_SETUP!"=="Y" (
  set "WRITE_FRONTEND_ENV=Y"
  if exist ".env" (
    call :AskYesNo ".env already exists in frontend\ -- overwrite it with these settings?" N WRITE_FRONTEND_ENV
  )
)

if /i "!WRITE_FRONTEND_ENV!"=="Y" (
  (
    echo VITE_API_BASE_URL=!BACKEND_URL!
  ) > ".env"
  call :Ok "Wrote frontend\.env"
) else if /i "!DO_DB_ENV_SETUP!"=="Y" (
  call :Warn "Left the existing frontend\.env untouched."
) else (
  call :Info "Using existing frontend\.env as-is."
)

call :Info "Building the frontend for production..."
call npm run build
if errorlevel 1 (
  call :Fail "Frontend build failed -- see the output above."
  popd
  goto :EndFail
)
call :Ok "Frontend built."

popd

REM -------------------------------------------------------------------
REM pm2 ecosystem file
REM -------------------------------------------------------------------
call :Heading "Process management (pm2)"

set "ECOSYSTEM_FILE=%SCRIPT_DIR%\ecosystem.config.js"
set "WRITE_ECOSYSTEM=Y"
if exist "%ECOSYSTEM_FILE%" (
  call :AskYesNo "ecosystem.config.js already exists -- regenerate it with these settings?" N WRITE_ECOSYSTEM
)

if /i "!WRITE_ECOSYSTEM!"=="Y" (
  (
    echo // Generated by install.bat. Safe to edit by hand -- re-running
    echo // install.bat will ask before overwriting it.
    echo module.exports = {
    echo   apps: [
    echo     {
    echo       name: 'jdk-backend',
    echo       cwd: './backend',
    echo       script: 'venv/Scripts/uvicorn.exe',
    echo       args: ['app.main:app', '--host', '0.0.0.0', '--port', '!BACKEND_PORT!'],
    echo       interpreter: 'none',
    echo       autorestart: true,
    echo       max_restarts: 10,
    echo       env: {
    echo         PYTHONUNBUFFERED: '1',
    echo       },
    echo     },
    echo     {
    echo       name: 'jdk-frontend',
    echo       cwd: './frontend',
    echo       script: 'scripts/serve-static.mjs',
    echo       interpreter: 'node',
    echo       autorestart: true,
    echo       max_restarts: 10,
    echo       env: {
    echo         PORT: '!FRONTEND_PORT!',
    echo         API_BASE_URL: '!BACKEND_URL!',
    echo       },
    echo     },
    echo   ],
    echo };
  ) > "%ECOSYSTEM_FILE%"
  call :Ok "Wrote ecosystem.config.js"
) else (
  call :Warn "Left the existing ecosystem.config.js untouched."
)

if /i "!START_PM2!"=="Y" (
  call :Info "Starting apps under pm2..."
  call pm2 start "%ECOSYSTEM_FILE%"
  call pm2 save
  call :Ok "pm2 apps started and saved."

  if /i "!PM2_WIN_STARTUP!"=="Y" (
    call :Info "Installing pm2-windows-startup..."
    call npm install -g pm2-windows-startup
    if errorlevel 1 (
      call :Warn "Could not install pm2-windows-startup. You can install it manually later: npm install -g pm2-windows-startup && pm2-startup install"
    ) else (
      call pm2-startup install
      call :Ok "pm2 should now start at Windows login. Verify with: pm2-startup status"
    )
  )
)

REM -------------------------------------------------------------------
REM Summary
REM -------------------------------------------------------------------
call :Heading "Setup complete"

echo   Backend:   http://localhost:!BACKEND_PORT!  (docs at /docs)
echo   Frontend:  http://localhost:!FRONTEND_PORT!

if /i "!SEED_ADMIN!"=="Y" (
  echo.
  echo   Admin login:
  echo     username: !ADMIN_USERNAME!
  echo     password: !ADMIN_PASSWORD!
  if /i "!ADMIN_PASSWORD_GENERATED!"=="Y" (
    echo.
    call :Warn "Save that password now -- it will not be shown again. Log in and change it immediately (there's a 'Change password' link once you're signed in)."
  )
)

if /i "!START_PM2!"=="Y" (
  echo.
  echo   pm2 status         -- check both processes
  echo   pm2 logs           -- tail logs for both
  echo   pm2 restart all    -- restart both
  echo   pm2 stop all       -- stop both
)

echo.
endlocal
exit /b 0

:EndFail
endlocal
exit /b 1

REM %1=result var. Sets it to a usable mysql command/path, or "" if none found.
REM Checks PATH first, then the usual Windows install locations for MySQL
REM Server, XAMPP, and WAMP (any of which may not add mysql.exe to PATH).
:FindMysqlClient
setlocal EnableDelayedExpansion
set "FOUND="
where mysql >nul 2>&1
if not errorlevel 1 (
  set "FOUND=mysql"
) else (
  for %%D in (
    "%ProgramFiles%\MySQL\MySQL Server 8.4\bin\mysql.exe"
    "%ProgramFiles%\MySQL\MySQL Server 8.0\bin\mysql.exe"
    "%ProgramFiles(x86)%\MySQL\MySQL Server 8.0\bin\mysql.exe"
    "%ProgramFiles%\MySQL\MySQL Server 5.7\bin\mysql.exe"
    "C:\xampp\mysql\bin\mysql.exe"
    "C:\wamp64\bin\mysql\mysql8.0.31\bin\mysql.exe"
  ) do (
    if "!FOUND!"=="" if exist %%D set "FOUND=%%~D"
  )
  if "!FOUND!"=="" (
    for /d %%V in ("%ProgramFiles%\MySQL\MySQL Server *") do (
      if "!FOUND!"=="" if exist "%%V\bin\mysql.exe" set "FOUND=%%V\bin\mysql.exe"
    )
  )
  if "!FOUND!"=="" (
    for /d %%V in ("C:\wamp64\bin\mysql\mysql*") do (
      if "!FOUND!"=="" if exist "%%V\bin\mysql.exe" set "FOUND=%%V\bin\mysql.exe"
    )
  )
)
endlocal & set "%~1=%FOUND%"
goto :eof

REM ===================================================================
REM Subroutines
REM ===================================================================

:Heading
echo.
echo %~1
goto :eof

:Info
echo ==^> %~1
goto :eof

:Ok
echo OK  %~1
goto :eof

:Warn
echo !!  %~1
goto :eof

:Fail
echo x   %~1 1>&2
goto :eof

REM %1=prompt text (no quotes needed at call site around the value itself,
REM    but pass the whole thing quoted), %2=default, %3=result variable name
:AskDefault
setlocal
set "PROMPT_TEXT=%~1"
set "DEFAULT_VAL=%~2"
set "ANSWER="
set /p "ANSWER=%PROMPT_TEXT% [%DEFAULT_VAL%]: "
if "%ANSWER%"=="" set "ANSWER=%DEFAULT_VAL%"
endlocal & set "%~3=%ANSWER%"
goto :eof

REM %1=prompt, %2=default (Y or N), %3=result var (set to Y or N)
:AskYesNo
setlocal
set "PROMPT_TEXT=%~1"
set "DEFAULT_VAL=%~2"
if /i "%DEFAULT_VAL%"=="Y" (set "HINT=Y/n") else (set "HINT=y/N")
set "ANSWER="
set /p "ANSWER=%PROMPT_TEXT% [%HINT%]: "
if "%ANSWER%"=="" set "ANSWER=%DEFAULT_VAL%"
set "RESULT=N"
if /i "%ANSWER:~0,1%"=="Y" set "RESULT=Y"
endlocal & set "%~3=%RESULT%"
goto :eof

REM %1=prompt, %2=result var. Masks input using PowerShell if available;
REM falls back to plain (visible) input on systems without PowerShell.
:AskSecret
setlocal
set "PROMPT_TEXT=%~1"
where powershell >nul 2>&1
if errorlevel 1 (
  set "ANSWER="
  set /p "ANSWER=%PROMPT_TEXT% (input will be visible -- PowerShell not found): "
) else (
  set "ANSWER="
  for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "$s = Read-Host -Prompt '%PROMPT_TEXT%' -AsSecureString; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)"`) do set "ANSWER=%%S"
)
endlocal & set "%~2=%ANSWER%"
goto :eof

REM %1=port number, %2=result var (Y if something is already listening on it)
:CheckPortBusy
setlocal
set "CHECK_PORT=%~1"
set "PORT_BUSY=N"
netstat -ano | findstr /R /C:":%CHECK_PORT% " >nul 2>&1
if not errorlevel 1 set "PORT_BUSY=Y"
endlocal & set "%~2=%PORT_BUSY%"
goto :eof

REM %1=prompt, %2=default port, %3=result var. Like AskDefault, but re-asks
REM until the chosen port is confirmed free (checked before any install
REM step runs, so a busy port is caught immediately instead of failing
REM later when a server tries to bind it).
:AskPortFree
setlocal
set "PROMPT_TEXT=%~1"
set "DEFAULT_VAL=%~2"
:AskPortFree_loop
call :AskDefault "%PROMPT_TEXT%" "%DEFAULT_VAL%" LOOP_PORT
call :CheckPortBusy "!LOOP_PORT!" LOOP_BUSY
if /i "!LOOP_BUSY!"=="Y" (
  call :Warn "Port !LOOP_PORT! is already in use by another process."
  set "DEFAULT_VAL=!LOOP_PORT!"
  goto :AskPortFree_loop
)
endlocal & set "%~3=%LOOP_PORT%"
goto :eof

REM %1=prompt, %2=minimum length, %3=result var. Re-asks until long enough.
:AskSecretMinLen
setlocal
set "PROMPT_TEXT=%~1"
set "MIN_LEN=%~2"
set /a "CHECK_IDX=%MIN_LEN%-1"
:AskSecretMinLen_loop
call :AskSecret "%PROMPT_TEXT%" LOOP_SECRET
if "!LOOP_SECRET:~%CHECK_IDX%,1!"=="" (
  echo Must be at least %MIN_LEN% characters.
  goto :AskSecretMinLen_loop
)
endlocal & set "%~3=%LOOP_SECRET%"
goto :eof
