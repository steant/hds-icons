const fs = require("fs");
const fetch = require("node-fetch");
const path = require("path");

// Environment variables
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FILE_ID = process.env.FILE_ID;
const PAGE_NAME = "Icons"; // Change this if your page is named differently

const ICONS_DIR = path.join(__dirname, "..", "icons");

// Helper: Find page by name
function findPageByName(fileJson, pageName) {
  return fileJson.document.children.find(
    (page) => page.name === pageName && page.type === "CANVAS"
  );
}

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

// Optional: normalize filenames
function sanitizeName(name) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

// Main logic
(async () => {
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  const fileJson = await getFileData();
  const page = findPageByName(fileJson, PAGE_NAME);
console.log("Available pages in Figma file:");
fileJson.document.children.forEach((page) => {
  console.log(`- ${page.name}`);
});
if (!page) throw new Error(`Page '${PAGE_NAME}' not found`);
  

  const iconNodes = getAllComponentNodes(page);
  const nodeIds = iconNodes.map((n) => n.id);

  const imageUrls = await exportSvg(nodeIds);

  for (const node of iconNodes) {
    const url = imageUrls[node.id];
    if (url) {
      console.log(`⬇️  Downloading: ${node.name}`);
      await downloadSvg(url, node.name);
    } else {
      console.warn(`⚠️  No URL for ${node.name}`);
    }
  }

  console.log("✅ Done syncing icons.");
})();
