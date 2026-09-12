# PocketBase MCP Server

An MCP server that exposes PocketBase operations as tools for AI assistants. It provides 24 tools covering collections, records, authentication, and database backups, built on the MCP TypeScript SDK v2 and the PocketBase JavaScript SDK.

## Requirements

- Node.js >= 26
- pnpm >= 12
- A running PocketBase instance

## Setup MCP Server Locally

Install dependencies and compile the server:

```bash
pnpm install
pnpm build
```

Configure the server in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "pocketbase": {
      "type": "local",
      "command": ["node", "build/index.js"],
      "enabled": true,
      "environment": {
        "POCKETBASE_URL": "http://127.0.0.1:8090",
        "POCKETBASE_ADMIN_EMAIL": "admin@example.com",
        "POCKETBASE_ADMIN_PASSWORD": "admin_password"
      }
    }
  }
}
```

Adjust the `environment` values to match your PocketBase instance. If the server is configured from outside this directory, use an absolute path to `build/index.js`.

Running `pnpm start` loads a `.env` file from the project root via Node's `--env-file-if-exists` flag. See `.env.example` for the available variables.

## Setup MCP Server with Podman

You can run the PocketBase MCP server using Podman. A `Containerfile` is included in the repository.

### Building the Container Image

```bash
podman build -t pocketbase-mcp .
```

### Creating the Secrets

Credentials are passed as Podman secrets, exported as environment variables inside the container (`type=env`). Name each secret after the environment variable it provides.

```bash
# Create the admin password secret
printf '%s' 'your_admin_password' | podman secret create POCKETBASE_ADMIN_PASSWORD -

# Create the admin email secret
printf '%s' 'your_admin@example.com' | podman secret create POCKETBASE_ADMIN_EMAIL -
```

### Running the Container

```bash
podman run -d \
  --name pocketbase-mcp \
  -e POCKETBASE_URL=http://127.0.0.1:8090 \
  --secret POCKETBASE_ADMIN_EMAIL,type=env \
  --secret POCKETBASE_ADMIN_PASSWORD,type=env \
  pocketbase-mcp
```

### Podman MCP Configuration

To let OpenCode start the containerized server on demand, configure it in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "pocketbase": {
      "type": "local",
      "command": [
        "podman",
        "run",
        "-i",
        "--rm",
        "-e",
        "POCKETBASE_URL=http://host.containers.internal:8090",
        "--secret",
        "POCKETBASE_ADMIN_EMAIL,type=env",
        "--secret",
        "POCKETBASE_ADMIN_PASSWORD,type=env",
        "pocketbase-mcp"
      ],
      "enabled": true
    }
  }
}
```

### Podman Configuration Notes

- **`-i`**: Interactive mode (required for stdio communication)
- **`--rm`**: Automatically remove container when it exits
- **`host.containers.internal`**: Use this to access PocketBase running on your host machine from within the container
- **`--secret ... ,type=env`**: Exports a Podman secret as an environment variable named after the secret; secrets must exist before running (`podman secret create`)
- **Environment Variables**: Only non-sensitive values like `POCKETBASE_URL` stay as environment variables
- **Network**: If your PocketBase is also running in a container, use Podman networking (e.g., `--network host` or custom bridge network)

## Configuration

The server requires the following environment variable:

- `POCKETBASE_URL`: URL of your PocketBase instance (e.g., `http://127.0.0.1:8090`)

Optional environment variables:

- `POCKETBASE_ADMIN_EMAIL`: Admin email, needed for operations that require superuser authentication
- `POCKETBASE_ADMIN_PASSWORD`: Admin password

## Available Tools

### Collections

- `create_collection`: Create a new collection
- `update_collection`: Update an existing collection
- `get_collection`: Get a collection by ID or name
- `list_collections`: List collections, optionally filtered or sorted
- `delete_collection`: Delete a collection

### Records

- `create_record`: Create a record in a collection
- `list_records`: List records with optional filters, sorting, and pagination
- `update_record`: Update an existing record
- `delete_record`: Delete a record
- `import_data`: Import multiple records into a collection (create, update, or upsert)

### Authentication

- `list_auth_methods`: List the enabled authentication methods of a collection
- `authenticate_user`: Authenticate with email and password
- `authenticate_with_oauth2`: Authenticate with an OAuth2 provider
- `authenticate_with_otp`: Request an OTP or complete OTP authentication
- `auth_refresh`: Refresh the current authentication token
- `request_verification`: Request an email verification
- `confirm_verification`: Confirm an email verification
- `request_password_reset`: Request a password reset
- `confirm_password_reset`: Confirm a password reset
- `request_email_change`: Request an email change
- `confirm_email_change`: Confirm an email change
- `impersonate_user`: Impersonate a user as an admin (requires admin credentials)
- `create_user`: Create a new user account

### Backups

- `backup_database`: Create a backup of the PocketBase database

## Development

Run the unit and registration tests (the integration test is skipped):

```bash
pnpm test:unit
```

Run the live integration test against a managed PocketBase instance:

```bash
pnpm test:integration
```

Run everything in one go:

```bash
pnpm test:all
```

The integration test downloads PocketBase v0.40.4 into `.cache/pocketbase` unless `POCKETBASE_BIN` points to an existing binary (checksum verified), starts it on a free port, and removes its data directory afterwards. To test against an external instance instead, run `pnpm test:integration` with `POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, and `POCKETBASE_ADMIN_PASSWORD` set.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT. See [LICENSE](LICENSE).
