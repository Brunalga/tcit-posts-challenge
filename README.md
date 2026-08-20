# Challenge de Posts — TCIT Cloud Solutions

**Hecho por Cristian Bruna** — para quien lo revise del lado de TCIT (Senior Software Engineer y/o Tech
Lead).

Una pequeña app CRUD de Posts (frontend en React + Redux, backend en NestJS + PostgreSQL) hecha para el
proceso de selección de desarrollador web de TCIT Cloud Solutions, llevada un paso más allá del enunciado
original: escrituras idempotentes, una estructura de módulos Nest como corresponde, tipado de punta a
punta, y suite de tests en ambos lados.

## Stack

| Capa         | Elección                                             | Por qué                                                                               |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Frontend     | React 18 + Redux Toolkit + Vite + TypeScript           | Redux Toolkit (RTK) trae `createAsyncThunk`, una función para manejar llamadas a una API dentro de Redux. Le agregamos una condición simple ("si ya se cargó la lista, no la pidas de nuevo") para cumplir el requisito de traerla una sola vez por carga de vista, sin necesitar una librería de cache aparte. |
| Backend      | NestJS 11 + TypeScript                                 | Nest organiza el código en módulos, con controllers (definen las rutas) y services (tienen la lógica), e inyecta las dependencias automáticamente. Valida lo que llega con clases (DTOs) y usa piezas propias del framework (guards, interceptors, filters) en vez de funciones de middleware escritas a mano. |
| Base de datos| PostgreSQL + Prisma                                    | Queries y migraciones type-safe, columnas snake_case mapeadas limpiamente desde modelos camelCase. |
| Idempotencia | `IdempotencyInterceptor` (NestInterceptor) respaldado por una tabla en la BD | No lo pedía el enunciado, se agregó a propósito — ver [Creación idempotente de posts](#creación-idempotente-de-posts). |

## Estructura del proyecto

```
.
├── backend/                 API en NestJS
│   ├── prisma/                schema + migraciones
│   ├── test/                  specs e2e (Postgres real)
│   └── src/
│       ├── config/            validación de env (zod, conectado a ConfigModule)
│       ├── prisma/            PrismaService/PrismaModule (Prisma envuelto como provider de Nest)
│       ├── common/
│       │   ├── filters/       AllExceptionsFilter (normaliza errores, incl. los de Prisma)
│       │   └── interceptors/  IdempotencyInterceptor
│       ├── posts/             controller, service, dto/ — módulo de feature
│       ├── app.controller.ts  health check
│       └── app.module.ts
├── frontend/                 App en React + Redux
│   └── src/
│       ├── api/                cliente fetch + helper de POST idempotente
│       ├── store/              slice de Redux (guard de fetch-once, selectors)
│       ├── components/        PostForm, PostFilter, PostList, ConfirmDialog
│       └── tests/              vitest + Testing Library
├── docker-compose.yml          db + backend + frontend, un solo comando
└── package.json                orquestación desde la raíz (concurrently)
```

## Inicio rápido — todo en Docker

La forma más rápida de verlo funcionando, sin necesitar Node/Postgres localmente:

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:4000 (health check en `/api/health`, docs de Swagger en `/api/docs`)
- Postgres: localhost:5432 (`postgres`/`postgres`, base `tcit_posts`)

El contenedor del backend corre `prisma migrate deploy` al iniciar, así que el schema se crea
automáticamente — no hay nada más que configurar.

¿Quieres poblar la base con datos de prueba (por ejemplo, para ver la lista con miles de filas)? Ver
[Datos de prueba (seed)](#datos-de-prueba-seed) más abajo — `pnpm seed`.

## Desarrollo local (hot reload)

Para esto sirve `pnpm start` en la raíz: ambos servidores de desarrollo corriendo con hot reload, solo
Postgres queda en Docker.

```bash
pnpm install:all        # instala backend/ y frontend/ de forma independiente
pnpm db:up               # levanta solo el contenedor de Postgres
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
pnpm --prefix backend run prisma:migrate:deploy   # aplica el schema
pnpm start                # corre backend (nest start --watch) + frontend (vite) juntos
```

`pnpm start` usa `concurrently` para correr ambos servidores como un solo proceso, con prefijo y color
para distinguir sus logs fácilmente:

```json
"start": "concurrently --names \"backend,frontend\" --prefix-colors \"cyan,magenta\" \"pnpm run start:backend\" \"pnpm run start:frontend\""
```

¿Prefieres trabajar solo en un lado? `pnpm start:backend` / `pnpm start:frontend` los corren por
separado, o directamente `cd backend && pnpm dev` / `cd frontend && pnpm dev`.

Para poblar la base con datos de prueba: `pnpm seed` (ver [Datos de prueba (seed)](#datos-de-prueba-seed)).

## Ejecutar los tests

Esto mismo corre automáticamente en cada push/PR vía GitHub Actions (`.github/workflows/ci.yml`):
typecheck + lint + tests de ambos lados, con el backend corriendo su suite e2e contra un contenedor de
Postgres real (no un mock), no solo contra `localhost`.

```bash
pnpm db:up   # los tests del backend pegan contra un Postgres real, no mocks
pnpm test    # ambas suites
# o:
pnpm test:backend
pnpm test:frontend
```

El backend tiene dos suites de Jest (`pnpm --prefix backend run test` / `test:e2e`, o `pnpm test:backend`
en la raíz para ambas):

- **Unit** (`src/**/*.spec.ts`) — `PostsService` contra un `PrismaService` mockeado, sin necesidad de base
  de datos.
- **E2e** (`test/**/*.e2e-spec.ts`, corridos con `--runInBand`) — levanta el `AppModule` real y ejercita la
  API de punta a punta con supertest, incluyendo doble envío concurrente de la misma idempotency key
  (prueba que solo se crea una fila) y el rate limit por ruta en la creación (prueba que el intento 21 en
  un minuto recibe `429`, no `201`).

**Los tests e2e corren contra una base de datos dedicada, `tcit_posts_test`, nunca contra `tcit_posts`**
(la base donde vive la app en sí, y cualquier dato sembrado/demo). Esto no es una buena práctica opcional
— `pretest:e2e` y `test:e2e` fijan `DATABASE_URL` a `tcit_posts_test` directamente en `package.json`
justamente porque el cleanup de la suite e2e (`prisma.post.deleteMany()` entre tests) borró una vez una
base `tcit_posts` que tenía 10 mil filas sembradas, cuando ambas apuntaban a la misma BD. `tcit_posts_test`
se crea automáticamente en cualquier escenario: vía el servicio de Postgres de `docker-compose.yml` (ver
`backend/docker/init-test-db.sql`, montado en `/docker-entrypoint-initdb.d/`) o vía
`backend/scripts/run-local-postgres.mjs` para el camino sin Docker. Se puede vaciar libremente, aislada de
lo que realmente haya en `tcit_posts`.

Los tests del frontend (`pnpm --prefix frontend test`) usan Vitest + React Testing Library contra un
cliente de API mockeado, cubriendo los estados de carga/vacío/error, los flujos de crear/editar/eliminar,
el filtro local por nombre y descripción, el renderizado incremental al hacer scroll, y que el endpoint de
listado se llama exactamente una vez por carga de vista.

> **Estado:** todas las suites se ejecutaron realmente y pasan — backend unit (6 tests), backend e2e (17
> tests, contra un Postgres real) y frontend (19 tests). Este entorno de desarrollo no tenía acceso a
> Docker/root, así que Postgres corrió vía `embedded-postgres` (binario en userspace, sin necesitar
> Docker/root — ver `backend/scripts/run-local-postgres.mjs`) en vez del servicio `db` de
> `docker-compose.yml`; el schema y el comportamiento bajo test son idénticos de cualquier forma.

## API

URL base: `http://localhost:4000/api`

| Método | Ruta          | Descripción                                    |
| ------ | ------------- | ----------------------------------------------- |
| GET    | `/posts`      | Devuelve todos los posts, más nuevos primero.   |
| POST   | `/posts`      | Crea un post. **Requiere** un header `Idempotency-Key`. Devuelve el post creado (201). |
| PATCH  | `/posts/:id`  | Reemplaza el nombre/descripción de un post. Devuelve el post actualizado (200), o 404 si no existía. No está protegido con idempotency-key como el create — un reemplazo por id ya es naturalmente idempotente. |
| DELETE | `/posts/:id`  | Elimina un post. Devuelve el post eliminado (200), o 404 si no existía. |

Los cuerpos de request/response son JSON en camelCase (`{ "name": "...", "description": "..." }`); las
columnas de Postgres subyacentes son snake_case, según las convenciones del enunciado.

### Creación idempotente de posts

`POST /posts` requiere un header `Idempotency-Key` (el frontend genera uno con `crypto.randomUUID()` por
cada intento de envío). Esto hace que los reintentos sean seguros:

```bash
KEY=$(uuidgen)
curl -X POST http://localhost:4000/api/posts \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"name":"Hello","description":"World"}'

# Reintentar con la MISMA key + mismo body reproduce la respuesta original —
# sin fila duplicada, y la respuesta trae el header `Idempotent-Replay: true`.
curl -i -X POST http://localhost:4000/api/posts \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $KEY" \
  -d '{"name":"Hello","description":"World"}'
```

Comportamiento:

- **Misma key, mismo payload, reintentado** → se devuelve la respuesta original tal cual (sin
  re-ejecutar).
- **Misma key, payload distinto** → `409 Conflict` (la key se reutilizó para un request lógicamente
  distinto).
- **Misma key, requests concurrentes en vuelo** → el que pierde la carrera recibe `409 Conflict` en vez de
  competir por insertar un duplicado.
- Los registros expiran después de `IDEMPOTENCY_KEY_TTL_HOURS` (24h por defecto), tras lo cual la key
  vuelve a estar disponible.

Implementación: `backend/src/common/interceptors/idempotency.interceptor.ts`, aplicado vía
`@UseInterceptors(IdempotencyInterceptor)` solo en la ruta de creación, respaldado por la tabla
`idempotency_keys` (ver `backend/prisma/schema.prisma`).

## Notas de comportamiento del frontend

- **La lista se trae una sola vez por carga de vista**: `postsSlice.fetchPosts` usa `createAsyncThunk` de
  Redux Toolkit (RTK) — la función que RTK da para manejar llamadas a una API — con una condición extra:
  antes de llamar a la API, revisa el estado (`listStatus`); si ya dice "cargando" o "ya cargado", no hace
  el llamado. Así, aunque algo intente pedir la lista de nuevo (por ejemplo, si el componente se vuelve a
  montar), la llamada de red real ocurre una sola vez. Hay un test que lo prueba: despacha la acción tres
  veces seguidas y verifica que la API se llamó solo una vez.
- **Estados de carga / vacío / error**: `PostList` renderiza explícitamente un mensaje de carga, un
  estado vacío de "no hay posts", y un mensaje de error — el happy path no es el único caso manejado.
- **Filtro local**: `PostFilter` filtra la lista ya cargada del lado del cliente, contra el nombre *y* la
  descripción (substring, sin distinguir mayúsculas/minúsculas), sin ida y vuelta al servidor. El botón
  "Buscar" del wireframe se descartó a propósito en favor de filtrar en vivo mientras se escribe, ya que
  el requisito es explícitamente local/instantáneo; la etiqueta se cambió de "Filtro de Nombre" a "Buscar
  por nombre o descripción" apenas empezó a matchear también la descripción, en vez de dejar una etiqueta
  que no reflejara lo que realmente hace.
- **Filtro sticky, renderizado incremental al hacer scroll**: `.post-filter` usa `position: sticky` para
  seguir alcanzable mientras se recorre una lista larga. `PostList` renderiza solo `PAGE_SIZE` (150) filas
  a la vez y va sumando más vía un `IntersectionObserver` (una API del navegador que avisa cuando un
  elemento se hace visible en pantalla) puesto sobre un elemento "centinela" al final de la tabla — la
  lista completa se sigue trayendo en un solo request igual (ver arriba), esto solo cambia cuánto de esa
  data termina montado en el DOM. Importa a escala real:
  `backend/scripts/seed-posts.mjs 10000` siembra 10 mil filas falsas para ejercitar esto (`GET /posts` en
  sí se mantiene rápido a ese tamaño — ~130ms — lo que se atora es el DOM con miles de `<tr>` crudos, no
  la red).
- **Creación con reintento seguro**: `apiPostIdempotent` en `api/client.ts` reintenta hasta 3 veces (solo
  ante falla de red o 5xx, nunca ante 4xx) reutilizando la *misma* idempotency key entre intentos — la
  idea es que una respuesta perdida por una conexión inestable no arriesgue crear un post duplicado.
- **Edición inline** (más allá del enunciado original): al hacer clic en "Editar" en una fila, esta se
  convierte en un formulario inline (mismo `<tr>`, para mantener coherencia de teclado/lector de pantalla
  con el resto de la tabla) con "Guardar" / "Cancelar". Respaldado por `updatePost` en el slice de Redux y
  `PATCH /posts/:id`.
- **Confirmación de eliminación en modal** (más allá del enunciado original): "Eliminar" abre un modal
  (`ConfirmDialog`, renderizado vía `createPortal` para no quedar recortado por el scroll horizontal de la
  tabla) en vez de borrar directo con un solo clic — evita pérdida de datos por error. Se cierra con
  Escape, clic en el fondo, o los botones.

## Arquitectura del backend

Un módulo de feature estándar de Nest, `PostsModule`:

```
posts.controller.ts   → rutas + DTOs con class-validator; delega directo al service
posts.service.ts      → lógica de negocio, habla con PrismaService directamente (sin capa extra de
                         repository, igual que en otras apps Nest de este mismo código — los modelos de
                         Prisma hacen de DTO de respuesta ya que los campos Date se serializan a ISO
                         strings de todas formas)
dto/create-post.dto.ts → validado por el ValidationPipe global (whitelist + forbidNonWhitelisted), con un
                         @Transform que recorta espacios antes de validar (para que un valor de solo
                         espacios en blanco falle @IsNotEmpty() en vez de colarse — el frontend ya recorta,
                         pero la API no debería depender solo de eso)
```

`PrismaService` (en `src/prisma/`) envuelve `PrismaClient` como provider inyectable y `@Global()` —
conecta en `onModuleInit`, desconecta en `onModuleDestroy` — así cualquier módulo puede inyectarlo sin
volver a importar `PrismaModule`. `main.ts` llama a `app.enableShutdownHooks()`, sin lo cual esos hooks de
ciclo de vida nunca se disparan ante un `SIGTERM` (por ejemplo, al detener el contenedor).

Aspectos transversales:

- **`AllExceptionsFilter`** (`common/filters/`, registrado como `APP_FILTER`) normaliza todo error
  lanzado — tanto las `HttpException` propias de Nest como el `PrismaClientKnownRequestError` de Prisma
  (`P2025` → 404, `P2002` → 409) — al formato estándar de Nest `{ statusCode, message, error }`.
- **`ThrottlerGuard`** (registrado como `APP_GUARD`) — un rate limit global generoso (120 req/min).
  `POST /posts` lo restringe más vía `@Throttle({ default: { limit: 20, ttl: 60_000 } })` en la ruta —
  las escrituras merecen un límite más estricto que las lecturas, independiente de la protección contra
  duplicados *accidentales* que ya da la idempotency key.
- **`nestjs-pino`** — logging de requests estructurado, conectado al `Logger` propio de Nest vía
  `app.useLogger()` en `main.ts`, así cualquier `new Logger(...)` en la app termina pasando por pino.
- **Swagger** (`@nestjs/swagger`, el plugin del compilador en `nest-cli.json`) — los schemas se infieren
  automáticamente desde los tipos de retorno de los controllers, sin necesitar `@ApiProperty()` manual.
  Docs en `/api/docs`.

**Alias de rutas**: los imports entre módulos usan `@common/*` (→ `src/common/*`) y `@db/*` (→
`src/prisma/*`) en vez de `../../rutas/relativas`, igual que en el resto de apps Nest de este código. El
`paths` de `tsconfig.json` solo hace que esos alias resuelvan para el compilador de TypeScript y el
editor — el build por defecto de Nest (basado en `tsc`) **no** los reescribe en el JS compilado, así que
un `node dist/main.js` normal fallaría con `Cannot find module '@common/...'` sin ayuda extra. `tsc-alias`
(corrido después de `nest build`, y en modo `-w` junto a `nest start --watch` en el script `dev`) reescribe
cada alias a una ruta relativa en el output compilado, así que tanto `pnpm build` como `pnpm dev` funcionan
igual que si se hubieran usado imports relativos comunes. Jest resuelve los mismos alias por su cuenta vía
`moduleNameMapper` en `package.json` y en `test/jest-e2e.json`.

## Datos de prueba (seed)

Para poblar la base con datos de prueba (útil para ver el renderizado incremental del frontend a escala
real), corre desde la raíz del proyecto:

```bash
pnpm seed          # 10.000 posts falsos por defecto
pnpm seed -- 500    # o una cantidad específica
```

Esto llama a `backend/scripts/seed-posts.mjs`, que inserta los posts directo vía Prisma (`createMany` en
lotes) en vez de pasar por la API HTTP — miles de POSTs individuales serían lentos y chocarían con el rate
limit de creación. Toma `DATABASE_URL` desde `backend/.env`, así que solo requiere haber seguido el setup
de [Desarrollo local](#desarrollo-local-hot-reload) (o tener la base de `docker compose up` corriendo en
el puerto de siempre). El script se niega a correr si `DATABASE_URL` apunta a `tcit_posts_test`, como
protección extra.

**Los tests e2e nunca deben correr contra la misma base que este script puebla** — de ahí la base
`tcit_posts_test` separada, ver [Ejecutar los tests](#ejecutar-los-tests). (Esta separación existe porque
en un momento no existía, y correr los tests e2e borró por completo una base con 10 mil filas sembradas.)

## Variables de entorno

Ver `backend/.env.example` y `frontend/.env.example`. Un `docker compose up` completo no necesita ninguno
de los dos archivos — `docker-compose.yml` fija las variables de entorno del contenedor directamente.
