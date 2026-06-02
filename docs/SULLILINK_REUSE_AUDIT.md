# SullyLink / retranToReel Reuse Audit

## Inputs Reviewed

- `retranToReel_codebase 2.zip`
- `master-plan.md`
- `external_references/sullilink/`
- Existing local specs under `outputs/cre_ops_blueprint/`

## Relevant Files From The Zip

| File | Useful Pattern | Treatment |
| --- | --- | --- |
| `daily_update.py` | Daily scrape/import loop, skip existing APNs, import count logging | Reuse concept only |
| `dedupe_spreadsheet.py` | APN-based spreadsheet dedupe and preview mode | APN-aware batch dedupe added when APN columns are present |
| `retran_scraper.py` | Explicit source scrape command with typed search modes | Later, only after source rights/credentials handling |
| `recDocReader/reader.py` | Recording document extraction fields for auction and loan facts | Reuse schema fields for TitlePro/NOD/NTS extraction |
| `CODEBASE_GUIDE.md` | TitlePro worker queue, email importer, AI summary worker, status vocabulary | Reuse queue/status design |

## Relevant Files From `external_references/sullilink`

| File | Useful Pattern | Treatment |
| --- | --- | --- |
| `src/import-export/propertyradar-alerts.js` | HTML/text PropertyRadar digest parser, normalized change types, source-event import | HTML parser support added to `codex-monday-digest` |
| `src/sellers/distress-score.js` | Distress scoring inputs and owner foreclosure counts | Later scoring layer only |
| `src/sellers/portfolio-distress.js` | Portfolio/lender-owner patterns | Later broker dashboard layer |
| `src/entities/cluster.js` | Entity clustering and portfolio summaries | Later entity graph layer |

## Decisions

- Keep `codex-monday-digest` as the immediate implementation target.
- Keep old app/zip code under ignored `external_references/`.
- Copy patterns, not credentials or full source files.
- Run `codex-monday-digest source-audit` before adapting additional old code so the source bundle and goal markdown produce a compact, shareable reuse plan.
- Add only narrow code that improves the Monday lane now.
- Put broader CRE Brain/SullyLink database work after the Monday lane has proven daily value.

## Safety Exclusions

Never commit or publish:

- `.env` values
- browser cookies or sessions
- hardcoded passwords
- old TitlePro PDFs/TIFs unless explicitly packaged privately
- raw external app dumps
- local-only absolute paths

## Implemented In This Pass

- Created Codex skill `monday-cre-workflow`.
- Added HTML PropertyRadar digest table parsing to `codex-monday-digest`.
- Added saved-email `gmail_preview --input` provenance.
- Added preview-only TitlePro approval queue and workbook tab.
- Added APN-aware batch dedupe for CSV exports with APN columns while keeping owner-string clusters provisional.
- Added `source-audit` to convert the SullyLink/retranToReel zip or extracted reference directory plus the goal markdown into `source_reuse_audit.json`, `source_reuse_recommendations.json`, `source_risk_scan.json`, and `source_reuse_plan.md` without copying old source or exposing secret values.
- Added this reuse audit and tonight build goal docs.
