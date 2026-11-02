/**
 * RAG Studio - Intelligent Document Assistant Frontend Logic
 */

const $ = (sel) => document.querySelector(sel);

const els = {
  status: $("#status"),
  statusText: $("#status-text"),
  themeToggle: $("#theme-toggle"),
  clearChatBtn: $("#clear-chat-btn"),
  clearKbBtn: $("#clear-kb-btn"),
  dropzone: $("#dropzone"),
  fileInput: $("#file-input"),
  fileList: $("#file-list"),
  fileCountBadge: $("#file-count-badge"),
  ingestBtn: $("#ingest-btn"),
  ingestLabel: $("#ingest-label"),
  emptyHint: $("#empty-hint"),
  ingestMeta: $("#ingest-meta"),
  statFiles: $("#stat-files"),
  statChunks: $("#stat-chunks"),
  messages: $("#messages"),
  welcome: $("#welcome"),
  suggestions: $("#suggestions"),
  composer: $("#ask-input"),
  askBtn: $("#ask-btn"),
  toast: $("#toast"),
};

let selectedFiles = [];
let indexedFiles = [];
let sessionDocuments = [];
let isIngesting = false;
let toastTimer = null;
let totalIndexedFiles = 0;
let totalIndexedChunks = 0;

// ==========================================
// Theme Management
// ==========================================
function initTheme() {
  const savedTheme = localStorage.getItem("rag_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);

  els.themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("rag_theme", newTheme);
  });
}

// ==========================================
// Toast Notifications
// ==========================================
function toast(message, type = "info") {
  els.toast.textContent = message;
  els.toast.className = "toast show";
  if (type === "error") els.toast.classList.add("error");
  if (type === "success") els.toast.classList.add("success");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 3800);
}

// ==========================================
// Utility Functions
// ==========================================
function formatSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileExt(filename) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "file";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (typeof marked !== "undefined" && marked.parse) {
    try {
      return marked.parse(text);
    } catch (e) {
      console.warn("Marked parse error:", e);
    }
  }
  // Fallback simple parser
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\n\n+/g, "</p><p>");
  return "<p>" + html + "</p>";
}

// ==========================================
// Session & File List Rendering
// ==========================================
function renderFiles() {
  els.fileList.innerHTML = "";
  const allDisplay = [
    ...indexedFiles.map((f) => ({ ...f, status: "indexed" })),
    ...selectedFiles.map((f) => ({ name: f.name, size: f.size, status: "staged" })),
  ];

  allDisplay.forEach((file, idx) => {
    const li = document.createElement("li");
    li.className = "file-item";

    const ext = getFileExt(file.name);
    const badge = document.createElement("span");
    badge.className = `file-ext-badge ${ext}`;
    badge.textContent = file.status === "indexed" ? "✓ " + ext : ext;

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.name;

    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = file.status === "indexed" ? "Indexed" : formatSize(file.size);

    const removeBtn = document.createElement("button");
    removeBtn.className = "file-remove-btn";
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", "Remove " + file.name);
    removeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    removeBtn.addEventListener("click", () => {
      if (file.status === "staged") {
        const sIdx = selectedFiles.findIndex((f) => f.name === file.name);
        if (sIdx > -1) selectedFiles.splice(sIdx, 1);
      } else {
        const iIdx = indexedFiles.findIndex((f) => f.name === file.name);
        if (iIdx > -1) indexedFiles.splice(iIdx, 1);
        sessionDocuments = sessionDocuments.filter(
          (d) => d.metadata && d.metadata.source !== file.name
        );
        saveSession();
        updateStats();
      }
      renderFiles();
    });

    li.append(badge, name, size, removeBtn);
    els.fileList.appendChild(li);
  });

  const stagedCount = selectedFiles.length;
  const indexedCount = indexedFiles.length;
  if (stagedCount > 0) {
    els.fileCountBadge.textContent = `${stagedCount} staged`;
    els.ingestBtn.disabled = false;
  } else if (indexedCount > 0) {
    els.fileCountBadge.textContent = `${indexedCount} active`;
    els.ingestBtn.disabled = true;
  } else {
    els.fileCountBadge.textContent = "0 files";
    els.ingestBtn.disabled = true;
  }
  els.emptyHint.hidden = allDisplay.length > 0;
}

function updateStats() {
  totalIndexedFiles = indexedFiles.length;
  totalIndexedChunks = sessionDocuments.length;
  els.statFiles.textContent = totalIndexedFiles;
  els.statChunks.textContent = totalIndexedChunks;
}

function saveSession() {
  try {
    sessionStorage.setItem("rag_session_docs", JSON.stringify(sessionDocuments));
    sessionStorage.setItem("rag_session_files", JSON.stringify(indexedFiles));
  } catch (e) {
    console.warn("Storage quota exceeded", e);
  }
}

