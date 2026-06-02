const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function pythonBin() {
  return process.env.CODEX_PYTHON_BIN || "python3";
}

function exportWorkbook(runFolder, xlsxPath) {
  const script = String.raw`
import csv, json, os, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

run_folder, xlsx_path = sys.argv[1], sys.argv[2]

def read_json(name, default):
    path = os.path.join(run_folder, name)
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def read_csv(name):
    path = os.path.join(run_folder, name)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))

def add_sheet(wb, title, rows):
    ws = wb.create_sheet(title)
    if not rows:
        ws.append(["No rows"])
        return
    headers = []
    for row in rows:
        for key in row.keys():
            if key not in headers:
                headers.append(key)
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F4E78")
    for row in rows:
        ws.append([json.dumps(row.get(h), ensure_ascii=True) if isinstance(row.get(h), (dict, list)) else row.get(h) for h in headers])
    for idx, header in enumerate(headers, start=1):
        width = min(max(len(str(header)) + 2, 12), 48)
        for cell in ws[get_column_letter(idx)]:
            if cell.value is not None:
                width = min(max(width, len(str(cell.value)) + 2), 60)
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = "A2"

wb = Workbook()
wb.remove(wb.active)

if os.path.exists(os.path.join(run_folder, "candidate_properties.json")):
    add_sheet(wb, "Candidate Properties", read_json("candidate_properties.json", []))
    add_sheet(wb, "Owner Clusters", read_json("owner_cluster_candidates.json", []))
    add_sheet(wb, "Monday Batch Preview", read_json("monday_batch_preview.json", []))
    add_sheet(wb, "Monday Action Queue", read_csv("monday_action_queue.csv"))
    add_sheet(wb, "Needs Review", read_json("needs_review.json", []))
else:
    mutations = read_json("monday_mutations_preview.json", [])
    rows = []
    for mutation in mutations:
        row = {"operation": mutation.get("operation"), "dedupe_key": mutation.get("dedupe_key"), "item_name": mutation.get("item_name")}
        row.update(mutation.get("columns", {}))
        rows.append(row)
    add_sheet(wb, "Monday Import", rows)
    add_sheet(wb, "Monday Action Queue", read_csv("monday_action_queue.csv"))
    add_sheet(wb, "Monday Lookup", read_json("monday_lookup_results.json", []))
    add_sheet(wb, "Subitems Preview", read_json("monday_subitems_preview.json", []))
    add_sheet(wb, "TitlePro Approval", read_json("titlepro_approval_queue_preview.json", []))
    add_sheet(wb, "TitlePro Decisions", read_json("titlepro_approval_decisions.json", []))
    add_sheet(wb, "TitlePro Pull Requests", read_json("titlepro_pull_requests_approved.json", []))
    add_sheet(wb, "TitlePro Confirmed", read_json("titlepro_confirmed_manual_actions.json", []))
    add_sheet(wb, "TitlePro Evidence", read_json("titlepro_evidence_intake.json", []))
    add_sheet(wb, "Role Assertions", read_json("titlepro_role_assertions_preview.json", []))
    add_sheet(wb, "Broker Packets", read_json("broker_packets_preview.json", []))
    add_sheet(wb, "Needs Review", read_json("needs_review.json", []))

os.makedirs(os.path.dirname(xlsx_path), exist_ok=True)
wb.save(xlsx_path)
`;
  const result = spawnSync(pythonBin(), ["-c", script, runFolder, xlsxPath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Workbook export failed: ${result.stderr || result.stdout}`);
  }
  return xlsxPath;
}

function updateManifestWithWorkbook(runFolder, xlsxPath) {
  const manifestPath = path.join(runFolder, "run_manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.output_paths = Array.from(new Set([...(manifest.output_paths || []), xlsxPath]));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

module.exports = {
  exportWorkbook,
  updateManifestWithWorkbook
};
