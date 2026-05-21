import { Eta } from "eta";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import puppeteer from "puppeteer";

import type { AgenticSkill } from "../core/types";

type ShareInput = {
  skills: Array<{ skill: AgenticSkill; body: string }>;
  outDir: string;
  renderImage?: RenderShareImage;
  audience?: string;
  highlights?: string[];
  redact?: boolean;
  caseStudies?: Array<{
    title: string;
    result: string;
    skillRefs?: string[];
  }>;
};

export type RenderShareImage = (
  htmlPath: string,
  pngPath: string,
  viewport: { width: number; height: number; fullPage?: boolean }
) => Promise<void>;

type ShareFile = {
  kind: "manifest" | "html" | "cover" | "detail";
  path: string;
  mimeType: "application/json" | "text/html" | "image/png";
};

type ShareResult = {
  artifactId: string;
  files: ShareFile[];
  skillCount: number;
  redacted: boolean;
  redactionSummary: {
    paths: number;
    privateUrls: number;
    secrets: number;
    truncatedBodies: number;
    omittedChars: number;
  };
  warnings: string[];
};

type ShareViewSkill = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  tag: string;
  references: string[];
  body: string;
};

type ShareViewModel = {
  title: string;
  audience?: string;
  skillCount: number;
  skillLabel: string;
  lead: string;
  highlights: string[];
  caseStudies: Array<{ title: string; result: string; skillRefs: string[] }>;
  redacted: boolean;
  redactionState: string;
  redactionNote: string;
  redactionSummary: ShareResult["redactionSummary"];
  skills: ShareViewSkill[];
  coverSkills: ShareViewSkill[];
  detailSkills: ShareViewSkill[];
  logoDataUri?: string;
  qrDataUri?: string;
  githubUrl: string;
  shareDataJson: string;
};

type ShareImageAssets = {
  logoDataUri?: string;
  qrDataUri?: string;
};

const GITHUB_URL = "https://github.com/xingbofeng/skill-deck";

