# Local compose secrets (not committed)

`docker compose -f docker-compose.m0.yml build api` does **not** need these files.

`docker compose -f docker-compose.m0.yml up` bind-mounts:

- `auth_jwt_secret`
- `webhook_signing_secret`
- `cursor_pool_key`
- `postgres_password` (only with `--profile m1-preview`)

Create placeholders:

```bash
./bootstrap.sh
```

Values are local-dev only. The API stores `secret_ref` (`file:` / `env:`) and never echoes resolved plaintext.