function restoreSession() {
  try {
    const rawDocs = sessionStorage.getItem("rag_session_docs");
    const rawFiles = sessionStorage.getItem("rag_session_files");
    if (rawDocs && rawFiles) {
      sessionDocuments = JSON.parse(rawDocs);
      indexedFiles = JSON.parse(rawFiles);
      updateStats();
      renderFiles();
      if (indexedFiles.length > 0) {
        els.ingestMeta.innerHTML = `Loaded <strong>${indexedFiles.length}</strong> active document(s) (${sessionDocuments.length} chunks) in session.`;
      }
    }
  } catch (e) {
    console.warn("Failed to restore session", e);
  }
}

function setIngestLoading(loading) {
  isIngesting = loading;
  els.ingestBtn.disabled = loading || selectedFiles.length === 0;
  els.ingestBtn.classList.toggle("loading", loading);
  els.ingestBtn.querySelector(".spinner")?.remove();

  if (loading) {
    const s = document.createElement("span");
    s.className = "spinner";
    s.setAttribute("aria-hidden", "true");
    els.ingestBtn.prepend(s);
    els.ingestLabel.textContent = "Indexing Documents…";
  } else {
    els.ingestLabel.textContent = "Ingest & Vectorize";
  }
}

// ==========================================
// Ingestion Action
// ==========================================
async function ingest() {
  if (selectedFiles.length === 0) return true;
  setIngestLoading(true);
  els.ingestMeta.innerHTML = "";

  const filesToUpload = [...selectedFiles];
  const form = new FormData();
  filesToUpload.forEach((file) => form.append("files", file));

  try {
    const res = await fetch("/ingest?replace=true", { method: "POST", body: form });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data && data.detail ? data.detail : "Document ingestion failed.");
    }

    const fileCount = data.files_ingested.length;
    const chunkCount = data.total_chunks;

    indexedFiles = filesToUpload.map((f) => ({ name: f.name, size: f.size }));
    sessionDocuments = data.documents || [];
    selectedFiles = [];

    saveSession();
    updateStats();
    renderFiles();

    const plural = chunkCount === 1 ? "chunk" : "chunks";
    els.ingestMeta.innerHTML = `Indexed <strong>${fileCount}</strong> file(s) into <strong>${chunkCount}</strong> ${plural}.`;
    toast(`Indexed ${fileCount} document(s) successfully (${chunkCount} ${plural})`, "success");
    return true;
  } catch (err) {
    toast(err.message, "error");
    return false;
  } finally {
    setIngestLoading(false);
  }
}

// ==========================================
// Reset / Clear Knowledge Base
// ==========================================
async function clearKnowledgeBase() {
  selectedFiles = [];
  indexedFiles = [];
  sessionDocuments = [];
  sessionStorage.removeItem("rag_session_docs");
  sessionStorage.removeItem("rag_session_files");

  try {
    await fetch("/reset", { method: "POST" });
  } catch (e) {
    console.warn("Reset call error", e);
  }

  updateStats();
  renderFiles();
  els.ingestMeta.innerHTML = "";
  toast("Knowledge base cleared. Upload new documents to begin.", "info");
}

// ==========================================
// Chat Logic & Rendering
// ==========================================
function scrollToBottom() {
  els.messages.scrollTo({
    top: els.messages.scrollHeight,
    behavior: "smooth",
  });
}

function addUserMessage(text) {
  const msg = document.createElement("div");
  msg.className = "msg user";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "You";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  msg.append(avatar, bubble);
  els.messages.appendChild(msg);
  scrollToBottom();
}

function addTyping() {
  const msg = document.createElement("div");
  msg.className = "msg bot";
  msg.id = "active-typing";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const box = document.createElement("div");
  box.className = "typing-box";
  box.innerHTML = `
    <span>Analyzing query &amp; retrieving document context</span>
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>
  `;

  bubble.appendChild(box);
  msg.append(avatar, bubble);
  els.messages.appendChild(msg);
  scrollToBottom();
  return msg;
}

function addSourceGroup(sourceName, chunks) {
  const details = document.createElement("details");
  details.className = "source";

  const summary = document.createElement("summary");
  const name = document.createElement("span");
  name.className = "src-name";
  name.textContent = sourceName;
  name.title = sourceName;

  const count = document.createElement("span");
  count.className = "src-count";
  count.textContent = chunks.length === 1 ? "1 chunk" : `${chunks.length} chunks`;

  summary.append(name, count);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "src-body";

  chunks.forEach((chunk) => {
    const block = document.createElement("div");
    block.className = "src-chunk";
    block.textContent = chunk.content;
    body.appendChild(block);
  });

  details.appendChild(body);
  return details;
}

