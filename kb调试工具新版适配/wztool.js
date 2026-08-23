// ================================================================
// KBM 配置防伪验证工具 脚本
// 与 app.js 中的防伪实现保持一致(签名:零宽字符隐藏编码 + 内容哈希)
// ================================================================

var KBM_MARK = '墨渊/cnboxing/5090dv2所有，由墨渊主写，请勿倒卖，此配置文件仅适用于部署';
var KBM_SIGN_VERSION = 'KBMSIGN1';

function showToast(msg, type) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var t = document.createElement('div');
    t.className = 'toast ' + (type || 'success');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function() {
        if (t.parentNode) t.parentNode.removeChild(t);
    }, 2600);
}

// FNV-1a 32 位哈希(与 app.js 相同)
function _wzHash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
    }
    return ('0000000' + h.toString(16)).slice(-8);
}

function _wzEncode(payload) {
    var bytes = encodeURIComponent(payload);
    var bits = '';
    for (var i = 0; i < bytes.length; i++) {
        var code = bytes.charCodeAt(i);
        for (var j = 7; j >= 0; j--) {
            bits += ((code >> j) & 1) ? '\u200C' : '\u200B';
        }
    }
    return '\u2060' + bits + '\u200D';
}

function _wzDecode(line) {
    var s = line.indexOf('\u2060');
    var e = line.indexOf('\u200D', s + 1);
    if (s === -1 || e === -1) return null;
    var bits = line.slice(s + 1, e);
    if (bits.length % 8 !== 0) return null;
    var bytes = '';
    for (var i = 0; i < bits.length; i += 8) {
        var byte = 0;
        for (var j = 0; j < 8; j++) {
            var c = bits.charAt(i + j);
            byte = (byte << 1) | (c === '\u200C' ? 1 : 0);
        }
        bytes += String.fromCharCode(byte);
    }
    try { return decodeURIComponent(bytes); } catch (err) { return null; }
}

function _wzStripMarker(content) {
    var arr = content.split('\n').filter(function(l) { return l.indexOf('\u2060') === -1; });
    while (arr.length && arr[arr.length - 1].trim() === '') arr.pop();
    return arr.join('\n');
}

function kbmSignContent(content) {
    var clean = _wzStripMarker(content);
    var hash = _wzHash32(KBM_MARK + '\n' + clean);
    var payload = KBM_SIGN_VERSION + '|' + KBM_MARK + '|' + hash;
    return clean + '\n#' + _wzEncode(payload);
}

// ================================================================
// 验证
// ================================================================
function wzVerify(text) {
    var lines = text.split('\n');
    var payload = null;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('\u2060') !== -1) {
            payload = _wzDecode(lines[i]);
            if (payload) break;
        }
    }
    if (!payload) {
        return { found: false };
    }
    var parts = payload.split('|');
    if (parts.length !== 3 || parts[0] !== KBM_SIGN_VERSION) {
        return { found: true, versionOk: false };
    }
    var marker = parts[1];
    var hash = parts[2];
    var clean = _wzStripMarker(text);
    var expectHash = _wzHash32(marker + '\n' + clean);
    return {
        found: true,
        versionOk: true,
        marker: marker,
        markerOk: marker === KBM_MARK,
        hashOk: hash === expectHash
    };
}

function wzVerifyFile(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        var r = wzVerify(text);
        var out = document.getElementById('wzResult');
        if (!r.found) {
            out.className = 'fit-result';
            out.innerHTML = '⚠️ <b>未发现防伪标识</b><br>该文件可能不是由 KBM 微调工具导出，或标识已被清除。';
            showToast('⚠️ 未发现防伪标识', 'warn');
        } else if (!r.versionOk) {
            out.className = 'fit-result';
            out.innerHTML = '❌ <b>标识格式异常</b><br>检测到零宽数据但版本不符，可能为非本工具写入的伪造数据。';
            showToast('❌ 标识格式异常', 'error');
        } else {
            var markerHtml = '<b>标识内容：</b><br><span style="color:var(--gold);">' + escHtmlLocal(r.marker) + '</span><br>';
            var markerCheck = r.markerOk ? '<span style="color:#6fbf73;">✅ 标识与官方一致</span>' : '<span style="color:#e06c6c;">❌ 标识内容与官方不符</span>';
            var hashCheck = r.hashOk ? '<span style="color:#6fbf73;">✅ 内容校验通过（未被篡改）</span>' : '<span style="color:#e06c6c;">❌ 内容已被修改（校验不通过）</span>';
            var verdict = (r.markerOk && r.hashOk)
                ? '<b style="color:#6fbf73; font-size:1.05rem;">✅ 结论：正版配置 · 未被篡改</b>'
                : '<b style="color:#e06c6c; font-size:1.05rem;">❌ 结论：伪造或被篡改</b>';
            out.className = 'fit-result';
            out.innerHTML = markerHtml + markerCheck + '<br>' + hashCheck + '<br><br>' + verdict;
            showToast((r.markerOk && r.hashOk) ? '✅ 验证通过：正版配置' : '❌ 验证不通过', (r.markerOk && r.hashOk) ? 'success' : 'error');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function escHtmlLocal(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ================================================================
// 写入 / 移除标识
// ================================================================
function _download(name, text) {
    var blob = new Blob([text], { type: 'text/yaml;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function wzEmbedFile(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var signed = kbmSignContent(e.target.result);
        _download('signed_' + file.name, signed);
        showToast('✅ 已写入防伪标识，下载 signed_' + file.name, 'success');
        event.target.value = '';
    };
    reader.readAsText(file);
}

function wzRemoveFile(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var clean = _wzStripMarker(e.target.result);
        _download('clean_' + file.name, clean);
        showToast('🗑 已移除防伪标识，下载 clean_' + file.name, 'success');
        event.target.value = '';
    };
    reader.readAsText(file);
}

window.wzVerifyFile = wzVerifyFile;
window.wzEmbedFile = wzEmbedFile;
window.wzRemoveFile = wzRemoveFile;
window.wzVerify = wzVerify;
window.kbmSignContent = kbmSignContent;