function metadataStringList(metadata: Record<string, unknown> | undefined, key: string): string[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function declaredReferencePaths(skill: AgenticSkill): string[] {
  return Array.from(
    new Set([
      ...skill.exampleFiles,
      ...metadataStringList(skill.metadata, "references"),
      ...metadataStringList(skill.metadata, "referenceFiles")
    ])
  );
}

export function redactShareText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>)]*(?:token|key|secret|signature)=[^\s"'<>)]*/gi, "[REDACTED_URL]")
    .replace(/\/Users\/[^\s"'<>)]*/g, "[REDACTED_PATH]")
    .replace(/(?:sk|ghp|github_pat)_[A-Za-z0-9_\\-]{12,}/g, "[REDACTED_SECRET]");
}

function redactionSummary(value: string): ShareResult["redactionSummary"] {
  return {
    paths: (value.match(/\/Users\/[^\s"'<>)]*/g) ?? []).length,
    privateUrls: (value.match(/https?:\/\/[^\s"'<>)]*(?:token|key|secret|signature)=[^\s"'<>)]*/gi) ?? [])
      .length,
    secrets: (value.match(/(?:sk|ghp|github_pat)_[A-Za-z0-9_\\-]{12,}/g) ?? []).length,
    truncatedBodies: 0,
    omittedChars: 0
  };
}

function safeSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "skill"
  );
}

function shareBody(value: string, redact: boolean): string {
  return redact ? redactShareText(value) : value;
}

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function skillTag(skill: AgenticSkill, fallback: string): string {
  return skill.tags[0] ?? fallback;
}

function buildShareViewModel(
  input: ShareInput,
  assets: ShareImageAssets,
  summary: ShareResult["redactionSummary"]
): ShareViewModel {
  const redact = input.redact ?? true;
  const skills = input.skills.map((item) => ({
    id: item.skill.id,
    name: item.skill.name,
    description: item.skill.description,
    tags: item.skill.tags,
    tag: skillTag(item.skill, "skill"),
    references: declaredReferencePaths(item.skill),
    body: shareBody(item.body, redact)
  }));
  const title = input.skills.length === 1 ? input.skills[0]!.skill.name : "Skill Pack";
  const defaultLead =
    skills.length === 1
      ? `我把 ${skills[0]!.name} 这个 Skill 整理成了可浏览、可接入、可转发的分享页。`
      : `我把 ${skills.length} 个常用 Skill 整理成了一套合集，方便你快速了解、搜索和接入。`;
  const highlights =
    input.highlights?.length
      ? input.highlights
      : ["完整展示每个 SKILL.md", "默认脱敏本地路径、secret 和私有 URL", "保留 MCP 接入方式，方便 Agent 动态加载"];

  return {
    title,
    audience: input.audience,
    skillCount: skills.length,
    skillLabel: skills.length === 1 ? "Skill" : "Skills",
    lead: defaultLead,
    highlights,
    caseStudies: (input.caseStudies ?? []).map((item) => ({
      title: item.title,
      result: item.result,
      skillRefs: item.skillRefs ?? []
    })),
    redacted: redact,
    redactionState: redact ? "已开启" : "未开启",
    redactionNote: redact
      ? "已移除本地路径、secret 和 private URL；reference 只展示路径，不读取文件内容。"
      : "Redaction disabled；这个分享包可能包含本地路径、secret 或 private URL。",
    redactionSummary: redact
      ? summary
      : { paths: 0, privateUrls: 0, secrets: 0, truncatedBodies: 0, omittedChars: 0 },
    skills,
    coverSkills: skills.slice(0, 6),
    detailSkills: skills.slice(0, 8),
    logoDataUri: assets.logoDataUri,
    qrDataUri: assets.qrDataUri,
    githubUrl: GITHUB_URL,
    shareDataJson: safeScriptJson({ skills })
  };
}

async function assetDataUri(filePath: string, mimeType: string): Promise<string | undefined> {
  try {
    const bytes = await readFile(filePath);
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

async function loadShareImageAssets(): Promise<ShareImageAssets> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const assetRoots = [
    path.resolve(process.cwd(), "assets"),
    path.resolve(moduleDir, "../../assets"),
    path.resolve(moduleDir, "../../../../assets")
  ];
  let logoDataUri: string | undefined;
  let qrDataUri: string | undefined;
  for (const assetRoot of assetRoots) {
    logoDataUri ??= await assetDataUri(path.join(assetRoot, "skilldeck-logo-inline.png"), "image/png");
    qrDataUri ??= await assetDataUri(path.join(assetRoot, "skilldeck-qr-inline.jpeg"), "image/jpeg");
    if (logoDataUri && qrDataUri) break;
  }
  return { logoDataUri, qrDataUri };
}

async function templateRoot(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../template"),
    path.resolve(process.cwd(), "packages/adapter/src/template"),
    path.resolve(moduleDir, "../packages/adapter/src/template"),
    path.resolve(moduleDir, "../../packages/adapter/src/template")
  ];
  for (const candidate of candidates) {
    try {
      await readFile(path.join(candidate, "share-page.html"), "utf8");
      return candidate;
    } catch {
      // Source checkouts and published packages place template files differently.
    }
  }
  throw new Error("Share templates not found under src/template");
}

async function renderTemplate(templateName: string, view: ShareViewModel): Promise<string> {
  const eta = new Eta({ views: await templateRoot(), autoEscape: true });
  return eta.renderAsync(templateName, view);
}

async function validateRenderedPng(
  pngPath: string,
  viewport: { width: number; height: number; fullPage?: boolean },
  kind: "cover" | "detail"
): Promise<void> {
  const bytes = await readFile(pngPath);
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 45 || bytes.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`invalid PNG for ${kind}: missing PNG signature or IHDR`);
  }
  if (bytes.subarray(bytes.length - 8, bytes.length - 4).toString("ascii") !== "IEND") {
    throw new Error(`invalid PNG for ${kind}: missing IEND chunk`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (viewport.fullPage ? width !== viewport.width || height < viewport.height : width !== viewport.width || height !== viewport.height) {
    throw new Error(
      `invalid PNG for ${kind}: expected ${viewport.fullPage ? "at least " : ""}${viewport.width}x${viewport.height}, got ${width}x${height}`
    );
  }
}

export const renderShareImageWithPuppeteer: RenderShareImage = async (htmlPath, pngPath, viewport) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: "networkidle0" });
    await page.screenshot({ path: pngPath, type: "png", fullPage: viewport.fullPage ?? false });
  } finally {
    await browser.close();
  }
};

export async function generateSkillShare(input: ShareInput): Promise<ShareResult> {
  const outDir = path.resolve(input.outDir);
  await mkdir(outDir, { recursive: true });
  const artifactId = safeSlug(
    `${input.skills.map((item) => item.skill.id).join("-")}-${Date.now().toString(36)}`
  );
  const htmlPath = path.join(outDir, "index.html");
  const coverHtmlPath = path.join(outDir, "cover.html");
  const detailHtmlPath = path.join(outDir, "detail.html");
  const coverPngPath = path.join(outDir, "cover.png");
  const detailPngPath = path.join(outDir, "detail.png");
  const manifestPath = path.join(outDir, "manifest.json");
  const renderImage = input.renderImage ?? renderShareImageWithPuppeteer;
  const rawBody = input.skills.map((item) => item.body).join("\n");
  const summary = redactionSummary(rawBody);
  const redact = input.redact ?? true;
  const view = buildShareViewModel(input, await loadShareImageAssets(), summary);
  const [page, cover, detail] = await Promise.all([
    renderTemplate("share-page.html", view),
    renderTemplate("share-cover.html", view),
    renderTemplate("share-detail.html", view)
  ]);

  await Promise.all([
    writeFile(htmlPath, page, "utf8"),
    writeFile(coverHtmlPath, cover, "utf8"),
    writeFile(detailHtmlPath, detail, "utf8")
  ]);
  const coverViewport = { width: 1080, height: 1440 };
  const detailViewport = { width: 1080, height: 1760, fullPage: true };
  await Promise.all([
    (async () => {
      await renderImage(coverHtmlPath, coverPngPath, coverViewport);
      await validateRenderedPng(coverPngPath, coverViewport, "cover");
    })(),
    (async () => {
      await renderImage(detailHtmlPath, detailPngPath, detailViewport);
      await validateRenderedPng(detailPngPath, detailViewport, "detail");
    })()
  ]);

  const result: ShareResult = {
    artifactId,
    files: [
      { kind: "manifest", path: manifestPath, mimeType: "application/json" },
      { kind: "html", path: htmlPath, mimeType: "text/html" },
      { kind: "cover", path: coverPngPath, mimeType: "image/png" },
      { kind: "detail", path: detailPngPath, mimeType: "image/png" }
    ],
    skillCount: input.skills.length,
    redacted: redact,
    redactionSummary: view.redactionSummary,
    warnings: redact ? [] : ["Redaction disabled; share output may contain local paths, secrets, or private URLs."]
  };
  await writeFile(manifestPath, JSON.stringify(result, null, 2), "utf8");
  return result;
}

export async function readShareArtifact(
  filePath: string,
  shareOutputRoots: string[],
  mimeType: "application/json" | "text/html" | "image/png" = "text/html"
): Promise<{ mimeType: "application/json" | "text/html" | "image/png"; text?: string }> {
  const resolved = path.resolve(filePath);
  const allowed = shareOutputRoots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
  });
  if (!allowed) {
    throw new Error("artifact path is outside shareOutputRoots");
  }
  if (mimeType === "image/png") {
    return { mimeType };
  }
  return {
    mimeType,
    text: await readFile(resolved, "utf8")
  };
}

export async function readShareManifestForArtifact(
  artifactId: string,
  shareOutputRoots: string[]
): Promise<ShareResult> {
  async function readIfMatching(manifestPath: string): Promise<ShareResult | undefined> {
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as ShareResult;
      return parsed.artifactId === artifactId ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  for (const root of shareOutputRoots) {
    const rootPath = path.resolve(root);
    const rootManifest = await readIfMatching(path.join(rootPath, "manifest.json"));
    if (rootManifest) return rootManifest;
    const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(rootPath, entry.name, "manifest.json");
      const manifest = await readIfMatching(manifestPath);
      if (manifest) return manifest;
    }
  }
  throw new Error(`share artifact not found: ${artifactId}`);
}
