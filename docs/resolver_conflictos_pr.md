# Resolver conflictos en tu PR (paso a paso)

Cuando GitHub muestra **"This branch has conflicts"**, significa que tu rama y `main` tocaron los mismos archivos.

## Opción recomendada (línea de comandos)

### 1) Traer últimos cambios

```bash
git fetch origin
```

### 2) Ir a tu rama del PR

```bash
git checkout <tu-rama>
```

### 3) Mezclar `main` en tu rama

```bash
git merge origin/main
```

### 4) Resolver conflictos

Abrí los archivos en conflicto y buscá bloques como:

```text
<<<<<<< HEAD
...tu versión...
=======
...versión de main...
>>>>>>> origin/main
```

Dejá el contenido correcto, borra esas marcas y guardá.

### 5) Confirmar resolución

```bash
git add .
git commit -m "Resuelve conflictos con main"
git push
```

## Si usás GitHub Web

También podés hacer click en **Resolve conflicts**, editar en web, y confirmar.

## Si `git pull` falla con "you have unmerged files"

Ese mensaje significa que ya hay un merge empezado y sin resolver. Hasta cerrar eso, `git pull` siempre va a fallar.

### Opción A: terminar de resolver el merge actual

```bash
git status
git diff --name-only --diff-filter=U
# resolver archivos
git add <archivos-resueltos>
git commit -m "Resuelve conflictos pendientes"
git pull
```

### Opción B: cancelar el merge en curso y empezar de nuevo

```bash
git merge --abort
git pull --rebase
```

Si preferís, podés usar los scripts del repo:

- PowerShell: `.\scripts\destrabar_pull.ps1` o `.\scripts\destrabar_pull.ps1 abort`
- Bash: `./scripts/destrabar_pull.sh` o `./scripts/destrabar_pull.sh abort`

Si esos scripts todavía no existen en tu copia local, corré directo:

```powershell
git status
git diff --name-only --diff-filter=U
git rebase --abort
git merge --abort
git pull --rebase
```

> Nota: si el conflicto apareció durante `git pull --rebase`, primero necesitás `git rebase --abort`.
