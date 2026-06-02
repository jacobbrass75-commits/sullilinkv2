# codex-monday-digest

Focused local runner for the Monday.com distressed-CRE workflow.

This tool turns saved PropertyRadar digest text into Monday-ready preview artifacts. It now also includes a browser dashboard so the team does not need to work inside Monday.com or run daily terminal commands.

The digest parser supports saved plain text and the HTML table shape commonly preserved by Gmail/PropertyRadar exports.

It does not write to Monday, send Gmail, pull TitlePro, write RealNex, backfill providers, or promote owner/control claims in the default path.

## Team Dashboard

Start the shared browser app:

```text
npm run app
```

Then open:

```text
http://localhost:8787
```

For teammates on the same trusted network, start it with the default LAN bind and give them the Mac's local network address:

```text
HOST=0.0.0.0 PORT=8787 npm run app
```

Example team URL:

```text
http://<this-mac-local-ip>:8787
```

The dashboard supports:

- paste or upload a PropertyRadar digest text file
- build a digest review run
- upload or use the default PropertyRadar CSV for owner clusters
- review lead rows, source-event preservation, default tasks, hard holds, owner clusters, and verification status
- download `monday_import_preview.xlsx` and the JSON/verification artifacts

Run folders are saved under:

```text
../outputs/monday_digest_runs/
```

Keep the dashboard on a trusted office/VPN network because this first version has no login screen.

To use a server-side default CSV instead of uploading one, start the app with:

```text
PROPERTYRADAR_BATCH_CSV=/path/to/propertyradar_export.csv npm run app
```

## Commands

```text
codex-monday-digest parse --input EMAIL_OR_TEXT_FILE --mode local_dry_run --out RUN_FOLDER
codex-monday-digest export --run RUN_FOLDER --xlsx RUN_FOLDER/monday_import_preview.xlsx
codex-monday-digest verify --run RUN_FOLDER
codex-monday-digest batch-owner-clusters --input PROPERTYRADAR_CSV --mode local_dry_run --out RUN_FOLDER
codex-monday-digest sync --run RUN_FOLDER --mode monday_lookup_dry_run
codex-monday-digest sync --run RUN_FOLDER --mode live_write
```

`local_dry_run` needs no credentials. `live_write` is intentionally blocked unless the later Monday approval and environment gates are satisfied.

## Local Proofs

From this folder:

```text
npm test
npm run proof:ken
npm run proof:edge
npm run proof:batch
```

The batch owner-cluster lane treats CSV owner strings as candidate grouping clues only. Every output remains provisional until APN/county/Radar ID, title evidence, SOS role evidence, current-status evidence, and approval gates are added.