function renderAnswer(data) {
  const msg = document.createElement("div");
  msg.className = "msg bot";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // Decision Badge
  const badge = document.createElement("span");
  if (data.used_retrieval) {
    badge.className = "badge retrieval";
    const count = data.sources ? data.sources.length : 0;
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Grounded in Documents (${count} citation${count === 1 ? "" : "s"})
    `;
  } else {
    badge.className = "badge direct";
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
      Direct LLM Response (0 retrieval cost)
    `;
  }
  bubble.appendChild(badge);

  // Markdown Answer Body
  const answerBody = document.createElement("div");
  answerBody.className = "markdown-body";
  answerBody.innerHTML = renderMarkdown(data.answer);
  bubble.appendChild(answerBody);

  // Agent Reasoning Note
  if (data.reasoning) {
    const reasoning = document.createElement("div");
    reasoning.className = "reasoning";
    reasoning.textContent = `Routing rationale: ${data.reasoning}`;
    bubble.appendChild(reasoning);
  }

  // Source Citations Drawer
  if (data.sources && data.sources.length) {
    const sourcesWrapper = document.createElement("div");
    sourcesWrapper.className = "sources";

    const groups = data.sources.reduce((acc, s) => {
      (acc[s.source] = acc[s.source] || []).push(s);
      return acc;
    }, {});

    Object.keys(groups).forEach((name) => {
      sourcesWrapper.appendChild(addSourceGroup(name, groups[name]));
    });

    bubble.appendChild(sourcesWrapper);
  }

  // Message Actions (Copy)
  const actions = document.createElement("div");
  actions.className = "msg-actions";
  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    Copy
  `;
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(data.answer).then(() => {
      copyBtn.innerHTML = "✓ Copied!";
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy
        `;
      }, 2000);
    });
  });
  actions.appendChild(copyBtn);
  bubble.appendChild(actions);

  msg.append(avatar, bubble);
  els.messages.appendChild(msg);
  scrollToBottom();
}

async function askQuestion(query) {
  const question = query || els.composer.value.trim();
  if (!question) return;

  // If user dropped files and immediately typed a question, auto-ingest first!
  if (selectedFiles.length > 0) {
    toast("Indexing newly added documents first…", "info");
    const ok = await ingest();
    if (!ok) return;
  }

  els.welcome.hidden = true;
  addUserMessage(question);
  els.composer.value = "";
  els.composer.style.height = "auto";
  els.askBtn.disabled = true;

  const typing = addTyping();

  try {
    const payload = { question };
    if (sessionDocuments && sessionDocuments.length > 0) {
      payload.documents = sessionDocuments;
    }

    const res = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    typing.remove();

    if (!res.ok) {
      throw new Error(data && data.detail ? data.detail : "Failed to obtain answer.");
    }
    renderAnswer(data);
  } catch (err) {
    typing.remove();
    toast(err.message, "error");
  } finally {
    els.askBtn.disabled = false;
    els.composer.focus();
  }
}

// ==========================================
// Event Listeners & Setup
// ==========================================
function autoGrow() {
  els.composer.style.height = "auto";
  els.composer.style.height = Math.min(els.composer.scrollHeight, 160) + "px";
}

els.dropzone.addEventListener("click", () => els.fileInput.click());
els.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    els.fileInput.click();
  }
});

function handleNewFiles(files) {
  if (!files || !files.length) return;
  selectedFiles = [...selectedFiles, ...files];
  renderFiles();
  // Auto-ingest immediately on selection for seamless UX
  ingest();
}

els.fileInput.addEventListener("change", () => {
  if (els.fileInput.files.length) {
    handleNewFiles([...els.fileInput.files]);
    els.fileInput.value = "";
  }
});

["dragover", "dragenter"].forEach((evt) =>
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropzone.classList.add("dragging");
  })
);

["dragleave", "drop"].forEach((evt) =>
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("dragging");
  })
);

els.dropzone.addEventListener("drop", (e) => {
  const files = [...e.dataTransfer.files];
  if (files.length) {
    handleNewFiles(files);
  }
});

els.ingestBtn.addEventListener("click", () => ingest());
if (els.clearKbBtn) {
  els.clearKbBtn.addEventListener("click", clearKnowledgeBase);
}

els.askBtn.addEventListener("click", () => askQuestion());

els.composer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askQuestion();
  }
});
els.composer.addEventListener("input", autoGrow);

els.clearChatBtn.addEventListener("click", () => {
  els.messages.innerHTML = "";
  els.messages.appendChild(els.welcome);
  els.welcome.hidden = false;
  toast("Conversation cleared", "info");
});

// Suggested Prompt Chips
const promptSuggestions = [
  "Summarize key insights and main takeaways from uploaded documents",
  "What are the most critical facts, numbers, or dates mentioned?",
  "Extract actionable steps or recommendations from the content",
  "Hello! What can you help me with?",
];

promptSuggestions.forEach((text) => {
  const card = document.createElement("button");
  card.className = "prompt-card";
  card.type = "button";
  card.innerHTML = `
    <span>${text}</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <polyline points="12 5 19 12 12 19"></polyline>
    </svg>
  `;
  card.addEventListener("click", () => {
    els.composer.value = text;
    askQuestion(text);
  });
  els.suggestions.appendChild(card);
});

// ==========================================
// Health Monitoring
// ==========================================
async function checkHealth() {
  try {
    const res = await fetch("/health");
    if (!res.ok) throw new Error("Unhealthy status");
    const data = await res.json();
    els.status.classList.add("ok");
    els.status.classList.remove("err");
    els.statusText.textContent = "Operational";
  } catch {
    els.status.classList.add("err");
    els.status.classList.remove("ok");
    els.statusText.textContent = "Offline";
  }
}

// Initial Boot
initTheme();
restoreSession();
checkHealth();
setInterval(checkHealth, 30000);
