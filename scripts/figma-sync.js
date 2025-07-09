const fs = require("fs");
const fetch = require("node-fetch");
const path = require("path");

// Environment variables
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FILE_ID = process.env.FILE_ID;
const PAGE_NAME = "Icons";

const ICONS_DIR = path.join(__dirname, "..", "icons");
const ICONS_JSON = path.join(__dirname, "..", "icons.json");
const VERSION_JSON = path.join(__dirname, "..", "icons.version.json");

// Normalize icon filenames
function sanitizeName(name) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

// Recursively collect all components and instances
function getAllComponentNodes(node) {
  let components = [];
  if (node.type === "COMPONENT" || node.type === "INSTANCE") {
    components.push(node);
  }
  if (node.children) {
    for (const child of node.children) {
      components = components.concat(getAllComponentNodes(child));
    }
  }
  return components;
}

// Fetch Figma file structure
async function getFileData() {
  const res = await fetch(`https://api.figma.com/v1/files/${FILE_ID}`, {
    headers: { "X-Figma-Token": FIGMA_TOKEN },
  });
  if (!res.ok) throw new Error("❌ Failed to fetch Figma file data");
  return res.json();
}

// Export SVGs by node ID
async function exportSvg(nodeIds) {
  const url = `https://api.figma.com/v1/images/${FILE_ID}?ids=${nodeIds.join(",")}&format=svg`;
  const res = await fetch(url, {
    headers: { "X-Figma-Token": FIGMA_TOKEN },
  });
  if (!res.ok) throw new Error("❌ Failed to export SVGs");
  return (await res.json()).images;
}

// Download single SVG
async function downloadSvg(url, name) {
  const res = await fetch(url);
  const svg = await res.text();
  const filePath = path.join(ICONS_DIR, `${sanitizeName(name)}.svg`);
  fs.writeFileSync(filePath, svg);
}

// Simple version bump: 1.01 → 1.02
function bumpVersion(prev) {
  const [major, minor] = prev.split(".").map(Number);
  const nextMinor = (minor + 1).toString().padStart(2, "0");
  return `${major}.${nextMinor}`;
}

// Main logic
(async () => {
  console.log("🔥 Sync started");

  fs.mkdirSync(ICONS_DIR, { recursive: true });

  const fileJson = await getFileData();
  const page = fileJson.document.children.find(
    (p) => p.name === PAGE_NAME && p.type === "CANVAS"
  );
  if (!page) {
    throw new Error(`❌ Page '${PAGE_NAME}' not found.`);
  }

  const iconNodes = getAllComponentNodes(page);
  const nodeIds = iconNodes.map((n) => n.id);
  const imageUrls = await exportSvg(nodeIds);

  const currentFilenames = [];

  for (const node of iconNodes) {
    const filename = `${sanitizeName(node.name)}.svg`;
    const url = imageUrls[node.id];
    if (url) {
      await downloadSvg(url, node.name);
      currentFilenames.push(filename);
      console.log(`⬇️  Synced: ${filename}`);
    } else {
      console.warn(`⚠️  No URL for ${node.name}`);
    }
  }

  // 🧹 Delete unused .svg files
  const existingFiles = fs.readdirSync(ICONS_DIR).filter(f => f.endsWith(".svg"));
  const toDelete = existingFiles.filter(f => !currentFilenames.includes(f));
  for (const file of toDelete) {
    const filePath = path.join(ICONS_DIR, file);
    fs.unlinkSync(filePath);
    console.log(`🗑️  Deleted: ${file}`);
  }

  // 🔢 Load previous version
  let prevVersion = "1.00";
  if (fs.existsSync(VERSION_JSON)) {
    try {
      const prev = JSON.parse(fs.readFileSync(VERSION_JSON, "utf8"));
      prevVersion = prev.version || prevVersion;
    } catch (e) {
      console.warn("⚠️  Could not parse previous version file, starting from 1.00");
    }
  }

  const newVersion = bumpVersion(prevVersion);
  const timestamp = new Date().toISOString();

  const versionData = {
    version: newVersion,
    generated_at: timestamp,
    icons: currentFilenames,
  };

  fs.writeFileSync(ICONS_JSON, JSON.stringify(versionData, null, 2));
  fs.writeFileSync(VERSION_JSON, JSON.stringify(versionData, null, 2));

  console.log(`📦 Version bumped: ${prevVersion} → ${newVersion}`);
  console.log("✅ icons.json and icons.version.json written.");
})();
