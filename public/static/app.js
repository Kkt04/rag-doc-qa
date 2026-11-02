/**
 * RAG Studio - Intelligent Document Assistant Frontend Logic
 */

const $ = (sel) => document.querySelector(sel);

const els = {
  status: $("#status"),
  statusText: $("#status-text"),
  themeToggle: $("#theme-toggle"),
  clearChatBtn: $("#clear-chat-btn"),
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
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Paragraphs
  html = html.replace(/\n\n+/g, "</p><p>");
  return "<p>" + html + "</p>";
}

// ==========================================
// Document Queue & Rendering
// ==========================================
function renderFiles() {
  els.fileList.innerHTML = "";
  selectedFiles.forEach((file, idx) => {
    const li = document.createElement("li");
    li.className = "file-item";

    const ext = getFileExt(file.name);
    const badge = document.createElement("span");
    badge.className = `file-ext-badge ${ext}`;
    badge.textContent = ext;

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.name;

    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = formatSize(file.size);

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
      selectedFiles.splice(idx, 1);
      renderFiles();
    });

    li.append(badge, name, size, removeBtn);
    els.fileList.appendChild(li);
  });

  const count = selectedFiles.length;
  els.fileCountBadge.textContent = `${count} staged`;
  els.ingestBtn.disabled = count === 0;
  els.emptyHint.hidden = count > 0;
}

function setIngestLoading(loading) {
  els.ingestBtn.disabled = loading || selectedFiles.length === 0;
  els.ingestBtn.classList.toggle("loading", loading);
  els.ingestBtn.querySelector(".spinner")?.remove();
  
  if (loading) {
    const s = document.createElement("span");
    s.className = "spinner";
    s.setAttribute("aria-hidden", "true");
    els.ingestBtn.prepend(s);
    els.ingestLabel.textContent = "Processing & Indexing…";
  } else {
    els.ingestLabel.textContent = "Ingest & Vectorize";
  }
}

// ==========================================
// Ingestion Action
// ==========================================
async function ingest() {
  if (selectedFiles.length === 0) return;
  setIngestLoading(true);
  els.ingestMeta.innerHTML = "";

  const form = new FormData();
  selectedFiles.forEach((file) => form.append("files", file));

  try {
    const res = await fetch("/ingest", { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    
    if (!res.ok) {
      throw new Error(data && data.detail ? data.detail : "Document ingestion failed.");
    }

    const fileCount = data.files_ingested.length;
    const chunkCount = data.total_chunks;
    totalIndexedFiles += fileCount;
    totalIndexedChunks += chunkCount;

    els.statFiles.textContent = totalIndexedFiles;
    els.statChunks.textContent = totalIndexedChunks;

    const plural = chunkCount === 1 ? "chunk" : "chunks";
    els.ingestMeta.innerHTML = `Successfully indexed <strong>${fileCount}</strong> file(s) into <strong>${chunkCount}</strong> ${plural}.`;
    toast(`Indexed ${fileCount} document(s) (${chunkCount} ${plural})`, "success");

    selectedFiles = [];
    renderFiles();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    setIngestLoading(false);
  }
}

// ==========================================
// Chat Logic & Rendering
// ==========================================
function scrollToBottom() {
  els.messages.scrollTo({
    top: els.messages.scrollHeight,
    behavior: "smooth"
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
    <span>Analyzing query &amp; retrieving context</span>
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
      Grounded in Documents (${count} citations)
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

  els.welcome.hidden = true;
  addUserMessage(question);
  els.composer.value = "";
  els.composer.style.height = "auto";
  els.askBtn.disabled = true;

  const typing = addTyping();

  try {
    const res = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
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

els.fileInput.addEventListener("change", () => {
  if (els.fileInput.files.length) {
    selectedFiles = [...selectedFiles, ...els.fileInput.files];
    renderFiles();
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
    selectedFiles = [...selectedFiles, ...files];
    renderFiles();
  }
});

els.ingestBtn.addEventListener("click", ingest);
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
checkHealth();
setInterval(checkHealth, 30000);
