# Despliegue en Vercel + Supabase

## 1. Crear Supabase

1. Crear un proyecto nuevo en Supabase.
2. Ir a Project Settings > Database.
3. Copiar la connection string del pooler.
4. Reemplazar `[YOUR-PASSWORD]` por la password real.
5. Confirmar que la URL use SSL. Si hace falta, agregar `?sslmode=require`.

Ejemplo:

```txt
postgresql://postgres.xxxxx:TU_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

## 2. Migrar datos locales

Con Docker Desktop abierto y la base local levantada:

```powershell
.\scripts\migrar_supabase.ps1 -SupabaseConnectionString "TU_CONNECTION_STRING"
```

El script:

- exporta estructura local
- exporta datos locales
- guarda backups en `backups/`
- pide escribir `MIGRAR` antes de importar en Supabase
- no borra la base local

No ejecutar `bd/02_datos_demo.sql` en Supabase.

## 3. Deploy backend en Vercel

Crear un proyecto en Vercel desde el repo.

Configurar:

- Root Directory: `backend`
- Framework Preset: Other
- Install Command: `npm install`
- Build Command: dejar vacio
- Output Directory: dejar vacio

Variables de entorno:

```env
DATABASE_URL=TU_CONNECTION_STRING_SUPABASE
DB_SSL=true
DB_SCHEMA=public
DB_POOL_MAX=5
AUTH_SECRET=UNA_CLAVE_LARGA_SEGURA
CORS_ORIGIN=https://TU_FRONTEND.vercel.app
```

Deployar y probar:

```txt
https://TU_BACKEND.vercel.app/salud
```

## 4. Deploy frontend en Vercel

Crear otro proyecto en Vercel desde el mismo repo.

Configurar:

- Root Directory: `frontend`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

Variable de entorno:

```env
VITE_API_URL=https://TU_BACKEND.vercel.app
```

Deployar y probar login, dashboard, movimientos, valores fijos y reportes.

## 5. Despues del primer deploy

Actualizar el backend:

```env
CORS_ORIGIN=https://TU_FRONTEND.vercel.app
```

Redeployar backend.
