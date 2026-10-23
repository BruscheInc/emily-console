// Garment measurements from the factory measurement sheets (tech packs). Source of truth for length / inseam /
// garment-size questions that the website size charts (bust / waist / hips only) don't answer.
// Values are in CM exactly as on the sheet. Width measurements are taken FLAT (garment laid flat, one side) —
// double them for the all-around measurement.
const CM_PER_IN = 2.54;

const SPECS = [
  {
    name: "Men's Long Lounge Set",
    matches: "Men's Long Lounge Set, Men's Lounge Set, Men's Lounge Pants, Men's Long Sleeve Lounge Top, men's pajamas / PJs",
    source: "Larkspur measurement sheet, updated 14.05.26, fit test 5",
    sizes: ["S", "M", "L", "XL", "2XL"],
    parts: [
      { part: "Top", rows: [
        ["Body length from high point of shoulder", [70, 71, 72, 73, 75]],
        ["Across shoulder", [47.5, 48.5, 50.5, 51.5, 53]],
        ["Across front, middle of armhole", [44.5, 45.5, 47.5, 48.5, 50]],
        ["Across back, middle of armhole", [45.5, 46.5, 48.5, 49.5, 51]],
        ["Chest, 1\" below armhole (flat)", [54.5, 57, 61.5, 64, 67]],
        ["Neck opening, seam to seam", [21, 21.5, 22, 22.5, 23]],
        ["Front neck drop", [12.5, 12.75, 13, 13.25, 13.5]],
        ["Back neck drop", [5.5, 5.5, 5.5, 5.5, 5.5]],
        ["Sleeve length from armhole", [58, 58, 64, 65, 65]],
        ["Armhole", [26, 27, 29, 30, 31]],
        ["Bicep (flat)", [19.5, 20, 20.5, 21, 21.5]],
        ["Sleeve opening (flat)", [13.25, 13.5, 13.75, 14, 14.5]],
        ["Bottom sweep / hem width (flat)", [54.5, 57, 61.5, 64, 67]],
        ["Neck collar height", [2.5, 2.5, 2.5, 2.5, 2.5]],
      ] },
      { part: "Pants", rows: [
        ["Waistband height", [4, 4, 4, 4, 4]],
        ["Waist, relaxed (flat; elastic stretches more)", [36, 38, 40, 42, 45]],
        ["Drawstring length", [105, 110, 115, 120, 125]],
        ["Front rise incl. waistband", [31, 32, 33, 34, 35]],
        ["Back rise incl. waistband", [36, 37, 38, 39, 40]],
        ["Hip (flat)", [53.5, 56, 58.5, 60, 64]],
        ["Thigh, 2.5 cm below crotch (flat)", [29.75, 31, 32.25, 33.5, 35]],
        ["Inseam", [65, 65, 70, 72, 72]],
        ["Leg opening (flat)", [19.5, 20, 21, 22, 23]],
        ["Pocket opening", [16.5, 16.5, 16.5, 16.5, 16.5]],
      ] },
    ],
  },
];

const inch = (cm) => Math.round((cm / CM_PER_IN) * 4) / 4;   // nearest 1/4"
const fmtIn = (n) => { const w = Math.floor(n), f = n - w; const fr = f === 0.25 ? "¼" : f === 0.5 ? "½" : f === 0.75 ? "¾" : ""; return `${w || (fr ? "" : "0")}${fr}"`; };

function text() {
  const out = [
    "GARMENT MEASUREMENTS (from our factory measurement sheets — use these for length, inseam, sleeve, rise and other garment-size questions the website size chart doesn't cover):",
    "- Numbers are the garment itself, not body measurements. Widths marked (flat) are measured with the garment laid flat across one side — double them for the all-around measurement.",
    "- Give inches first (cm in brackets). Inches below are rounded to the nearest ¼\". Measurements can vary by about ½\" (1 cm) from piece to piece.",
    "- For height questions, compare honestly: a typical adult inseam is roughly 30-34\" and tall people often need more. If our inseam is shorter than they'd need, say so plainly (these run cropped/relaxed on tall frames) rather than promising it'll fit.",
    "- Only quote a style listed here. If the style, or the size (e.g. XS or 3XL), isn't listed, say you don't have that measurement and offer to have the team check — never guess or borrow numbers from another style.",
  ];
  for (const s of SPECS) {
    out.push(`\n${s.name.toUpperCase()} (applies to: ${s.matches}). Sizes on file: ${s.sizes.join(", ")}.`);
    for (const p of s.parts) {
      out.push(`${p.part}:`);
      for (const [label, vals] of p.rows) out.push(`  ${label}: ` + s.sizes.map((z, i) => `${z} ${fmtIn(inch(vals[i]))} (${vals[i]} cm)`).join(" · "));
    }
  }
  return out.join("\n");
}

module.exports = { SPECS, text };
