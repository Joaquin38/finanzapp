# Conexión a PostgreSQL desde DBeaver

## Datos de conexión (desarrollo local)

- Host: `localhost`
- Puerto: `5432` (o el valor de `POSTGRES_PORT` en `.env`)
- Base de datos: `finanzas_db`
- Usuario: `finanzas`
- Contraseña: `finanzas_dev`

> Si cambiaste los valores del `.env`, usá esos mismos en DBeaver.

## Pasos en DBeaver

1. **Database > New Database Connection**.
2. Elegí **PostgreSQL**.
3. Completá host, puerto, base, usuario y contraseña.
4. Click en **Test Connection**.
5. Guardá la conexión.

## Error: "Connection refused: getsockopt"

Ese error normalmente significa que **PostgreSQL no está levantado** o que el puerto/host no coincide.

### Checklist rápido

1. Verificá servicios:

```bash
docker compose ps
```

2. Si `postgres` no está `Up`, levantalo:

```bash
docker compose up -d
```

3. Revisá logs:

```bash
docker compose logs --tail=100 postgres
```

4. Probá disponibilidad desde el contenedor:

```bash
docker compose exec -T postgres pg_isready -U finanzas -d finanzas_db
```

5. Reintentá en DBeaver con:
   - Host: `localhost`
   - Puerto: `5432`

## Problemas comunes

- **Connection refused**: contenedor apagado o puerto incorrecto.
- **Password authentication failed**: revisar usuario/clave en `.env`.
- **No se crean tablas**: si el volumen ya existía, el script de init no corre de nuevo. Ejecutar SQL manualmente o usar `./scripts/reset_bd.sh`.
