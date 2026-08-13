const $ = (sel) => document.querySelector(sel);

const els = {
  status: $("#status"),
  statusText: $("#status-text"),
  dropzone: $("#dropzone"),
  fileInput: $("#file-input"),
  fileList: $("#file-list"),
  ingestBtn: $("#ingest-btn"),
  ingestLabel: $("#ingest-label"),
  emptyHint: $("#empty-hint"),
  ingestMeta: $("#ingest-meta"),
  messages: $("#messages"),
  welcome: $("#welcome"),
  suggestions: $("#suggestions"),
  composer: $("#ask-input"),
  askBtn: $("#ask-btn"),
  toast: $("#toast"),
};

let selectedFiles = [];
let toastTimer = null;

function toast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle("error", isError);
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3500);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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
  }
}

function renderFiles() {
  els.fileList.innerHTML = "";
  selectedFiles.forEach((file, idx) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "fname";
    name.textContent = file.name;
    name.title = file.name;

    const size = document.createElement("span");
    size.className = "fsize";
    size.textContent = formatSize(file.size);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove " + file.name);
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    remove.addEventListener("click", () => {
      selectedFiles.splice(idx, 1);
      renderFiles();
    });

    li.append(name, size, remove);
    els.fileList.appendChild(li);
  });

  const hasFiles = selectedFiles.length > 0;
  els.ingestBtn.disabled = !hasFiles;
  els.emptyHint.hidden = hasFiles;
}

async function checkHealth() {
  try {
    const res = await fetch("/health");
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    els.status.classList.add("ok");
    els.status.classList.remove("err");
    els.statusText.textContent = "Connected";
  } catch {
    els.status.classList.add("err");
    els.status.classList.remove("ok");
    els.statusText.textContent = "Server unreachable";
  }
}

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
      throw new Error(data && data.detail ? data.detail : "Upload failed");
    }
    const plural = data.total_chunks === 1 ? "chunk" : "chunks";
    els.ingestMeta.innerHTML =
      "<strong>" +
      data.files_ingested.length +
      "</strong> file(s) ingested &middot; <strong>" +
      data.total_chunks +
      "</strong> " +
      plural;
    toast("Ingested " + data.files_ingested.length + " file(s), " + data.total_chunks + " " + plural);
    selectedFiles = [];
    renderFiles();
  } catch (err) {
    toast(err.message, true);
  } finally {
    setIngestLoading(false);
  }
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function addTyping() {
  const msg = document.createElement("div");
  msg.className = "msg bot";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "AI";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const typing = document.createElement("div");
  typing.className = "typing";
  typing.innerHTML = "<span></span><span></span><span></span>";
  bubble.appendChild(typing);
  msg.append(avatar, bubble);
  els.messages.appendChild(msg);
  scrollToBottom();
  return msg;
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

function addBotMessage() {
  const msg = document.createElement("div");
  msg.className = "msg bot";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "AI";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  msg.append(avatar, bubble);
  els.messages.appendChild(msg);
  return { msg, bubble };
}

function addSourceGroup(sourceName, chunks) {
  const details = document.createElement("details");
  details.className = "source";

  const summary = document.createElement("summary");
  const name = document.createElement("span");
  name.className = "src-name";
  name.textContent = sourceName;
  name.title = sourceName;
  summary.appendChild(name);
  const count = document.createElement("span");
  count.className = "src-count";
  count.textContent = chunks.length === 1 ? "1 chunk" : chunks.length + " chunks";
  summary.appendChild(count);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "src-body";
  chunks.forEach((source) => {
    const block = document.createElement("div");
    block.className = "src-chunk";
    const content = document.createElement("div");
    content.className = "src-chunk-content";
    content.textContent = source.content;
    block.appendChild(content);
    body.appendChild(block);
  });
  details.appendChild(body);

  return details;
}

function renderAnswer(data) {
  const { msg, bubble } = addBotMessage();

  const badge = document.createElement("span");
  badge.className = data.used_retrieval ? "badge retrieval" : "badge direct";
  badge.textContent = data.used_retrieval ? "Answered from documents" : "Direct answer";
  bubble.appendChild(badge);

  const answer = document.createElement("div");
  answer.textContent = data.answer;
  bubble.appendChild(answer);

  if (data.reasoning) {
    const reason = document.createElement("p");
    reason.className = "reasoning";
    reason.textContent = data.reasoning;
    bubble.appendChild(reason);
  }

  if (data.sources && data.sources.length) {
    const sources = document.createElement("div");
    sources.className = "sources";
    const groups = data.sources.reduce((acc, s) => {
      (acc[s.source] = acc[s.source] || []).push(s);
      return acc;
    }, {});
    Object.keys(groups).forEach((name) =>
      sources.appendChild(addSourceGroup(name, groups[name]))
    );
    bubble.appendChild(sources);
  }

  scrollToBottom();
}

async function ask() {
  const question = els.composer.value.trim();
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
      throw new Error(data && data.detail ? data.detail : "Request failed");
    }
    renderAnswer(data);
  } catch (err) {
    toast(err.message, true);
  } finally {
    els.askBtn.disabled = false;
    els.composer.focus();
  }
}

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
  selectedFiles = [...els.fileInput.files];
  renderFiles();
  els.fileInput.value = "";
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
    selectedFiles = files;
    renderFiles();
  }
});

els.ingestBtn.addEventListener("click", ingest);

els.askBtn.addEventListener("click", ask);
els.composer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    ask();
  }
});
els.composer.addEventListener("input", autoGrow);

const suggestions = [
  "Summarize the key points of my documents",
  "What are the main topics covered?",
  "Hello, how can you help me?",
];
suggestions.forEach((text) => {
  const chip = document.createElement("button");
  chip.className = "chip";
  chip.type = "button";
  chip.textContent = text;
  chip.addEventListener("click", () => {
    els.composer.value = text;
    els.composer.focus();
  });
  els.suggestions.appendChild(chip);
});

checkHealth();
setInterval(checkHealth, 30000);
