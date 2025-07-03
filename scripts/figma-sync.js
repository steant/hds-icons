const fs = require("fs");
const fetch = require("node-fetch");
const path = require("path");

// Environment variables
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FILE_ID = process.env.FILE_ID;
const PAGE_NAME = "Icons";

const ICONS_DIR = path.join(__dirname, "..", "icons");

// Helper: Recursively collect components and instances
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

// Normalize filenames
function sanitizeName(name) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

// Fetch Figma file structure
async function getFileData() {
  const res = await fetch(`https://api.figma.com/v1/files/${FILE_ID}`, {
    headers: { "X-Figma-Token": FIGMA_TOKEN },
  });
  if (!res.ok) throw new Error("Failed to fetch Figma file data");
  return res.json();
}

// Export selected nodes to SVG
async function exportSvg(nodeIds) {
  const url = `https://api.figma.com/v1/images/${FILE_ID}?ids=${nodeIds.join(",")}&format=svg`;
  const res = await fetch(url, {
    headers: { "X-Figma-Token": FIGMA_TOKEN },
  });
  if (!res.ok) throw new Error("Failed to export SVGs");
  return (await res.json()).images;
}

// Download individual SVG
async function downloadSvg(url, name) {
  const res = await fetch(url);
  const svg = await res.text();
  const filePath = path.join(ICONS_DIR, `${sanitizeName(name)}.svg`);
  fs.writeFileSync(filePath, svg);
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
    const sanitized = sanitizeName(node.name);
    const filename = `${sanitized}.svg`;
    const url = imageUrls[node.id];
    if (url) {
      await downloadSvg(url, node.name);
      currentFilenames.push(filename);
      console.log(`⬇️  Synced: ${filename}`);
    } else {
      console.warn(`⚠️  No URL for ${node.name}`);
    }
  }

  // 🧹 Delete unused icons
  const existingFiles = fs.readdirSync(ICONS_DIR).filter(f => f.endsWith(".svg"));
  const toDelete = existingFiles.filter(f => !currentFilenames.includes(f));

  for (const file of toDelete) {
    const filePath = path.join(ICONS_DIR, file);
    fs.unlinkSync(filePath);
    console.log(`🗑️  Deleted: ${file}`);
  }

  // 📝 Generate icons.json
  const jsonData = {
    generated_at: new Date().toISOString(),
    icons: currentFilenames,
  };

  const jsonPath = path.join(__dirname, "..", "icons.json");
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log("✅ icons.json written and unused icons cleaned.");
})();
