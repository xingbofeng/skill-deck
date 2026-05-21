import { startTransition, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  docsContent,
  providerPills,
  slugifyHeading,
  uiCopy,
  type Lang,
  type View,
} from "./content";
import { buildDocSearchIndex, searchDocs } from "./search";
import skilldeckLogoUrl from "../../../assets/skilldeck-logo.png?url";
import "./styles.css";

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }
}

function ProjectLogo({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <img
      className={`project-logo${className ? ` ${className}` : ""}`}
      src={skilldeckLogoUrl}
      width={size}
      height={size}
      aria-label="SkillDeck logo"
      alt="SkillDeck logo"
    />
  );
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path
          d="M20 6L9 17L4 12"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect
        x="9"
        y="9"
        width="10"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V7C5 5.9 5.9 5 7 5H15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function classifyToken(token: string, language: string) {
  if (/^\/\//.test(token) || /^\/\*/.test(token) || /^#/.test(token)) {
    return "syntax-comment";
  }
  if (/^--[\w-]+$/.test(token)) {
    return "syntax-flag";
  }
  if (/^["'`]/.test(token)) {
    return language === "json" && /"$/.test(token) ? "syntax-string" : "syntax-string";
  }
  if (/^-?\d+(?:\.\d+)?$/.test(token)) {
    return "syntax-number";
  }
  if (/^(true|false|null|undefined)$/.test(token)) {
    return "syntax-literal";
  }
  if (
    /^(import|from|const|let|var|type|interface|function|return|async|await|export|default|class|extends|new|if|else|for|while|try|catch|throw|Promise|Array|Record|string|number|boolean|unknown|void)$/.test(token)
  ) {
    return "syntax-keyword";
  }
  if (/^[{}[\]();:,.<>?=|&]+$/.test(token)) {
    return "syntax-punctuation";
  }
  if (/^(npm|npx|skill-deck|mcp|serve)$/.test(token)) {
    return "syntax-command";
  }
  return "";
}

function highlightCode(code: string, language = "text"): ReactNode[] {
  const normalizedLanguage = language.toLowerCase();
  const tokenPattern =
    normalizedLanguage === "json"
      ? /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|[{}[\],:])/g
      : normalizedLanguage === "bash" || normalizedLanguage === "sh"
        ? /(#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|--[\w-]+|\b(?:npm|npx|skill-deck|mcp|serve)\b|[|\\{}[\]();])/g
        : /(\/\/.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|const|let|var|type|interface|function|return|async|await|export|default|class|extends|new|if|else|for|while|try|catch|throw|Promise|Array|Record|string|number|boolean|unknown|void|true|false|null|undefined)\b|-?\b\d+(?:\.\d+)?\b|[{}[\]();:,.<>?=|&]+)/g;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(code))) {
    if (match.index > cursor) {
      nodes.push(code.slice(cursor, match.index));
    }
    const token = match[0];
    const tokenClass = classifyToken(token, normalizedLanguage);
    nodes.push(
      tokenClass ? (
        <span key={`${match.index}-${token}`} className={tokenClass}>
          {token}
        </span>
      ) : (
        token
      )
    );
    cursor = match.index + token.length;
  }

  if (cursor < code.length) {
    nodes.push(code.slice(cursor));
  }

  return nodes;
}

