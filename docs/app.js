/* -------------------------------------------------------
   HTML Viewer — app.js
   Handles file loading, preview, source viewing
   ------------------------------------------------------- */

(function () {
  'use strict';

  /* ---- State ---- */
  const state = {
    files: new Map(),      // filename → { name, type, content (text) | url (blob) }
    activeFile: null,
    viewMode: 'preview',   // 'preview' | 'source'
    blobUrls: [],
  };

  /* ---- DOM refs ---- */
  const $ = id => document.getElementById(id);
  const fileInput      = $('fileInput');
  const folderInput    = $('folderInput');
  const uploadSection  = $('uploadSection');
  const viewerSection  = $('viewerSection');
  const fileTabs       = $('fileTabs');
  const previewFrame   = $('previewFrame');
  const sourceViewer   = $('sourceViewer');
  const sourceCode     = $('sourceCode');
  const imageViewer    = $('imageViewer');
  const previewImage   = $('previewImage');
  const unsupportedFile = $('unsupportedFile');
  const toggleModeBtn  = $('toggleModeBtn');
  const modeIconPreview = $('modeIconPreview');
  const modeIconSource  = $('modeIconSource');
  const clearBtn       = $('clearBtn');
  const helpBtn        = $('helpBtn');
  const helpModal      = $('helpModal');
  const closeHelp      = $('closeHelp');

  /* ---- File type helpers ---- */
  const TEXT_TYPES  = ['html','htm','css','js','json','txt','svg','xml','md','ts','jsx','tsx','vue'];
  const IMAGE_TYPES = ['png','jpg','jpeg','gif','webp','bmp','ico','avif'];

  function ext(name) {
    return (name.split('.').pop() || '').toLowerCase();
  }

  function isText(name)  { return TEXT_TYPES.includes(ext(name));  }
  function isImage(name) { return IMAGE_TYPES.includes(ext(name)); }
  function isHtml(name)  { return ['html','htm'].includes(ext(name)); }

  // For folder picks, strip the root folder name so 'project/css/a.css' → 'css/a.css'
  function getFileKey(file) {
    const rel = file.webkitRelativePath;
    if (rel) {
      const slash = rel.indexOf('/');
      return slash !== -1 ? rel.slice(slash + 1) : rel;
    }
    return file.name;
  }

  /* ---- Read all selected files ---- */
  function readFiles(fileList) {
    const promises = Array.from(fileList).map(file => new Promise((resolve, reject) => {
      const key = getFileKey(file);
      if (isText(file.name)) {
        const reader = new FileReader();
        reader.onload  = e => resolve({ name: key, kind: 'text', content: e.target.result, mimeType: file.type });
        reader.onerror = reject;
        reader.readAsText(file);
      } else {
        // Binary: create blob URL
        const url = URL.createObjectURL(file);
        state.blobUrls.push(url);
        resolve({ name: key, kind: 'blob', url, mimeType: file.type });
      }
    }));

    Promise.all(promises).then(results => {
      results.forEach(f => state.files.set(f.name, f));

      // If no active file yet, pick first HTML or first file
      if (!state.activeFile || !state.files.has(state.activeFile)) {
        const htmlFile = results.find(f => isHtml(f.name));
        state.activeFile = htmlFile ? htmlFile.name : results[0]?.name;
      }

      renderTabs();
      renderActive();
      showViewer();
    }).catch(err => {
      alert('Error reading files: ' + err.message);
    });
  }

  /* ---- Build iframe srcdoc with inlined/replaced resources ---- */
  function buildPreviewHtml(htmlContent) {
    // Parse and rewrite relative URLs to blob/inline equivalents
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    function rewriteAttr(el, attr) {
      const val = el.getAttribute(attr);
      if (!val || val.startsWith('http') || val.startsWith('//') || val.startsWith('data:')) return;
      // Strip leading './' or '/'
      const key = val.replace(/^\.?\//, '');
      const file = state.files.get(key) || state.files.get(val);
      if (!file) return;
      if (file.kind === 'blob') {
        el.setAttribute(attr, file.url);
      } else if (file.kind === 'text') {
        // Inline CSS
        if (el.tagName === 'LINK' && el.rel === 'stylesheet') {
          const style = doc.createElement('style');
          style.textContent = file.content;
          el.replaceWith(style);
        } else if (el.tagName === 'SCRIPT') {
          el.removeAttribute('src');
          el.textContent = file.content;
        } else {
          el.setAttribute(attr, 'data:text/plain,' + encodeURIComponent(file.content));
        }
      }
    }

    doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => rewriteAttr(el, 'href'));
    doc.querySelectorAll('script[src]').forEach(el => rewriteAttr(el, 'src'));
    doc.querySelectorAll('img, video, audio').forEach(el => {
      rewriteAttr(el, 'src');
      if (el.hasAttribute('srcset')) {
        // Basic srcset rewrite (first candidate only)
        const first = el.getAttribute('srcset').split(',')[0].trim().split(/\s/)[0];
        el.setAttribute('srcset', '');
        const key = first.replace(/^\.?\//, '');
        const file = state.files.get(key) || state.files.get(first);
        if (file?.kind === 'blob') el.setAttribute('src', file.url);
      }
    });
    doc.querySelectorAll('[style]').forEach(el => {
      // Inline style url() references - simple regex replace
      el.setAttribute('style', el.getAttribute('style').replace(/url\(['"]?([^'")]+)['"]?\)/g, (_m, ref) => {
        const key = ref.replace(/^\.?\//, '');
        const file = state.files.get(key) || state.files.get(ref);
        return file?.kind === 'blob' ? `url(${file.url})` : `url(${ref})`;
      }));
    });

    // Inject File System Access API polyfill so pages using showOpenFilePicker,
    // showSaveFilePicker, or showDirectoryPicker work inside the sandboxed iframe.
    const polyfill = doc.createElement('script');
    polyfill.textContent = `(function(){
  function makeHandles(files){
    return Array.from(files).map(function(f){
      return { kind:'file', name:f.name, getFile:function(){ return Promise.resolve(f); } };
    });
  }
  function buildAccept(types){
    if(!types||!types.length) return '';
    return types.flatMap(function(t){ return Object.values(t.accept||{}); }).flat().join(',');
  }
  function pickViaInput(opts){
    return new Promise(function(resolve, reject){
      var input = document.createElement('input');
      input.type = 'file';
      if(opts && opts.multiple) input.multiple = true;
      var accept = buildAccept(opts && opts.types);
      if(accept) input.accept = accept;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function(){
        document.body.removeChild(input);
        if(!input.files || !input.files.length){
          reject(new DOMException('The user aborted a request.','AbortError')); return;
        }
        resolve(makeHandles(input.files));
      });
      input.addEventListener('cancel', function(){
        document.body.removeChild(input);
        reject(new DOMException('The user aborted a request.','AbortError'));
      });
      input.click();
    });
  }
  function dirPickViaInput(){
    return new Promise(function(resolve, reject){
      var input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function(){
        document.body.removeChild(input);
        if(!input.files || !input.files.length){
          reject(new DOMException('The user aborted a request.','AbortError')); return;
        }
        resolve({ kind:'directory', values: function(){ return makeHandles(input.files)[Symbol.iterator](); } });
      });
      input.addEventListener('cancel', function(){
        document.body.removeChild(input);
        reject(new DOMException('The user aborted a request.','AbortError'));
      });
      input.click();
    });
  }
  if(!window.showOpenFilePicker)    window.showOpenFilePicker    = function(o){ return pickViaInput(o); };
  if(!window.showSaveFilePicker)    window.showSaveFilePicker    = function(){ return Promise.reject(new DOMException('Not supported in viewer','NotSupportedError')); };
  if(!window.showDirectoryPicker)   window.showDirectoryPicker   = function(){ return dirPickViaInput(); };
})();`;
    (doc.head || doc.documentElement).prepend(polyfill);

    return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  }

  /* ---- Render the active file ---- */
  function renderActive() {
    const name = state.activeFile;
    if (!name) return;
    const file = state.files.get(name);
    if (!file) return;

    // Hide all panes first
    previewFrame.classList.add('hidden');
    sourceViewer.classList.add('hidden');
    imageViewer.classList.add('hidden');
    unsupportedFile.classList.add('hidden');

    if (state.viewMode === 'source' && file.kind === 'text') {
      // Source view
      sourceViewer.classList.remove('hidden');
      sourceCode.innerHTML = highlight(escapeHtml(file.content), ext(name));
    } else if (isImage(name)) {
      imageViewer.classList.remove('hidden');
      previewImage.src = file.kind === 'blob' ? file.url : 'data:' + file.mimeType + ';base64,' + btoa(file.content);
    } else if (isHtml(name) && file.kind === 'text') {
      previewFrame.classList.remove('hidden');
      const html = buildPreviewHtml(file.content);
      previewFrame.srcdoc = html;
    } else if (file.kind === 'text') {
      if (state.viewMode !== 'source') {
        // Non-HTML text files: always show source
        sourceViewer.classList.remove('hidden');
        sourceCode.innerHTML = highlight(escapeHtml(file.content), ext(name));
      }
    } else {
      unsupportedFile.classList.remove('hidden');
    }
  }

  /* ---- Render file tabs ---- */
  function renderTabs() {
    fileTabs.innerHTML = '';
    state.files.forEach((file, name) => {
      const btn = document.createElement('button');
      btn.className = 'file-tab' + (name === state.activeFile ? ' active' : '');
      const label = name.includes('/') ? name.split('/').pop() : name;
      btn.title = name; // full path on hover
      btn.innerHTML = `<span>${escapeHtml(label)}</span><span class="tab-ext">${ext(name)}</span>`;
      btn.addEventListener('click', () => {
        state.activeFile = name;
        renderTabs();
        renderActive();
      });
      fileTabs.appendChild(btn);
    });
  }

  /* ---- Show/hide sections ---- */
  function showViewer() {
    uploadSection.classList.add('hidden');
    viewerSection.classList.remove('hidden');
  }

  function showUpload() {
    uploadSection.classList.remove('hidden');
    viewerSection.classList.add('hidden');
  }

  /* ---- Toggle preview/source ---- */
  function toggleMode() {
    state.viewMode = state.viewMode === 'preview' ? 'source' : 'preview';
    modeIconPreview.classList.toggle('hidden', state.viewMode !== 'preview');
    modeIconSource.classList.toggle('hidden', state.viewMode !== 'source');
    renderActive();
  }

  /* ---- Clear all files ---- */
  function clearAll() {
    state.blobUrls.forEach(u => URL.revokeObjectURL(u));
    state.blobUrls.length = 0;
    state.files.clear();
    state.activeFile = null;
    state.viewMode = 'preview';
    previewFrame.srcdoc = '';
    fileTabs.innerHTML = '';
    fileInput.value = '';
    folderInput.value = '';
    showUpload();
  }

  /* ---- Simple HTML escape ---- */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- Minimal syntax highlighter ---- */
  function highlight(code, language) {
    if (language === 'html' || language === 'htm' || language === 'svg' || language === 'xml') {
      return code
        .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-cmt">$1</span>')
        .replace(/(&lt;\/?)([\w:-]+)/g, '<span class="tok-tag">$1$2</span>')
        .replace(/([\w:-]+)(=)(&quot;[^"]*&quot;)/g, '<span class="tok-attr">$1</span>$2<span class="tok-str">$3</span>');
    }
    if (language === 'css') {
      return code
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-cmt">$1</span>')
        .replace(/([.#]?[\w-]+)\s*\{/g, '<span class="tok-sel">$1</span> {')
        .replace(/([\w-]+)\s*:/g, '<span class="tok-prop">$1</span>:')
        .replace(/:\s*([^;{}\n]+)/g, ': <span class="tok-str">$1</span>');
    }
    if (language === 'js' || language === 'ts' || language === 'jsx' || language === 'tsx') {
      return code
        .replace(/(\/\/[^\n]*)/g, '<span class="tok-cmt">$1</span>')
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-cmt">$1</span>')
        .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|default|from|new|this|typeof|instanceof|async|await|try|catch|finally|throw|switch|case|break|continue|of|in)\b/g,
          '<span class="tok-kw">$1</span>')
        .replace(/(&quot;[^&]*&quot;|&#039;[^&]*&#039;|`[^`]*`)/g, '<span class="tok-str">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="tok-num">$1</span>');
    }
    if (language === 'json') {
      return code
        .replace(/(&quot;[^&]*&quot;)\s*:/g, '<span class="tok-prop">$1</span>:')
        .replace(/:\s*(&quot;[^&]*&quot;)/g, ': <span class="tok-str">$1</span>')
        .replace(/\b(true|false|null)\b/g, '<span class="tok-kw">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="tok-num">$1</span>');
    }
    return code; // plain
  }

  /* ---- Event listeners ---- */
  fileInput.addEventListener('change', e => {
    if (e.target.files.length) readFiles(e.target.files);
    e.target.value = '';
  });

  folderInput.addEventListener('change', e => {
    if (e.target.files.length) readFiles(e.target.files);
    e.target.value = '';
  });

  toggleModeBtn.addEventListener('click', toggleMode);
  clearBtn.addEventListener('click', clearAll);
  helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
  closeHelp.addEventListener('click', () => helpModal.classList.add('hidden'));
  helpModal.addEventListener('click', e => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
  });

  /* ---- Drag & drop for desktop fallback ---- */
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files);
  });

  /* ---- Keyboard shortcut: Escape closes modal ---- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') helpModal.classList.add('hidden');
    if ((e.ctrlKey || e.metaKey) && e.key === '\\') toggleMode();
  });

})();
