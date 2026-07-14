// generate-dashboard.js
// Pulls live data from your GitHub Project (BrahmMeyer / project #1)
// and writes a fresh index.html with progress bars, dates, and notes.
//
// You never edit this file day-to-day. You only ever touch your
// GitHub Project table + your daily comments on each issue. This script does the rest.

const fs = require("fs");

const TOKEN = process.env.GH_TOKEN;
const OWNER = process.env.PROJECT_OWNER || "BrahmMeyer";
const PROJECT_NUMBER = parseInt(process.env.PROJECT_NUMBER || "1", 10);

if (!TOKEN) {
  console.error("Missing GH_TOKEN environment variable.");
  process.exit(1);
}

const QUERY = `
query($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) {
      title
      items(first: 50) {
        nodes {
          id
          content {
            ... on Issue {
              title
              number
              body
              comments(last: 10) {
                nodes {
                  body
                  createdAt
                }
              }
            }
            ... on DraftIssue {
              title
              body
            }
          }
          fieldValues(first: 20) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldTextValue {
                text
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
        }
      }
    }
  }
}`;

async function fetchProjectData() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { owner: OWNER, number: PROJECT_NUMBER },
    }),
  });

  const json = await res.json();

  if (json.errors) {
    console.error(JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  return json.data.user.projectV2;
}

function extractFields(item) {
  const fields = {};
  for (const fv of item.fieldValues.nodes) {
    const fieldName = fv.field && fv.field.name;
    if (!fieldName) continue;
    if (fv.__typename === "ProjectV2ItemFieldSingleSelectValue") fields[fieldName] = fv.name;
    if (fv.__typename === "ProjectV2ItemFieldNumberValue") fields[fieldName] = fv.number;
    if (fv.__typename === "ProjectV2ItemFieldDateValue") fields[fieldName] = fv.date;
    if (fv.__typename === "ProjectV2ItemFieldTextValue") fields[fieldName] = fv.text;
  }
  return fields;
}

function statusInfo(status, estDays, daysSpent) {
  if (status === "Done") return { width: 100, cls: "p-green" };
  if (status === "In Progress") {
    let width = 50;
    if (estDays && daysSpent) width = Math.min(100, Math.round((daysSpent / estDays) * 100));
    return { width, cls: "p-orange" };
  }
  return { width: 0, cls: "p-red" };
}

function fmtDate(iso) {
  if (!iso) return "TBD";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function buildHtml(project, stages) {
  // Each stage is worth an equal slice of the total (100 / number of stages).
  // Done = full slice, In Progress = half its slice, Not Started = 0.
  const numStages = stages.length || 1;
  const sliceValue = 100 / numStages;
  const overallPct = Math.round(
    stages.reduce((sum, x) => {
      if (x.status === "Done") return sum + sliceValue;
      if (x.status === "In Progress") return sum + sliceValue * 0.5;
      return sum;
    }, 0)
  );

  const stageCards = stages
    .map((s) => {
      const bar = statusInfo(s.status, s.estDays, s.daysSpent);
      return `
        <div class="stage-card">
            <div class="stage-header">${s.title}</div>
            <div class="progress-track">
                <div class="progress-fill ${bar.cls}" style="width: ${bar.width}%;"></div>
            </div>
            <div class="meta-grid">
                <div class="meta-item"><span class="meta-label">Est. Days Needed</span><span class="meta-value">${s.estDays ?? "-"} Days</span></div>
                <div class="meta-item"><span class="meta-label">Start Date</span><span class="meta-value">${fmtDate(s.startDate)}</span></div>
                <div class="meta-item"><span class="meta-label">End Date</span><span class="meta-value">${fmtDate(s.endDate)}</span></div>
                <div class="meta-item"><span class="meta-label">Days Logged</span><span class="meta-value">${s.daysSpent ?? 0} Days</span></div>
            </div>
            <div class="comments-block">
                <span class="meta-label">Daily Comments & Issues Encountered</span>
                <p>${(s.notes || "No notes yet.").replace(/\n/g, "<br>")}</p>
            </div>
        </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.title} - Progress Dashboard</title>
    <meta http-equiv="refresh" content="1800">
    <style>
        :root {
            --bg-color: #f4f6f9; --card-bg: #ffffff; --text-main: #2d3748;
            --text-muted: #718096; --border-color: #e2e8f0; --primary: #3182ce;
            --red: #e53e3e; --orange: #dd6b20; --green: #38a169;
        }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-color); color: var(--text-main); margin: 0; padding: 40px 20px; }
        .container { max-width: 1100px; margin: 0 auto; }
        header { margin-bottom: 40px; background: var(--card-bg); padding: 24px; border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border-left: 6px solid var(--primary); }
        header h1 { margin: 0 0 16px 0; font-size: 28px; color: #1a202c; }
        .overall-progress-container { background: #edf2f7; border-radius: 20px; height: 24px; width: 100%; overflow: hidden; }
        .overall-progress-bar { background: linear-gradient(90deg, var(--primary), #48bb78); height: 100%; transition: width 0.5s ease; }
        .overall-text { font-weight: bold; margin-top: 8px; display: inline-block; }
        .updated-text { font-size: 12px; color: var(--text-muted); margin-top: 6px; }
        .stage-card { background: var(--card-bg); border-radius: 12px; padding: 24px; margin-bottom: 24px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid var(--border-color); }
        .stage-header { font-size: 18px; font-weight: 600; margin: 0 0 16px 0; color: #2d3748; }
        .progress-track { background: #edf2f7; border-radius: 8px; height: 14px; width: 100%; margin-bottom: 20px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 8px; }
        .p-red { background: var(--red); } .p-orange { background: var(--orange); } .p-green { background: var(--green); }
        .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;
            margin-bottom: 20px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); }
        .meta-item { display: flex; flex-direction: column; }
        .meta-label { font-size: 12px; text-transform: uppercase;
