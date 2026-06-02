const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { FORBIDDEN_ZERO, ensureDir, nowIso, sha256File, slugify, writeJson } = require("./runtime");

function pythonBin() {
  return process.env.CODEX_PYTHON_BIN || "python3";
}

function readWorkflowSources({ workflowDir, input }) {
  const sourcePaths = [];
  if (workflowDir) {
    const root = path.resolve(workflowDir);
    for (const entry of fs.readdirSync(root)) {
      const fullPath = path.join(root, entry);
      if (isWorkbook(fullPath)) sourcePaths.push(fullPath);
    }
  }
  if (input) sourcePaths.push(path.resolve(input));
  if (!sourcePaths.length) throw new Error("workflow-map requires --workflow-dir DIR or --input WORKBOOK.xlsx");

  return sourcePaths.sort((a, b) => path.basename(a).localeCompare(path.basename(b))).map(readWorkbook);
}

function isWorkbook(filePath) {
  return fs.existsSync(filePath)
    && fs.statSync(filePath).isFile()
    && !path.basename(filePath).startsWith("~$")
    && [".xlsx", ".xlsm"].includes(path.extname(filePath).toLowerCase());
}

function readWorkbook(filePath) {
  const script = String.raw`
import json, sys
import re
import zipfile
from xml.etree import ElementTree as ET

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}

def text_content(node):
    if node is None:
        return ""
    return "".join(node.itertext())

def col_index(ref):
    letters = re.sub(r"[^A-Z]", "", ref.upper())
    value = 0
    for char in letters:
        value = value * 26 + ord(char) - 64
    return value - 1

def read_shared_strings(zf):
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return [text_content(si) for si in root.findall("main:si", NS)]

def read_sheet_rows(zf, path, shared_strings):
    root = ET.fromstring(zf.read(path))
    rows = []
    for row in root.findall(".//main:sheetData/main:row", NS):
        values = []
        for cell in row.findall("main:c", NS):
            ref = cell.attrib.get("r", "")
            index = col_index(ref)
            while len(values) <= index:
                values.append(None)
            cell_type = cell.attrib.get("t")
            if cell_type == "inlineStr":
                value = text_content(cell.find("main:is", NS))
            else:
                raw = text_content(cell.find("main:v", NS))
                if cell_type == "s" and raw:
                    value = shared_strings[int(raw)]
                else:
                    value = raw
            values[index] = value if value != "" else None
        rows.append(values)
    return rows

def sheet_target_path(target):
    target = target.lstrip("/")
    if target.startswith("xl/"):
        return target
    return "xl/" + target

with zipfile.ZipFile(sys.argv[1]) as zf:
    shared_strings = read_shared_strings(zf)
    workbook = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_targets = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("pkg:Relationship", NS)
    }
    payload = []
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        rid = sheet.attrib.get("{%s}id" % NS["rel"])
        target = rel_targets.get(rid)
        if not target:
            continue
        sheet_path = sheet_target_path(target)
        payload.append({
            "sheet_name": sheet.attrib.get("name"),
            "rows": read_sheet_rows(zf, sheet_path, shared_strings)
        })
print(json.dumps(payload))
`;
  const result = spawnSync(pythonBin(), ["-c", script, filePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Monday workflow xlsx read failed: ${result.stderr || result.stdout}`);
  }
  return {
    source_path: path.basename(filePath),
    source_path_scope: "basename_only",
    source_sha256: sha256File(filePath),
    source_format: path.extname(filePath).toLowerCase().replace(/^\./, ""),
    sheets: JSON.parse(result.stdout || "[]")
  };
}

function buildWorkflowMap({ workflowDir, input }) {
  const generatedAt = nowIso();
  const sources = readWorkflowSources({ workflowDir, input });
  const workflows = [];
  const needsReview = [];
  const skippedSheets = [];
  for (const source of sources) {
    for (const sheet of source.sheets) {
      if (isIndexOrPlanSheet(sheet)) continue;
      const parsed = parseWorkflowSheet(source, sheet);
      if (parsed.workflow) workflows.push(parsed.workflow);
      needsReview.push(...parsed.needsReview);
      if (parsed.skippedSheet) skippedSheets.push(parsed.skippedSheet);
    }
  }
  const sourceProfile = buildSourceProfile(generatedAt, sources, workflows, needsReview, skippedSheets);
  return {
    workflow_map: {
      schema_version: 1,
      mode: "monday_workflow_map",
      generated_at: generatedAt,
      workflow_count: workflows.length,
      parent_task_count: workflows.reduce((sum, workflow) => sum + workflow.parent_task_count, 0),
      subitem_count: workflows.reduce((sum, workflow) => sum + workflow.subitem_count, 0),
      skipped_sheet_count: skippedSheets.length,
      workflows,
      guardrails: {
        monday_live_writes_executed: 0,
        external_writes_executed: 0,
        control_claim_promotions: 0,
        use: "Template/context map only. Do not create or update Monday boards from this artifact without explicit live-write gates."
      }
    },
    stage_map: buildStageMap(workflows),
    source_profile: sourceProfile,
    needs_review: needsReview,
    summary_markdown: renderWorkflowSummary({ sourceProfile, workflows, needsReview })
  };
}

function isIndexOrPlanSheet(sheet) {
  const title = String(sheet.sheet_name || "").toLowerCase();
  if (["index", "validation lists", "monday operating plan", "daily codex run", "broker today", "intern today", "exceptions approvals"].includes(title)) return true;
  const first = firstText(sheet.rows?.[0]);
  return title === "index" || first === "Workflow";
}

function parseWorkflowSheet(source, sheet) {
  const rows = (sheet.rows || []).map(trimTrailingEmpty);
  const workflowName = firstText(rows[0]) || sheet.sheet_name;
  const templateName = firstText(rows[1]) || null;
  const headerIndex = rows.findIndex((row) => normalize(row[0]) === "name" && row.some((cell) => normalize(cell) === "subitems"));
  if (headerIndex < 0) {
    if (isKnownNonTemplateSheet(source, sheet)) {
      return {
        workflow: null,
        needsReview: [],
        skippedSheet: {
          source_path: source.source_path,
          source_path_scope: "basename_only",
          sheet_name: sheet.sheet_name,
          reason: "non_template_solution_sheet"
        }
      };
    }
    return {
      workflow: null,
      needsReview: [{
        source_path: source.source_path,
        sheet_name: sheet.sheet_name,
        reason: "missing_monday_export_header",
        severity: "review",
        summary: "Sheet did not contain the expected Monday export header row."
      }],
      skippedSheet: null
    };
  }
  const parentHeaders = normalizeHeaders(rows[headerIndex]);
  const subitemHeaderVariants = [];
  const workflow = {
    workflow_id: slugify(workflowName || sheet.sheet_name),
    workflow_name: workflowName,
    template_name: templateName,
    source_path: source.source_path,
    source_path_scope: "basename_only",
    source_sheet: sheet.sheet_name,
    source_format: source.source_format,
    columns: uniqueValues(parentHeaders.filter(Boolean)),
    main_columns: uniqueValues(parentHeaders.filter(Boolean)),
    subitem_column_variants: subitemHeaderVariants,
    parent_task_count: 0,
    subitem_count: 0,
    status_values: [],
    date_values: [],
    long_text_field_present: parentHeaders.includes("long_text"),
    parent_tasks: []
  };
  const needsReview = [];
  let currentParent = null;
  let currentSubitemHeaders = null;

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!rowHasText(row)) continue;
    if (isSubitemHeader(row)) {
      currentSubitemHeaders = normalizeHeaders(row.slice(1));
      addSubitemHeaderVariant(subitemHeaderVariants, currentSubitemHeaders);
      continue;
    }
    if (firstText(row)) {
      currentParent = parentTaskFromRow(row, parentHeaders, rowIndex + 1);
      workflow.parent_tasks.push(currentParent);
      continue;
    }
    if (currentSubitemHeaders && textAt(row, 1)) {
      if (!currentParent) {
        needsReview.push({
          source_path: source.source_path,
          sheet_name: sheet.sheet_name,
          source_row_index: rowIndex + 1,
          reason: "subitem_without_parent_task",
          severity: "review",
          summary: "Subitem row appeared before a parent task row."
        });
        continue;
      }
      currentParent.subitems.push(subitemFromRow(row.slice(1), currentSubitemHeaders, rowIndex + 1));
    }
  }

  workflow.parent_task_count = workflow.parent_tasks.length;
  workflow.subitem_count = workflow.parent_tasks.reduce((sum, task) => sum + task.subitems.length, 0);
  workflow.status_values = uniqueValues(workflow.parent_tasks.flatMap((task) => [task.status, ...task.subitems.map((subitem) => subitem.status)]).filter(Boolean));
  workflow.date_values = uniqueValues(workflow.parent_tasks.flatMap((task) => [task.date, ...task.subitems.map((subitem) => subitem.date)]).filter(Boolean)).slice(0, 20);
  workflow.long_text_field_present = workflow.long_text_field_present || workflow.parent_tasks.some((task) => task.long_text || task.subitems.some((subitem) => subitem.long_text));
  return { workflow, needsReview };
}

function isKnownNonTemplateSheet(source, sheet) {
  if (!/solution/i.test(source.source_path) && source.sheets.length < 20) return false;
  const title = String(sheet.sheet_name || "").toLowerCase();
  if (/^\d{2}\s/.test(title) || title === "index") return false;
  return true;
}

function addSubitemHeaderVariant(variants, headers) {
  const normalized = uniqueValues(headers.filter(Boolean));
  const key = normalized.join("|");
  if (!variants.some((variant) => variant.join("|") === key)) variants.push(normalized);
}

function parentTaskFromRow(row, headers, sourceRowIndex) {
  const value = valueGetter(row, headers);
  return {
    task_id: `task_${String(sourceRowIndex).padStart(4, "0")}_${slugify(value("name")).slice(0, 48)}`,
    source_row_index: sourceRowIndex,
    name: value("name"),
    person: value("person") || value("owner"),
    status: value("status"),
    date: value("date"),
    long_text: value("long_text"),
    action_count: countActions(value("long_text")),
    subitems: []
  };
}

function subitemFromRow(row, headers, sourceRowIndex) {
  const value = valueGetter(row, headers);
  return {
    subitem_id: `subitem_${String(sourceRowIndex).padStart(4, "0")}_${slugify(value("name")).slice(0, 48)}`,
    source_row_index: sourceRowIndex,
    name: value("name"),
    owner: value("owner") || value("person"),
    status: value("status"),
    date: value("date"),
    long_text: value("long_text"),
    action_count: countActions(value("long_text"))
  };
}

function valueGetter(row, headers) {
  return (field) => {
    const index = headers.indexOf(field);
    return index >= 0 ? textAt(row, index) : null;
  };
}

function normalizeHeaders(row) {
  return row.map((header) => {
    const normalized = normalize(header);
    if (normalized === "longtext") return "long_text";
    if (normalized === "person") return "person";
    if (normalized === "owner") return "owner";
    if (normalized === "subitems") return "subitems";
    if (normalized === "status") return "status";
    if (normalized === "date") return "date";
    if (normalized === "name") return "name";
    return normalized || null;
  });
}

function isSubitemHeader(row) {
  return normalize(row[0]) === "subitems" && normalize(row[1]) === "name";
}

function rowHasText(row) {
  return row.some((cell) => textAt([cell], 0));
}

function firstText(row = []) {
  return textAt(row, 0);
}

function textAt(row, index) {
  const value = row[index];
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function trimTrailingEmpty(row = []) {
  const next = [...row];
  while (next.length && (next[next.length - 1] === null || String(next[next.length - 1]).trim() === "")) next.pop();
  return next;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function countActions(text) {
  return String(text || "").split(/\r?\n/).filter((line) => /\b(action|task|step)\b/i.test(line)).length;
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== "")));
}

function buildSourceProfile(generatedAt, sources, workflows, needsReview, skippedSheets = []) {
  return {
    mode: "monday_workflow_map",
    generated_at: generatedAt,
    source_count: sources.length,
    worksheet_count: sources.reduce((sum, source) => sum + source.sheets.length, 0),
    parsed_workflow_count: workflows.length,
    parent_task_count: workflows.reduce((sum, workflow) => sum + workflow.parent_task_count, 0),
    subitem_count: workflows.reduce((sum, workflow) => sum + workflow.subitem_count, 0),
    needs_review_count: needsReview.length,
    skipped_sheet_count: skippedSheets.length,
    skipped_sheets: skippedSheets.slice(0, 100),
    sources: sources.map((source) => ({
      source_path: source.source_path,
      source_path_scope: source.source_path_scope,
      source_sha256: source.source_sha256,
      source_format: source.source_format,
      sheet_count: source.sheets.length
    })),
    monday_live_writes_executed: 0,
    external_writes_executed: 0,
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
}

function buildStageMap(workflows) {
  return workflows.flatMap((workflow) => {
    return workflow.parent_tasks.map((task, index) => ({
      workflow_id: workflow.workflow_id,
      workflow_name: workflow.workflow_name,
      stage_id: task.task_id,
      stage_order: index + 1,
      stage_name: task.name,
      source_path: workflow.source_path,
      source_path_scope: "basename_only",
      source_sheet: workflow.source_sheet,
      source_row_index: task.source_row_index,
      status: task.status,
      date: task.date,
      subitem_count: task.subitems.length,
      subitem_names: task.subitems.map((subitem) => subitem.name).filter(Boolean),
      long_text_present: Boolean(task.long_text),
      action_count: task.action_count + task.subitems.reduce((sum, subitem) => sum + subitem.action_count, 0),
      monday_live_writes_executed: 0,
      external_writes_executed: 0
    }));
  });
}

function renderWorkflowSummary({ sourceProfile, workflows, needsReview }) {
  const lines = [
    "# Monday Workflow Map",
    "",
    `Generated workflows: ${workflows.length}`,
    `Parent tasks: ${sourceProfile.parent_task_count}`,
    `Subitems: ${sourceProfile.subitem_count}`,
    `Skipped non-template sheets: ${sourceProfile.skipped_sheet_count || 0}`,
    `Needs review: ${needsReview.length}`,
    "",
    "This is a local map of exported Monday workflow templates. It is not a Monday write plan and records zero external actions.",
    "",
    "## Workflows",
    "",
    "| Workflow | Parent tasks | Subitems | Status values | Source |",
    "| --- | ---: | ---: | --- | --- |",
    ...workflows.map((workflow) => `| ${escapeMd(workflow.workflow_name)} | ${workflow.parent_task_count} | ${workflow.subitem_count} | ${escapeMd(workflow.status_values.join(", ") || "None")} | ${escapeMd(workflow.source_path)} |`)
  ];
  if (needsReview.length) {
    lines.push("", "## Needs Review", "");
    for (const item of needsReview) lines.push(`- ${item.source_path} / ${item.sheet_name}: ${item.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function writeWorkflowMapRun(outDir, workflowMap) {
  ensureDir(outDir);
  const manifest = {
    run_id: path.basename(path.resolve(outDir)).replace(/[^a-zA-Z0-9_-]+/g, "_") || "workflow_map",
    started_at: workflowMap.source_profile.generated_at,
    mode: "monday_workflow_map",
    input_paths: workflowMap.source_profile.sources.map((source) => source.source_path),
    output_paths: [],
    counts: {
      workflows: workflowMap.workflow_map.workflow_count,
      parent_tasks: workflowMap.workflow_map.parent_task_count,
      subitems: workflowMap.workflow_map.subitem_count,
      needs_review: workflowMap.needs_review.length
    },
    forbidden_actions: { ...FORBIDDEN_ZERO }
  };
  writeJson(path.join(outDir, "monday_workflow_map.json"), workflowMap.workflow_map);
  writeJson(path.join(outDir, "monday_workflow_stage_map.json"), workflowMap.stage_map);
  writeJson(path.join(outDir, "monday_workflow_source_profile.json"), workflowMap.source_profile);
  writeJson(path.join(outDir, "needs_review.json"), workflowMap.needs_review);
  fs.writeFileSync(path.join(outDir, "monday_workflow_summary.md"), workflowMap.summary_markdown);
  manifest.output_paths = [
    path.join(outDir, "monday_workflow_map.json"),
    path.join(outDir, "monday_workflow_stage_map.json"),
    path.join(outDir, "monday_workflow_source_profile.json"),
    path.join(outDir, "monday_workflow_summary.md"),
    path.join(outDir, "needs_review.json")
  ];
  writeJson(path.join(outDir, "run_manifest.json"), manifest);
}

module.exports = {
  buildWorkflowMap,
  writeWorkflowMapRun
};