function CodeBlock({
  code,
  language = "text",
  label,
  compact = false,
}: {
  code: string;
  language?: string;
  label?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const displayLabel = label ?? language.toUpperCase();

  async function handleCopy() {
    if (!(await copyToClipboard(code))) {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={`code-block${compact ? " code-block-compact" : ""}`}>
      <div className="code-block-toolbar">
        <span>{displayLabel}</span>
        <button
          type="button"
          className="copy-icon-button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
          title={copied ? "Copied" : "Copy code"}
        >
          <CopyIcon copied={copied} />
        </button>
      </div>
      <pre className="markdown-pre">
        <code>{highlightCode(code, language)}</code>
      </pre>
    </div>
  );
}

type MarkdownCardProps = {
  markdown: string;
};

function MarkdownCard({ markdown }: MarkdownCardProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => (
          <h2 className="markdown-h2" id={slugifyHeading(String(children))}>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="markdown-h3" id={slugifyHeading(String(children))}>
            {children}
          </h3>
        ),
        p: ({ children }) => <p className="markdown-p">{children}</p>,
        ul: ({ children }) => <ul className="markdown-list">{children}</ul>,
        li: ({ children }) => <li className="markdown-item">{children}</li>,
        table: ({ children }) => <table className="markdown-table">{children}</table>,
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => <th>{children}</th>,
        td: ({ children }) => <td>{children}</td>,
        pre: ({ children }) => <>{children}</>,
        code: ({ inline, children, className }) => {
          if (inline || !className) {
            return <code className="markdown-code-inline">{children}</code>;
          }

          const language = className?.match(/language-(\w+)/)?.[1] ?? "text";
          return (
            <CodeBlock
              code={String(children).replace(/\n$/, "")}
              language={language}
            />
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

export default function App() {
  const initialSearch = new URLSearchParams(window.location.search);
  const initialLang = initialSearch.get("lang") === "en" ? "en" : "zh";
  const requestedView = initialSearch.get("view");
  const initialView =
    requestedView === "home" ||
    requestedView === "agents" ||
    requestedView === "mcp" ||
    requestedView === "quickstart"
      ? requestedView
      : "home";

  const [lang, setLang] = useState<Lang>(initialLang);
  const [view, setView] = useState<View>(initialView);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  const [activeHash, setActiveHash] = useState(initialSearch.get("section") ?? "");

  const copy = uiCopy[lang];
  const activeDoc = docsContent[lang][view];
  const isHome = view === "home";
  const installCommand = "npm install skill-deck";
  const searchResults = docSearch.trim() ? searchDocs(buildDocSearchIndex(docsContent[lang]), docSearch) : [];

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    search.set("lang", lang);
    search.set("view", view);
    if (activeHash) search.set("section", activeHash.replace(/^#/, ""));
    else search.delete("section");
    const next = `${window.location.pathname}?${search.toString()}`;
    window.history.replaceState({}, "", next);
  }, [activeHash, lang, view]);

  useEffect(() => {
    if (!activeHash) return;
    const target = document.getElementById(activeHash.replace(/^#/, ""));
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeHash, view]);

  useEffect(() => {
    setCopiedInstall(false);
  }, [lang, view]);

  async function copyInstallCommand() {
    if (!(await copyToClipboard(installCommand))) {
      return;
    }
    setCopiedInstall(true);
    window.setTimeout(() => setCopiedInstall(false), 1800);
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            startTransition(() => setView("home"));
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            <ProjectLogo size={44} />
          </span>
          <span className="brand-copy">
            <span className="brand-title">SkillDeck</span>
            <span className="brand-subtitle">{copy.brandSubtitle}</span>
          </span>
        </a>

        <nav className="top-nav" aria-label="Primary navigation">
          <div className="segmented" aria-label="View toggle">
            <button
              type="button"
              className={view === "quickstart" ? "is-active" : ""}
              onClick={() => startTransition(() => setView("quickstart"))}
            >
              {copy.quickstartLabel}
            </button>
            <button
              type="button"
              className={view === "agents" ? "is-active" : ""}
              onClick={() => startTransition(() => setView("agents"))}
            >
              {copy.agentsLabel}
            </button>
            <button
              type="button"
              className={view === "mcp" ? "is-active" : ""}
              onClick={() => startTransition(() => setView("mcp"))}
            >
              {copy.mcpLabel}
            </button>
          </div>
        </nav>

        <div className="top-actions">
          <div className="doc-search">
            <input
              type="search"
              value={docSearch}
              onChange={(event) => setDocSearch(event.target.value)}
              placeholder={lang === "zh" ? "搜索文档..." : "Search docs..."}
              aria-label={lang === "zh" ? "搜索文档" : "Search docs"}
            />
            {searchResults.length > 0 ? (
              <div className="search-popover">
                {searchResults.map((result) => (
                  <button
                    key={`${result.view}-${result.title}`}
                    type="button"
                    onClick={() => {
                      startTransition(() => setView(result.view));
                      setActiveHash(result.hash ?? "");
                      setDocSearch("");
                    }}
                  >
                    <strong>{result.title}</strong>
                    <span>{result.snippet}</span>
                  </button>
                ))}
              </div>
            ) : docSearch.trim() ? (
              <div className="search-popover search-empty">
                {lang === "zh" ? "没有匹配结果" : "No results"}
              </div>
            ) : null}
          </div>

          <div className="segmented" aria-label="Language toggle">
            <button
              type="button"
              className={lang === "zh" ? "is-active" : ""}
              onClick={() => startTransition(() => setLang("zh"))}
            >
              中文
            </button>
            <button
              type="button"
              className={lang === "en" ? "is-active" : ""}
              onClick={() => startTransition(() => setLang("en"))}
            >
              EN
            </button>
          </div>

          <a
            className="icon-link"
            href="https://github.com/xingbofeng/skill-deck"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.58 2 12.22C2 16.73 4.87 20.56 8.84 21.91C9.34 22.01 9.52 21.69 9.52 21.42C9.52 21.17 9.51 20.35 9.5 19.27C6.73 19.89 6.14 18.06 6.14 18.06C5.68 16.86 5 16.54 5 16.54C4.07 15.88 5.07 15.89 5.07 15.89C6.1 15.97 6.64 16.97 6.64 16.97C7.55 18.58 9.03 18.12 9.62 17.84C9.71 17.16 9.98 16.69 10.28 16.42C8.07 16.16 5.74 15.28 5.74 11.33C5.74 10.2 6.13 9.28 6.77 8.56C6.67 8.3 6.33 7.24 6.86 5.82C6.86 5.82 7.71 5.54 9.51 6.8C10.31 6.57 11.17 6.46 12.03 6.46C12.89 6.46 13.75 6.57 14.55 6.8C16.35 5.54 17.2 5.82 17.2 5.82C17.73 7.24 17.39 8.3 17.29 8.56C17.93 9.28 18.32 10.2 18.32 11.33C18.32 15.29 15.99 16.16 13.77 16.41C14.15 16.75 14.49 17.43 14.49 18.47C14.49 19.95 14.48 21.07 14.48 21.42C14.48 21.69 14.66 22.02 15.17 21.91C19.13 20.56 22 16.72 22 12.22C22 6.58 17.52 2 12 2Z"></path>
            </svg>
          </a>
        </div>
      </header>

      <main>
        {isHome ? (
          <section className="hero-card hero-card-home" id="top">
            <div className="hero-copy hero-copy-home">
              <div className="hero-logo-row">
                <ProjectLogo className="hero-logo" size={64} />
                <div className="hero-tag">{"Skills -> Tools -> Runtime -> MCP"}</div>
              </div>
              <h1>{docsContent[lang].home.title}</h1>
              <p className="hero-lead">{docsContent[lang].home.lead}</p>
              <div className="install-surface install-surface-home">
                <div className="install-command">
                  <code>{installCommand}</code>
                  <button
                    type="button"
                    className="copy-icon-button"
                    onClick={copyInstallCommand}
                    aria-label={copiedInstall ? copy.copiedInstall : copy.copyInstall}
                    title={copiedInstall ? copy.copiedInstall : copy.copyInstall}
                  >
                    <CopyIcon copied={copiedInstall} />
                  </button>
                </div>
                <div>
                  <span className="install-kicker">npm</span>
                  <h3>{copy.installTitle}</h3>
                  <p>{copy.installHint}</p>
                </div>
              </div>
              <div className="hero-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => startTransition(() => setView("quickstart"))}
                >
                  {copy.primaryAction}
                </button>
                <a
                  className="button-secondary"
                href="https://github.com/xingbofeng/skill-deck"
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.secondaryAction}
                </a>
              </div>
              <div className="provider-row">
                {providerPills.map((pill) => (
                  <span key={pill} className="provider-pill">
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section key={`${lang}-${view}`} className="panel-enter docs-panel-block docs-only-block" id="top">
            <div className="content-grid content-grid-single">
              <article className="content-surface content-wide">
                {activeDoc.topSnippet ? (
                  <CodeBlock
                    code={activeDoc.topSnippet.code}
                    language={
                      activeDoc.topSnippet.label === "MCP JSON"
                        ? "json"
                        : activeDoc.topSnippet.label === "TypeScript"
                          ? "ts"
                          : "bash"
                    }
                    label={activeDoc.topSnippet.label}
                    compact
                  />
                ) : null}
                <h2 className="docs-title">{activeDoc.title}</h2>
                <p className="docs-lead">{activeDoc.lead}</p>
                <MarkdownCard markdown={activeDoc.body} />
              </article>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="footer-links">
          <a href="https://github.com/xingbofeng/skill-deck" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
