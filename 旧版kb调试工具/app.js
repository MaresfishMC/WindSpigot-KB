// ================================================================
// KBM 微调工具 核心脚本
// ================================================================

// ================================================================
// 核心数据结构
// ================================================================
var THEORY = {
    "horizontal.ground": 0.5275653923541247,
    "horizontal.air": 0.50459547,
    "horizontal.sprint_extra": 0.3253521126760563,
    "vertical.ground": 0.226402482,
    "vertical.air": 0.201944941,
    "vertical.sprint_extra": 0.0,
    "packet.misplace.distance": 0.1,
    "packet.delay.ticks": 2,
    "projectile.horizontal_multiplier": 1.0,
    "projectile.vertical_multiplier": 1.0,
    "potion.horizontal_multiplier": 1.05,
    "potion.vertical_multiplier": 1.0,
    "potion.compensation_multiplier": 1.15,
    "hit_delay": 20,
    "y_limit.max_y_height": 0.675,
    "y_limit.vertical_kb_after_limit": 0.0
};
var fixedParams = {
    "projectile.enabled": false,
    "projectile.direction_override": false,
    "stop_sprint": true,
    "potion.enabled": false,
    "modern.cooldown_affects_kb": true,
    "modern.netherite_kb_resistance": true
};

// 二分调试各参数的默认搜索偏移
function getParamOffset(param) {
    if (param === 'packet.misplace.distance') return 0.02;
    if (param === 'vertical.sprint_extra') return 0.02;
    if (param === 'packet.delay.ticks') return 0.5;
    if (param === 'hit_delay') return 2;
    if (param.indexOf('y_limit.') === 0) return 0.05;
    if (param.indexOf('multiplier') !== -1) return 0.05;
    return 0.015;
}

// 二分调试某参数时自动启用其依赖的开关
function autoEnableForParam(param) {
    if (param === 'packet.misplace.distance') {
        extraConfig['packet.misplace.enabled'] = true;
        document.getElementById('packetMisplaceEnabled').checked = true;
    }
    if (param === 'packet.delay.ticks') {
        extraConfig['packet.delay.enabled'] = true;
        document.getElementById('packetDelayEnabled').checked = true;
    }
    if (param.indexOf('projectile.') === 0) {
        fixedParams['projectile.enabled'] = true;
    }
    if (param.indexOf('potion.') === 0) {
        fixedParams['potion.enabled'] = true;
    }
    if (param.indexOf('y_limit.') === 0) {
        yLimitSettings.enabled = true;
        document.getElementById('yLimitEnabled').checked = true;
    }
}

// 理论范围下限允许负数的参数(如超出后垂直击退 ≤ 0)
function paramAllowsNegative(param) {
    return param === 'y_limit.vertical_kb_after_limit';
}

var extraConfig = {
    "packet.misplace.enabled": false,
    "packet.misplace.distance": 0.1,
    "packet.delay.enabled": false,
    "packet.delay.ticks": 2
};

var yLimitSettings = {
    enabled: true,
    max_y_height: 0.675,
    vertical_kb_after_limit: 0.0
};

var independentMode = true;
var currentParam = 'horizontal.ground';
var schemeA = JSON.parse(JSON.stringify(THEORY));
var schemeB = JSON.parse(JSON.stringify(THEORY));
var paramsState = {};
var MIN_WIDTH = 1e-7;
var pendingChoice = null;
var pendingNote = '';
var presets = JSON.parse(localStorage.getItem('kbm_presets') || '{}');
var candidates = JSON.parse(localStorage.getItem('kbm_candidates') || '[]');

// ================================================================
// Toast 正反馈通知
// ================================================================
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

function saveCandidates() {
    try {
        localStorage.setItem('kbm_candidates', JSON.stringify(candidates));
    } catch (e) { /* 忽略存储错误 */ }
}

// ================================================================
// 自动保存与恢复
// ================================================================
function autoSaveState() {
    var state = {
        version: '1.5',
        timestamp: new Date().toISOString(),
        currentParam: currentParam,
        independentMode: independentMode,
        schemeA: schemeA,
        schemeB: schemeB,
        paramsState: paramsState,
        presets: presets,
        extraConfig: extraConfig,
        yLimitSettings: yLimitSettings
    };
    try {
        localStorage.setItem('kbm_auto_save', JSON.stringify(state));
    } catch (e) { /* 忽略存储错误 */ }
}

function autoRestoreState() {
    try {
        var raw = localStorage.getItem('kbm_auto_save');
        if (!raw) return false;
        var state = JSON.parse(raw);
        if (!state.version) return false;
        currentParam = state.currentParam || 'horizontal.ground';
        independentMode = (state.independentMode !== undefined) ? state.independentMode : true;
        if (state.schemeA) schemeA = state.schemeA;
        if (state.schemeB) schemeB = state.schemeB;
        if (state.paramsState) paramsState = state.paramsState;
        if (state.presets) {
            presets = state.presets;
            localStorage.setItem('kbm_presets', JSON.stringify(presets));
        }
        if (state.extraConfig) {
            extraConfig = state.extraConfig;
            document.getElementById('packetMisplaceEnabled').checked = extraConfig['packet.misplace.enabled'] || false;
            document.getElementById('packetMisplaceDistance').value = extraConfig['packet.misplace.distance'] || 0.1;
        }
        // 迁移:旧存档补全 delay 默认值
        if (extraConfig['packet.delay.enabled'] === undefined) extraConfig['packet.delay.enabled'] = false;
        if (extraConfig['packet.delay.ticks'] === undefined) extraConfig['packet.delay.ticks'] = 2;
        document.getElementById('packetDelayEnabled').checked = extraConfig['packet.delay.enabled'] || false;
        document.getElementById('packetDelayTicks').value = extraConfig['packet.delay.ticks'] || 2;
        if (state.yLimitSettings) {
            yLimitSettings = state.yLimitSettings;
            document.getElementById('yLimitEnabled').checked = yLimitSettings.enabled;
            document.getElementById('yLimitMaxHeight').value = yLimitSettings.max_y_height;
            document.getElementById('yLimitAfterKb').value = yLimitSettings.vertical_kb_after_limit;
        }
        // 迁移:确保新旧存档都包含全部可调参数(如 packet.misplace.distance)
        for (var k in THEORY) {
            if (typeof schemeA[k] !== 'number') schemeA[k] = THEORY[k];
            if (typeof schemeB[k] !== 'number') schemeB[k] = THEORY[k];
        }
        return true;
    } catch (e) {
        return false;
    }
}

function notifyChange() {
    autoSaveState();
}

function onExtraConfigChange() {
    extraConfig['packet.misplace.enabled'] = document.getElementById('packetMisplaceEnabled').checked;
    var dist = parseFloat(document.getElementById('packetMisplaceDistance').value);
    if (!isNaN(dist) && dist >= 0) {
        extraConfig['packet.misplace.distance'] = dist;
    }
    notifyChange();
}

function onDelayChange() {
    extraConfig['packet.delay.enabled'] = document.getElementById('packetDelayEnabled').checked;
    var ticks = parseInt(document.getElementById('packetDelayTicks').value, 10);
    if (!isNaN(ticks) && ticks >= 0) {
        extraConfig['packet.delay.ticks'] = ticks;
    }
    notifyChange();
}

function onYLimitChange() {
    yLimitSettings.enabled = document.getElementById('yLimitEnabled').checked;
    var maxH = parseFloat(document.getElementById('yLimitMaxHeight').value);
    if (!isNaN(maxH) && maxH >= 0) {
        yLimitSettings.max_y_height = maxH;
    }
    var afterKb = parseFloat(document.getElementById('yLimitAfterKb').value);
    if (!isNaN(afterKb)) {
        yLimitSettings.vertical_kb_after_limit = afterKb;
    }
    notifyChange();
}

// ================================================================
// 辅助函数
// ================================================================
function getParamState(param) {
    if (!paramsState[param]) {
        paramsState[param] = {
            low: 0.4,
            high: 0.6,
            mid: 0.5,
            iter: 0,
            initialized: false,
            history: []
        };
    }
    return paramsState[param];
}

function getCurrentState() {
    return getParamState(currentParam);
}

function getCurrentBoundaries() {
    var valA = schemeA[currentParam];
    var valB = schemeB[currentParam];
    var low = Math.min(valA, valB);
    var high = Math.max(valA, valB);
    return { low: low, high: high };
}

function setCurrentBoundaries(low, high) {
    var valA = schemeA[currentParam];
    var valB = schemeB[currentParam];
    if (valA <= valB) {
        schemeA[currentParam] = low;
        schemeB[currentParam] = high;
    } else {
        schemeA[currentParam] = high;
        schemeB[currentParam] = low;
    }
    document.getElementById('minVal').value = low;
    document.getElementById('maxVal').value = high;
    var state = getCurrentState();
    state.low = low;
    state.high = high;
    state.mid = (low + high) / 2;
    notifyChange();
}

function resetCurrentParamToTheory() {
    var theo = THEORY[currentParam];
    var offset = getParamOffset(currentParam);
    var rLow = paramAllowsNegative(currentParam) ? (theo - offset) : Math.max(0, theo - offset);
    var rHigh = theo + offset;
    schemeA[currentParam] = theo;
    schemeB[currentParam] = theo;
    var state = getCurrentState();
    state.initialized = false;
    state.low = rLow;
    state.high = rHigh;
    state.mid = (rLow + rHigh) / 2;
    state.iter = 0;
    state.history = [];
    document.getElementById('minVal').value = rLow;
    document.getElementById('maxVal').value = rHigh;
    renderAll();
    notifyChange();
}

// ================================================================
// 渲染函数
// ================================================================
function renderAll() {
    renderFixed();
    renderTest();
    renderHistory();
    renderPresets();
}

function renderFixed() {
    var container = document.getElementById('fixedConfigDisplay');
    if (!container) return;
    container.innerHTML = '';
    var current = currentParam;
    var keys = Object.keys(THEORY);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var vA = schemeA[k];
        var vB = schemeB[k];
        var displayVal = (k === current) ? vA + ' / ' + vB : vA;
        var tr = document.createElement('div');
        tr.style.display = 'table-row';
        var td1 = document.createElement('span');
        td1.style.display = 'table-cell';
        td1.style.padding = '2px 6px';
        td1.style.color = '#8a8aaa';
        td1.textContent = k;
        var td2 = document.createElement('span');
        td2.style.display = 'table-cell';
        td2.style.padding = '2px 6px';
        td2.style.textAlign = 'right';
        td2.style.fontFamily = 'monospace';
        td2.style.fontWeight = 'bold';
        var isLocked = independentMode && (k !== current);
        td2.style.color = isLocked ? '#5a5a7a' : '#e6b84d';
        if (isLocked) {
            td2.textContent = vA.toFixed(8);
        } else {
            td2.textContent = displayVal;
        }
        if (k === current) {
            tr.style.background = '#1a2a2a';
            td1.style.color = '#6fbf73';
        }
        tr.appendChild(td1);
        tr.appendChild(td2);
        container.appendChild(tr);
    }
    var extra = document.createElement('div');
    extra.style.display = 'table-row';
    var extraCell = document.createElement('span');
    extraCell.style.display = 'table-cell';
    extraCell.colSpan = 2;
    extraCell.style.color = '#555';
    extraCell.style.fontSize = '0.8rem';
    var fixedStr = '';
    fixedStr += 'packet.misplace.enabled: ' + extraConfig['packet.misplace.enabled'] + ' ';
    fixedStr += 'packet.misplace.distance: ' + extraConfig['packet.misplace.distance'] + ' ';
    fixedStr += 'packet.delay.enabled: ' + extraConfig['packet.delay.enabled'] + ' ';
    fixedStr += 'packet.delay.ticks: ' + extraConfig['packet.delay.ticks'] + ' ';
    fixedStr += 'y_limit: ' + JSON.stringify(yLimitSettings) + ' ';
    for (var f in fixedParams) {
        var val = fixedParams[f];
        if (typeof val === 'object') {
            val = JSON.stringify(val);
        }
        fixedStr += f + ': ' + val + ' ';
    }
    extraCell.textContent = fixedStr;
    extra.appendChild(extraCell);
    container.appendChild(extra);
}

function renderTest() {
    var param = currentParam;
    var state = getCurrentState();
    var isInit = state.initialized;

    if (!isInit) {
        document.getElementById('configADetails').innerHTML = '<div style="color:#666;">请点击“理论值”或“开始”</div>';
        document.getElementById('configBDetails').innerHTML = '<div style="color:#666;">请点击“理论值”或“开始”</div>';
        document.getElementById('currentParamName').textContent = param;
        document.getElementById('currentLow').textContent = '-';
        document.getElementById('currentHigh').textContent = '-';
        document.getElementById('currentBest').textContent = '-';
        document.getElementById('currentWidth').textContent = '-';
        document.getElementById('iterCount').textContent = '0';
        document.getElementById('btnA').disabled = true;
        document.getElementById('btnB').disabled = true;
        return;
    }

    var cfgA = makeConfigForScheme('A');
    var cfgB = makeConfigForScheme('B');

    var renderDetail = function(cfg, targetId) {
        var html = '';
        for (var k in cfg) {
            var v = cfg[k];
            var d;
            if (typeof v === 'number') d = v.toFixed(8);
            else if (typeof v === 'boolean') d = v ? 'true' : 'false';
            else if (typeof v === 'object') d = JSON.stringify(v);
            else d = v;
            var star = (k === param) ? '★ ' : '';
            html += '<div class="detail"><span>' + star + k + '</span><span class="val">' + d + '</span></div>';
        }
        document.getElementById(targetId).innerHTML = html;
    };
    renderDetail(cfgA, 'configADetails');
    renderDetail(cfgB, 'configBDetails');

    var boundaries = getCurrentBoundaries();
    document.getElementById('currentParamName').textContent = param;
    document.getElementById('currentLow').textContent = boundaries.low.toFixed(6);
    document.getElementById('currentHigh').textContent = boundaries.high.toFixed(6);
    var mid = (boundaries.low + boundaries.high) / 2;
    document.getElementById('currentBest').textContent = mid.toFixed(6);
    var width = boundaries.high - boundaries.low;
    document.getElementById('currentWidth').textContent = width.toFixed(6);
    document.getElementById('iterCount').textContent = state.iter;

    if (width < MIN_WIDTH) {
        document.getElementById('btnA').disabled = true;
        document.getElementById('btnB').disabled = true;
        document.getElementById('currentWidth').textContent = width.toFixed(6) + ' ✅ 已收敛';
    } else {
        document.getElementById('btnA').disabled = false;
        document.getElementById('btnB').disabled = false;
    }
}

function makeConfigForScheme(scheme) {
    var cfg = {};
    var values = (scheme === 'A') ? schemeA : schemeB;
    for (var k in THEORY) {
        if (independentMode && k !== currentParam) {
            cfg[k] = THEORY[k];
        } else {
            cfg[k] = values[k];
        }
    }
    for (var f in fixedParams) {
        cfg[f] = fixedParams[f];
    }
    // 正在二分调试 y_limit 数值时使用方案值;正在调试其任意子项时自动启用
    cfg['y_limit'] = {
        enabled: (currentParam.indexOf('y_limit.') === 0) ? true : yLimitSettings.enabled,
        max_y_height: (currentParam === 'y_limit.max_y_height') ? values['y_limit.max_y_height'] : yLimitSettings.max_y_height,
        vertical_kb_after_limit: (currentParam === 'y_limit.vertical_kb_after_limit') ? values['y_limit.vertical_kb_after_limit'] : yLimitSettings.vertical_kb_after_limit
    };
    // 调试乘数类参数时自动启用对应开关
    if (currentParam.indexOf('projectile.') === 0) cfg['projectile.enabled'] = true;
    if (currentParam.indexOf('potion.') === 0) cfg['potion.enabled'] = true;
    cfg['packet.misplace.enabled'] = extraConfig['packet.misplace.enabled'];
    // 正在二分调试 misplace.distance 时,使用方案各自的 A/B 值(由上面的 THEORY 循环写入)
    if (currentParam !== 'packet.misplace.distance') {
        cfg['packet.misplace.distance'] = extraConfig['packet.misplace.distance'];
    }
    cfg['packet.delay.enabled'] = (currentParam === 'packet.delay.ticks') ? true : extraConfig['packet.delay.enabled'];
    if (currentParam !== 'packet.delay.ticks') {
        cfg['packet.delay.ticks'] = extraConfig['packet.delay.ticks'];
    }
    return cfg;
}

// ================================================================
// 历史管理（弹窗内展示 + 可拖动）
// ================================================================
function addHistory(action, desc, note) {
    var state = getCurrentState();
    var boundaries = getCurrentBoundaries();
    var entry = {
        action: action,
        desc: desc,
        low: boundaries.low,
        high: boundaries.high,
        mid: (boundaries.low + boundaries.high) / 2,
        iter: state.iter,
        time: new Date().toLocaleTimeString(),
        note: note || ''
    };
    state.history.unshift(entry);
    if (state.history.length > 50) state.history.pop();
    renderHistory();
    notifyChange();
}

function renderHistory() {
    var state = getCurrentState();
    var log = document.getElementById('historyLog');
    if (!log) return;
    if (state.history.length === 0) {
        log.innerHTML = '<span style="color:var(--text2);">暂无记录</span>';
        return;
    }
    var html = '';
    for (var i = 0; i < state.history.length; i++) {
        var e = state.history[i];
        html += '<div class="history-item" onclick="restoreHistory(' + i + ')">' +
            '<span class="time">[' + escHtml(e.time) + ']</span> ' +
            '<span class="action">' + escHtml(e.action) + '</span> ' +
            '<span class="desc">' + escHtml(e.desc) + '</span>' +
            (e.note ? '<span class="note">📝 ' + escHtml(e.note) + '</span>' : '') +
            '<button class="restore" onclick="event.stopPropagation(); restoreHistory(' + i + ')">↩</button>' +
            '</div>';
    }
    log.innerHTML = html;
}

function restoreHistory(index) {
    var state = getCurrentState();
    var e = state.history[index];
    if (!e) return;
    var boundaries = getCurrentBoundaries();
    if (Math.abs(boundaries.low - e.low) < 1e-12 &&
        Math.abs(boundaries.high - e.high) < 1e-12 &&
        state.iter === e.iter) {
        showToast('⚠️ 当前已是该状态，无需恢复', 'warn');
        return;
    }
    setCurrentBoundaries(e.low, e.high);
    state.iter = e.iter;
    state.initialized = true;
    renderAll();
    notifyChange();
    showToast('✅ 已恢复到 [' + e.time + '] 的状态', 'success');
}

// 撤销上一步（正反馈）
function undoLast() {
    var state = getCurrentState();
    if (state.history.length === 0) {
        showToast('⚠️ 没有可撤销的操作', 'warn');
        return;
    }
    var undone = state.history[0];
    var prev = state.history[1];
    state.history.shift();
    if (!prev) {
        resetCurrentParamToTheory();
        showToast('✅ 已撤销“' + undone.action + '”，回到初始状态', 'success');
        return;
    }
    setCurrentBoundaries(prev.low, prev.high);
    state.iter = prev.iter;
    state.initialized = true;
    renderAll();
    notifyChange();
    showToast('✅ 已撤销“' + undone.action + '”，当前范围 [' + prev.low.toFixed(4) + ', ' + prev.high.toFixed(4) + ']', 'success');
}

function clearHistory() {
    var state = getCurrentState();
    if (state.history.length === 0) {
        showToast('⚠️ 历史记录已为空', 'warn');
        return;
    }
    if (!confirm('确认清空当前参数的全部历史记录？')) return;
    state.history = [];
    renderHistory();
    notifyChange();
    showToast('🗑 历史记录已清空', 'success');
}

// ================================================================
// 历史弹窗（可拖动）
// ================================================================
var historyDrag = null;

function openHistoryModal() {
    var overlay = document.getElementById('historyModal');
    var dialog = document.getElementById('historyDialog');
    overlay.style.display = 'block';
    var w = dialog.offsetWidth, h = dialog.offsetHeight;
    dialog.style.left = Math.max(10, (window.innerWidth - w) / 2) + 'px';
    dialog.style.top = Math.max(10, (window.innerHeight - h) / 2) + 'px';
    renderHistory();
}

function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
}

function startHistoryDrag(e) {
    if (e.target && e.target.closest && e.target.closest('.close-btn')) return;
    var dialog = document.getElementById('historyDialog');
    var rect = dialog.getBoundingClientRect();
    historyDrag = {
        dx: e.clientX - rect.left,
        dy: e.clientY - rect.top
    };
    document.addEventListener('mousemove', onHistoryDrag);
    document.addEventListener('mouseup', endHistoryDrag);
    e.preventDefault();
}

function onHistoryDrag(e) {
    if (!historyDrag) return;
    var dialog = document.getElementById('historyDialog');
    var x = e.clientX - historyDrag.dx;
    var y = e.clientY - historyDrag.dy;
    x = Math.max(0, Math.min(x, window.innerWidth - 80));
    y = Math.max(0, Math.min(y, window.innerHeight - 40));
    dialog.style.left = x + 'px';
    dialog.style.top = y + 'px';
}

function endHistoryDrag() {
    historyDrag = null;
    document.removeEventListener('mousemove', onHistoryDrag);
    document.removeEventListener('mouseup', endHistoryDrag);
}

// ================================================================
// 参数切换
// ================================================================
function onParamChange() {
    var newParam = document.getElementById('paramSelect').value;
    if (newParam === currentParam) return;
    currentParam = newParam;
    var state = getCurrentState();
    var boundaries = getCurrentBoundaries();
    document.getElementById('minVal').value = boundaries.low;
    document.getElementById('maxVal').value = boundaries.high;
    if (state.initialized) {
        renderAll();
    } else {
        document.getElementById('configADetails').innerHTML = '<div style="color:#666;">尚未调整此参数，请点击“理论值”或“开始”</div>';
        document.getElementById('configBDetails').innerHTML = '<div style="color:#666;">尚未调整此参数，请点击“理论值”或“开始”</div>';
        document.getElementById('currentLow').textContent = '-';
        document.getElementById('currentHigh').textContent = '-';
        document.getElementById('currentBest').textContent = '-';
        document.getElementById('currentWidth').textContent = '-';
        document.getElementById('iterCount').textContent = '0';
        document.getElementById('btnA').disabled = true;
        document.getElementById('btnB').disabled = true;
        renderFixed();
        renderHistory();
    }
    notifyChange();
    if (newParam === 'packet.misplace.distance' || newParam === 'packet.delay.ticks' ||
        newParam.indexOf('projectile.') === 0 || newParam.indexOf('potion.') === 0 ||
        newParam.indexOf('y_limit.') === 0) {
        setTimeout(function() {
            showToast('💡 点“理论值/开始”会自动启用对应功能开关', 'warn');
        }, 300);
    }
}

// ================================================================
// 操作函数（二分法 + 感受评分）
// ================================================================
function loadTheory() {
    var param = currentParam;
    var theo = THEORY[param];
    if (theo === undefined) { showToast('⚠️ 无理论值', 'warn'); return; }
    var offset = getParamOffset(param);
    var low = paramAllowsNegative(param) ? (theo - offset) : Math.max(0, theo - offset);
    var high = theo + offset;
    schemeA[param] = low;
    schemeB[param] = high;
    autoEnableForParam(param);
    var state = getCurrentState();
    state.iter = 0;
    state.initialized = true;
    document.getElementById('minVal').value = low;
    document.getElementById('maxVal').value = high;
    addHistory('📐 理论值', param + '=' + theo.toFixed(6) + ' 范围[' + low.toFixed(4) + ', ' + high.toFixed(4) + ']');
    renderAll();
    enableButtons(true);
    notifyChange();
    showToast('✅ 已载入理论值范围 [' + low.toFixed(4) + ', ' + high.toFixed(4) + ']', 'success');
}

function initBisect() {
    var param = currentParam;
    var low = parseFloat(document.getElementById('minVal').value);
    var high = parseFloat(document.getElementById('maxVal').value);
    if (isNaN(low) || isNaN(high)) { showToast('⚠️ 请填写有效的上下限数值', 'warn'); return; }
    if (low < 0 && !paramAllowsNegative(param)) { showToast('⚠️ 击退参数不能为负数，下限已调整为 0', 'warn'); low = 0; document.getElementById('minVal').value = 0; }
    if (low >= high) { showToast('⚠️ 下限必须小于上限', 'warn'); return; }
    setCurrentBoundaries(low, high);
    autoEnableForParam(param);
    if (param === 'packet.misplace.distance' || param === 'packet.delay.ticks' ||
        param.indexOf('projectile.') === 0 || param.indexOf('potion.') === 0 ||
        param.indexOf('y_limit.') === 0) {
        showToast('💡 已自动启用对应功能开关（调试该参数时需保持开启）', 'warn');
    }
    var state = getCurrentState();
    state.iter = 0;
    state.initialized = true;
    addHistory('初始化', '范围[' + low.toFixed(4) + ', ' + high.toFixed(4) + ']');
    renderAll();
    enableButtons(true);
    notifyChange();
    showToast('✅ 已开始调试，范围 [' + low.toFixed(4) + ', ' + high.toFixed(4) + ']', 'success');
}

function chooseA() {
    var state = getCurrentState();
    if (!state.initialized) { showToast('⚠️ 请先点击“开始”或“理论值”初始化', 'warn'); return; }
    var boundaries = getCurrentBoundaries();
    if ((boundaries.high - boundaries.low) < MIN_WIDTH) {
        showToast('⚠️ 已收敛，无需继续二分', 'warn');
        return;
    }
    pendingChoice = 'A';
    var noteEl = document.getElementById('noteA');
    pendingNote = noteEl ? noteEl.value.trim() : '';
    setQuickScore('A', 'mild');
    openScoreModal('方案 A（下限）更接近？请为两个方案打分：');
}

function chooseB() {
    var state = getCurrentState();
    if (!state.initialized) { showToast('⚠️ 请先点击“开始”或“理论值”初始化', 'warn'); return; }
    var boundaries = getCurrentBoundaries();
    if ((boundaries.high - boundaries.low) < MIN_WIDTH) {
        showToast('⚠️ 已收敛，无需继续二分', 'warn');
        return;
    }
    pendingChoice = 'B';
    var noteEl = document.getElementById('noteB');
    pendingNote = noteEl ? noteEl.value.trim() : '';
    setQuickScore('B', 'mild');
    openScoreModal('方案 B（上限）更接近？请为两个方案打分：');
}

// ================================================================
// 感受评分弹窗
// ================================================================
function openScoreModal(msg) {
    document.getElementById('modalMessage').textContent = msg;
    document.getElementById('confidenceModal').style.display = 'flex';
    scoreChanged();
}

function closeScoreModal() {
    document.getElementById('confidenceModal').style.display = 'none';
    pendingChoice = null;
}

function setQuickScore(kind, level) {
    var map = {
        A: { mild: [7, 5], strong: [9, 3] },
        B: { mild: [5, 7], strong: [3, 9] }
    };
    var v = map[kind][level];
    document.getElementById('scoreA').value = v[0];
    document.getElementById('scoreB').value = v[1];
    scoreChanged();
}

function scoreChanged() {
    var a = parseFloat(document.getElementById('scoreA').value);
    var b = parseFloat(document.getElementById('scoreB').value);
    document.getElementById('scoreAVal').textContent = a;
    document.getElementById('scoreBVal').textContent = b;
    var hint = '';
    if (a === b) {
        hint = '评分相同：确认后将按默认步长(50%)向所选方案收缩';
    } else {
        var d = Math.abs(a - b);
        var s = Math.min(d / 10, 1);
        var f = Math.max(0.02, 0.5 - 0.48 * Math.pow(s, 1.4));
        var dir = (a > b) ? '方案A（下限）' : '方案B（上限）';
        hint = '区间将向' + dir + '收缩至 ' + (f * 100).toFixed(0) + '%';
    }
    document.getElementById('scoreHint').textContent = hint;
}

function confirmScore() {
    var choice = pendingChoice;
    if (!choice) { closeScoreModal(); return; }
    var a = parseFloat(document.getElementById('scoreA').value);
    var b = parseFloat(document.getElementById('scoreB').value);
    var state = getCurrentState();
    var boundaries = getCurrentBoundaries();
    var width = boundaries.high - boundaries.low;
    var dir, factor;
    if (a === b) {
        dir = choice;
        factor = 0.5;
    } else if (a > b) {
        dir = 'A';
        var s1 = Math.min((a - b) / 10, 1);
        factor = Math.max(0.02, 0.5 - 0.48 * Math.pow(s1, 1.4));
    } else {
        dir = 'B';
        var s2 = Math.min((b - a) / 10, 1);
        factor = Math.max(0.02, 0.5 - 0.48 * Math.pow(s2, 1.4));
    }

    var oldLow = boundaries.low, oldHigh = boundaries.high;
    var newLow, newHigh;
    if (dir === 'A') {
        newLow = oldLow;
        newHigh = oldLow + factor * width;
    } else {
        newLow = oldHigh - factor * width;
        newHigh = oldHigh;
    }
    if ((newHigh - newLow) < MIN_WIDTH) {
        if (dir === 'A') newHigh = newLow + MIN_WIDTH;
        else newLow = newHigh - MIN_WIDTH;
    }

    setCurrentBoundaries(newLow, newHigh);
    state.iter++;
    var note = pendingNote || '';
    addHistory('选择' + dir + '(评分A=' + a + '/B=' + b + ')', '范围[' + newLow.toFixed(4) + ', ' + newHigh.toFixed(4) + ']', note);
    var noteAEl = document.getElementById('noteA');
    var noteBEl = document.getElementById('noteB');
    if (noteAEl) noteAEl.value = '';
    if (noteBEl) noteBEl.value = '';
    pendingNote = '';
    renderAll();
    if ((newHigh - newLow) < MIN_WIDTH) {
        enableButtons(false);
    } else {
        enableButtons(true);
    }
    notifyChange();
    closeScoreModal();
    showToast('✅ 区间已收缩至 [' + newLow.toFixed(4) + ', ' + newHigh.toFixed(4) + ']', 'success');
    if ((newHigh - newLow) < 0.001) {
        setTimeout(function() {
            showToast('💡 区间已很小，可点击“📌 保留”保存候选值，便于分模块调试', 'warn');
        }, 600);
    }
}

function enableButtons(en) {
    var btns = document.querySelectorAll('#panel-classic .choice-buttons button');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = !en;
    var boundaries = getCurrentBoundaries();
    if ((boundaries.high - boundaries.low) < MIN_WIDTH) {
        document.getElementById('btnA').disabled = true;
        document.getElementById('btnB').disabled = true;
    }
}

function resetCurrentParam() {
    if (!confirm('确认重置当前参数 "' + currentParam + '" 的所有调整记录？')) return;
    resetCurrentParamToTheory();
    enableButtons(false);
    renderAll();
    notifyChange();
    showToast('✅ 参数 ' + currentParam + ' 已重置', 'success');
}

// ================================================================
// 保留候选（相似 KB 待后续调整 / 分模块调试准备）
// ================================================================
function keepCandidate() {
    var state = getCurrentState();
    if (!state.initialized) {
        showToast('⚠️ 请先初始化当前参数', 'warn');
        return;
    }
    var b = getCurrentBoundaries();
    var mid = (b.low + b.high) / 2;
    var note = prompt('给该候选加个备注（可选）：\n例：平地起跳、疾跑状态、水下…', '');
    if (note === null) return;
    candidates.unshift({
        param: currentParam,
        value: mid,
        low: b.low,
        high: b.high,
        width: b.high - b.low,
        iter: state.iter,
        time: new Date().toLocaleString(),
        note: (note || '').trim()
    });
    if (candidates.length > 100) candidates.pop();
    saveCandidates();
    showToast('✅ 已保留候选 ' + currentParam + ' = ' + mid.toFixed(6), 'success');
    setTimeout(function() {
        showToast('💡 可在侧边栏「🗂 候选对比」中查看并组合导出', 'warn');
    }, 500);
}

function loadCandidate(index) {
    var c = candidates[index];
    if (!c) return;
    var v = Number(c.value);
    if (isNaN(v)) return;
    currentParam = c.param;
    document.getElementById('paramSelect').value = c.param;
    var half = Math.max(Number(c.width || 0) / 2, 0.002);
    var low = Math.max(0, v - half);
    var high = v + half;
    schemeA[currentParam] = low;
    schemeB[currentParam] = high;
    var state = getCurrentState();
    state.low = low;
    state.high = high;
    state.mid = v;
    state.initialized = true;
    state.iter = 0;
    state.history = [];
    document.getElementById('minVal').value = low;
    document.getElementById('maxVal').value = high;
    if (c.param === 'packet.misplace.distance') {
        extraConfig['packet.misplace.enabled'] = true;
        document.getElementById('packetMisplaceEnabled').checked = true;
    }
    if (c.param === 'packet.delay.ticks') {
        extraConfig['packet.delay.enabled'] = true;
        document.getElementById('packetDelayEnabled').checked = true;
    }
    addHistory('📌 载入候选', c.param + '=' + v.toFixed(6) + ' 范围[' + low.toFixed(4) + ', ' + high.toFixed(4) + ']');
    renderAll();
    enableButtons(true);
    notifyChange();
    showToast('✅ 已载入候选 ' + c.param + ' = ' + v.toFixed(6), 'success');
}

function editCandidateNote(index) {
    var c = candidates[index];
    if (!c) return;
    var note = prompt('修改备注：', c.note || '');
    if (note === null) return;
    c.note = note.trim();
    saveCandidates();
    renderCompare();
    showToast('✅ 备注已更新', 'success');
}

function deleteCandidate(index) {
    var c = candidates[index];
    if (!c) return;
    if (!confirm('删除候选 ' + c.param + ' = ' + Number(c.value).toFixed(6) + ' ？')) return;
    candidates.splice(index, 1);
    saveCandidates();
    renderCompare();
    showToast('🗑 候选已删除', 'success');
}

function exportCandidates() {
    if (candidates.length === 0) {
        showToast('⚠️ 暂无候选可导出', 'warn');
        return;
    }
    var blob = new Blob([JSON.stringify(candidates, null, 2)], { type: 'application/json;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'kbm_candidates.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showToast('✅ 候选已导出为 kbm_candidates.json', 'success');
}

function importCandidates(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var arr = JSON.parse(e.target.result);
            if (!Array.isArray(arr)) throw new Error('格式错误');
            candidates = arr.concat(candidates);
            if (candidates.length > 100) candidates = candidates.slice(0, 100);
            saveCandidates();
            renderCompare();
            showToast('✅ 已导入 ' + arr.length + ' 条候选', 'success');
        } catch (err) {
            alert('导入候选失败：' + err.message);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ================================================================
// 多文件全局导入
// ================================================================
function importGlobalConfig(event) {
    var files = event.target.files;
    if (!files || files.length === 0) return;
    var fileList = Array.from(files);
    var pendingFiles = fileList.slice();
    var total = pendingFiles.length;

    function processNext() {
        if (pendingFiles.length === 0) {
            renderAll();
            notifyChange();
            showToast('✅ 所有文件导入完成（共 ' + total + ' 个）', 'success');
            return;
        }
        var file = pendingFiles.shift();
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var values = parseYaml(e.target.result);
                if (Object.keys(values).length === 0) {
                    alert('文件 "' + file.name + '" 未解析到有效的KBM参数，已跳过。');
                    processNext();
                    return;
                }
                var lowerName = file.name.toLowerCase();
                var baseName = lowerName.replace(/\.[^.]+$/, '');
                var target = null;
                var hasA = /\b(a|lower|min|下限)\b/.test(baseName);
                var hasB = /\b(b|upper|high|max|上限)\b/.test(baseName);
                if (hasA && !hasB) {
                    target = 'A';
                } else if (hasB && !hasA) {
                    target = 'B';
                } else {
                    var choice = confirm('文件 "' + file.name + '" 无法自动识别分配到哪个方案。\n点击"确定"分配到方案A，点击"取消"分配到方案B。');
                    target = choice ? 'A' : 'B';
                }
                var targetObj = (target === 'A') ? schemeA : schemeB;
                for (var k in values) {
                    if (k === 'packet.misplace.enabled' || k === 'packet.misplace.distance' ||
                        k === 'packet.delay.enabled' || k === 'packet.delay.ticks') {
                        extraConfig[k] = values[k];
                    } else if (k === 'y_limit.enabled' || k === 'y_limit.max_y_height' || k === 'y_limit.vertical_kb_after_limit') {
                        if (k === 'y_limit.enabled') yLimitSettings.enabled = values[k];
                        if (k === 'y_limit.max_y_height') yLimitSettings.max_y_height = values[k];
                        if (k === 'y_limit.vertical_kb_after_limit') yLimitSettings.vertical_kb_after_limit = values[k];
                    } else {
                        targetObj[k] = values[k];
                    }
                }
                document.getElementById('packetMisplaceEnabled').checked = extraConfig['packet.misplace.enabled'] || false;
                document.getElementById('packetMisplaceDistance').value = extraConfig['packet.misplace.distance'] || 0.1;
                document.getElementById('packetDelayEnabled').checked = extraConfig['packet.delay.enabled'] || false;
                document.getElementById('packetDelayTicks').value = extraConfig['packet.delay.ticks'] || 2;
                document.getElementById('yLimitEnabled').checked = yLimitSettings.enabled;
                document.getElementById('yLimitMaxHeight').value = yLimitSettings.max_y_height;
                document.getElementById('yLimitAfterKb').value = yLimitSettings.vertical_kb_after_limit;

                var presetName = file.name.replace(/\.[^.]+$/, '') + '_' + target;
                if (presets[presetName]) {
                    var ts = new Date().getTime().toString().slice(-6);
                    presetName = presetName + '_' + ts;
                }
                presets[presetName] = JSON.parse(JSON.stringify(values));
                localStorage.setItem('kbm_presets', JSON.stringify(presets));
                addHistory('📂 全局导入', '文件: ' + file.name + ' -> 方案' + target + ' (预设: ' + presetName + ')');
                var boundaries = getCurrentBoundaries();
                document.getElementById('minVal').value = boundaries.low;
                document.getElementById('maxVal').value = boundaries.high;
                var state = getCurrentState();
                state.initialized = true;
                renderAll();
                renderPresets();
                notifyChange();
            } catch (err) {
                alert('解析文件 "' + file.name + '" 失败：' + err.message);
            }
            processNext();
        };
        reader.readAsText(file);
    }
    processNext();
    event.target.value = '';
}

// ================================================================
// 导入 YAML 到指定方案（单个文件）
// ================================================================
function importYamlToScheme(event, scheme) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var values = parseYaml(e.target.result);
            if (Object.keys(values).length === 0) {
                alert('未解析到有效的KBM参数值，请检查YAML格式。');
                return;
            }
            var target = (scheme === 'A') ? schemeA : schemeB;
            for (var k in values) {
                if (k === 'packet.misplace.enabled' || k === 'packet.misplace.distance' ||
                    k === 'packet.delay.enabled' || k === 'packet.delay.ticks') {
                    extraConfig[k] = values[k];
                } else if (k === 'y_limit.enabled' || k === 'y_limit.max_y_height' || k === 'y_limit.vertical_kb_after_limit') {
                    if (k === 'y_limit.enabled') yLimitSettings.enabled = values[k];
                    if (k === 'y_limit.max_y_height') yLimitSettings.max_y_height = values[k];
                    if (k === 'y_limit.vertical_kb_after_limit') yLimitSettings.vertical_kb_after_limit = values[k];
                } else {
                    target[k] = values[k];
                }
            }
            document.getElementById('packetMisplaceEnabled').checked = extraConfig['packet.misplace.enabled'] || false;
            document.getElementById('packetMisplaceDistance').value = extraConfig['packet.misplace.distance'] || 0.1;
            document.getElementById('packetDelayEnabled').checked = extraConfig['packet.delay.enabled'] || false;
            document.getElementById('packetDelayTicks').value = extraConfig['packet.delay.ticks'] || 2;
            document.getElementById('yLimitEnabled').checked = yLimitSettings.enabled;
            document.getElementById('yLimitMaxHeight').value = yLimitSettings.max_y_height;
            document.getElementById('yLimitAfterKb').value = yLimitSettings.vertical_kb_after_limit;

            var presetName = file.name.replace(/\.[^.]+$/, '') + '_' + scheme;
            if (presets[presetName]) {
                var ts = new Date().getTime().toString().slice(-6);
                presetName = presetName + '_' + ts;
            }
            presets[presetName] = JSON.parse(JSON.stringify(values));
            localStorage.setItem('kbm_presets', JSON.stringify(presets));
            var boundaries = getCurrentBoundaries();
            document.getElementById('minVal').value = boundaries.low;
            document.getElementById('maxVal').value = boundaries.high;
            var state = getCurrentState();
            state.initialized = true;
            renderAll();
            renderPresets();
            addHistory('📂 从YAML导入方案' + scheme, '文件: ' + (file.name || '未知') + ' -> 预设: ' + presetName);
            event.target.value = '';
            showToast('✅ 方案 ' + scheme + ' 已更新，并保存为预设 "' + presetName + '"', 'success');
            notifyChange();
        } catch (err) {
            alert('导入失败：' + err.message);
        }
    };
    reader.readAsText(file);
}

// ================================================================
// 解析YAML
// ================================================================
function parseYaml(content) {
    var lines = content.split('\n');
    var values = {};
    var currentSection = '';
    var inMisplace = false;
    var inYLimit = false;
    var inDelay = false;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line === '' || line.startsWith('#')) continue;
        if (line.endsWith(':') && !line.includes(' ')) {
            currentSection = line.slice(0, -1);
            if (currentSection === 'packet') {
                inMisplace = false;
                inYLimit = false;
                inDelay = false;
            } else if (currentSection === 'misplace') {
                inMisplace = true;
                inYLimit = false;
                inDelay = false;
            } else if (currentSection === 'delay') {
                inDelay = true;
                inMisplace = false;
                inYLimit = false;
            } else if (currentSection === 'y_limit') {
                inYLimit = true;
                inMisplace = false;
                inDelay = false;
            } else {
                inMisplace = false;
                inYLimit = false;
                inDelay = false;
            }
            continue;
        }
        var match = line.match(/^(\w+):\s*(.*)$/);
        if (match) {
            var key = match[1];
            var val = match[2].trim();
            var boolVal = null;
            if (val === 'true') boolVal = true;
            else if (val === 'false') boolVal = false;
            var numVal = parseFloat(val);
            var finalVal = (boolVal !== null) ? boolVal : (isNaN(numVal) ? val : numVal);

            var fullKey = '';
            if (inMisplace && (key === 'enabled' || key === 'distance')) {
                fullKey = 'packet.misplace.' + key;
            } else if (inDelay && (key === 'enabled' || key === 'ticks')) {
                fullKey = 'packet.delay.' + key;
            } else if (inYLimit && (key === 'enabled' || key === 'max_y_height' || key === 'vertical_kb_after_limit')) {
                fullKey = 'y_limit.' + key;
            } else {
                fullKey = currentSection ? (currentSection + '.' + key) : key;
            }
            var validKeys = Object.keys(THEORY).concat(['packet.misplace.enabled', 'packet.delay.enabled', 'y_limit.enabled']);
            if (validKeys.includes(fullKey)) {
                values[fullKey] = finalVal;
            }
        }
    }
    return values;
}

// ================================================================
// 预设管理
// ================================================================
function saveSchemeAsPreset(scheme) {
    var name = prompt('请输入预设名称（用于保存方案 ' + scheme + '）：');
    if (!name || name.trim() === '') return;
    name = name.trim();
    var target = (scheme === 'A') ? schemeA : schemeB;
    var data = JSON.parse(JSON.stringify(target));
    data['packet.misplace.enabled'] = extraConfig['packet.misplace.enabled'];
    data['packet.misplace.distance'] = extraConfig['packet.misplace.distance'];
    data['packet.delay.enabled'] = extraConfig['packet.delay.enabled'];
    data['packet.delay.ticks'] = extraConfig['packet.delay.ticks'];
    data['y_limit.enabled'] = yLimitSettings.enabled;
    data['y_limit.max_y_height'] = yLimitSettings.max_y_height;
    data['y_limit.vertical_kb_after_limit'] = yLimitSettings.vertical_kb_after_limit;
    presets[name] = data;
    localStorage.setItem('kbm_presets', JSON.stringify(presets));
    renderPresets();
    addHistory('💾 保存方案' + scheme, '预设: ' + name);
    showToast('✅ 方案 ' + scheme + ' 已保存为预设 "' + name + '"', 'success');
    notifyChange();
}

function loadPresetToScheme(scheme) {
    var selectId = (scheme === 'A') ? 'presetSelectA' : 'presetSelectB';
    var sel = document.getElementById(selectId);
    var name = sel.value;
    if (!name) {
        showToast('⚠️ 请先选择一个预设', 'warn');
        return;
    }
    applyPresetToScheme(name, scheme);
}

function applyPresetToScheme(name, scheme) {
    var data = presets[name];
    if (!data) {
        alert('预设数据不存在');
        return;
    }
    var target = (scheme === 'A') ? schemeA : schemeB;
    for (var k in data) {
        if (k === 'packet.misplace.enabled' || k === 'packet.misplace.distance' ||
            k === 'packet.delay.enabled' || k === 'packet.delay.ticks') {
            extraConfig[k] = data[k];
        } else if (k === 'y_limit.enabled' || k === 'y_limit.max_y_height' || k === 'y_limit.vertical_kb_after_limit') {
            if (k === 'y_limit.enabled') yLimitSettings.enabled = data[k];
            if (k === 'y_limit.max_y_height') yLimitSettings.max_y_height = data[k];
            if (k === 'y_limit.vertical_kb_after_limit') yLimitSettings.vertical_kb_after_limit = data[k];
        } else {
            target[k] = data[k];
        }
    }
    document.getElementById('packetMisplaceEnabled').checked = extraConfig['packet.misplace.enabled'] || false;
    document.getElementById('packetMisplaceDistance').value = extraConfig['packet.misplace.distance'] || 0.1;
    document.getElementById('packetDelayEnabled').checked = extraConfig['packet.delay.enabled'] || false;
    document.getElementById('packetDelayTicks').value = extraConfig['packet.delay.ticks'] || 2;
    document.getElementById('yLimitEnabled').checked = yLimitSettings.enabled;
    document.getElementById('yLimitMaxHeight').value = yLimitSettings.max_y_height;
    document.getElementById('yLimitAfterKb').value = yLimitSettings.vertical_kb_after_limit;

    var boundaries = getCurrentBoundaries();
    document.getElementById('minVal').value = boundaries.low;
    document.getElementById('maxVal').value = boundaries.high;
    var state = getCurrentState();
    state.initialized = true;
    renderAll();
    addHistory('📂 加载预设到方案' + scheme, name);
    showToast('✅ 预设 "' + name + '" 已加载到方案 ' + scheme, 'success');
    notifyChange();
}

function loadPresetToSchemeFromTag(name, scheme) {
    var data = presets[name];
    if (!data) {
        alert('预设数据不存在');
        return;
    }
    applyPresetToScheme(name, scheme);
    var selectId = (scheme === 'A') ? 'presetSelectA' : 'presetSelectB';
    var sel = document.getElementById(selectId);
    if (sel) sel.value = name;
}

function savePreset() {
    var name = document.getElementById('presetName').value.trim();
    if (!name) {
        showToast('⚠️ 请输入预设名称', 'warn');
        return;
    }
    var data = JSON.parse(JSON.stringify(schemeA));
    data['packet.misplace.enabled'] = extraConfig['packet.misplace.enabled'];
    data['packet.misplace.distance'] = extraConfig['packet.misplace.distance'];
    data['packet.delay.enabled'] = extraConfig['packet.delay.enabled'];
    data['packet.delay.ticks'] = extraConfig['packet.delay.ticks'];
    data['y_limit.enabled'] = yLimitSettings.enabled;
    data['y_limit.max_y_height'] = yLimitSettings.max_y_height;
    data['y_limit.vertical_kb_after_limit'] = yLimitSettings.vertical_kb_after_limit;
    presets[name] = data;
    localStorage.setItem('kbm_presets', JSON.stringify(presets));
    renderPresets();
    document.getElementById('presetName').value = '';
    addHistory('📌 保存预设', name);
    showToast('✅ 预设 "' + name + '" 已保存', 'success');
    notifyChange();
}

function loadPreset(name) {
    if (!confirm('加载预设 "' + name + '" 将覆盖方案A的值，确认？')) return;
    var data = presets[name];
    if (!data) return;
    for (var k in data) {
        if (k === 'packet.misplace.enabled' || k === 'packet.misplace.distance' ||
            k === 'packet.delay.enabled' || k === 'packet.delay.ticks') {
            extraConfig[k] = data[k];
        } else if (k === 'y_limit.enabled' || k === 'y_limit.max_y_height' || k === 'y_limit.vertical_kb_after_limit') {
            if (k === 'y_limit.enabled') yLimitSettings.enabled = data[k];
            if (k === 'y_limit.max_y_height') yLimitSettings.max_y_height = data[k];
            if (k === 'y_limit.vertical_kb_after_limit') yLimitSettings.vertical_kb_after_limit = data[k];
        } else {
            schemeA[k] = data[k];
        }
    }
    document.getElementById('packetMisplaceEnabled').checked = extraConfig['packet.misplace.enabled'] || false;
    document.getElementById('packetMisplaceDistance').value = extraConfig['packet.misplace.distance'] || 0.1;
    document.getElementById('packetDelayEnabled').checked = extraConfig['packet.delay.enabled'] || false;
    document.getElementById('packetDelayTicks').value = extraConfig['packet.delay.ticks'] || 2;
    document.getElementById('yLimitEnabled').checked = yLimitSettings.enabled;
    document.getElementById('yLimitMaxHeight').value = yLimitSettings.max_y_height;
    document.getElementById('yLimitAfterKb').value = yLimitSettings.vertical_kb_after_limit;

    var boundaries = getCurrentBoundaries();
    document.getElementById('minVal').value = boundaries.low;
    document.getElementById('maxVal').value = boundaries.high;
    var state = getCurrentState();
    state.initialized = true;
    renderAll();
    addHistory('📌 加载预设到A', name);
    showToast('✅ 预设 "' + name + '" 已加载到方案A', 'success');
    notifyChange();
}

function deletePreset(name) {
    if (!confirm('删除预设 "' + name + '" ？')) return;
    delete presets[name];
    localStorage.setItem('kbm_presets', JSON.stringify(presets));
    renderPresets();
    showToast('🗑 预设 "' + name + '" 已删除', 'success');
    notifyChange();
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escJs(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderPresets() {
    var container = document.getElementById('presetList');
    if (!container) return;
    var names = Object.keys(presets);
    if (names.length === 0) {
        container.innerHTML = '<span style="color:var(--text2); font-size:0.85rem;">暂无预设</span>';
    } else {
        var html = '';
        for (var i = 0; i < names.length; i++) {
            var n = names[i];
            var nEsc = escHtml(n);
            var nJs = escJs(n);
            html += '<span class="preset-tag">' +
                nEsc +
                ' <button class="load-a" onclick="loadPresetToSchemeFromTag(\'' + nJs + '\',\'A\')">→A</button>' +
                ' <button class="load-b" onclick="loadPresetToSchemeFromTag(\'' + nJs + '\',\'B\')">→B</button>' +
                ' <span class="del" onclick="event.stopPropagation(); deletePreset(\'' + nJs + '\')">×</span>' +
                '</span>';
        }
        container.innerHTML = html;
    }

    var selects = ['presetSelectA', 'presetSelectB'];
    for (var j = 0; j < selects.length; j++) {
        var sel = document.getElementById(selects[j]);
        if (!sel) continue;
        var currentVal = sel.value;
        sel.innerHTML = '';
        var opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '选择预设...';
        sel.appendChild(opt);
        for (var k = 0; k < names.length; k++) {
            var opt2 = document.createElement('option');
            opt2.value = names[k];
            opt2.textContent = names[k];
            sel.appendChild(opt2);
        }
        if (currentVal && names.includes(currentVal)) {
            sel.value = currentVal;
        }
    }
}

// ================================================================
// 折叠区
// ================================================================
function toggleAdvanced() {
    var content = document.getElementById('advancedContent');
    var arrow = document.getElementById('advancedArrow');
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        arrow.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        arrow.textContent = '▶';
    }
}

function toggleFeedback() {
    var content = document.getElementById('feedbackContent');
    var arrow = document.getElementById('feedbackArrow');
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        arrow.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        arrow.textContent = '▶';
    }
}

// ================================================================
// 单界面模块切换(经典 / 黄金分割 / 插值 / 候选对比)
// ================================================================
function showModule(name) {
    var panels = { classic: 'panel-classic', golden: 'panel-golden', fit: 'panel-fit', compare: 'panel-compare' };
    if (!panels[name]) name = 'classic';
    var keys = Object.keys(panels);
    for (var i = 0; i < keys.length; i++) {
        var el = document.getElementById(panels[keys[i]]);
        if (el) {
            if (keys[i] === name) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
        var link = document.getElementById('sideModule' + keys[i].charAt(0).toUpperCase() + keys[i].slice(1));
        if (link) {
            if (keys[i] === name) link.classList.add('active');
            else link.classList.remove('active');
        }
    }
    var ctrl = document.getElementById('sidebarClassicControls');
    if (ctrl) ctrl.style.display = (name === 'classic') ? '' : 'none';
    var twoCol = document.getElementById('moduleTwoCol');
    if (twoCol) {
        if (name === 'golden' || name === 'fit') twoCol.classList.add('two-panel');
        else twoCol.classList.remove('two-panel');
    }
    if (name === 'compare') renderCompare();
    try { localStorage.setItem('kbm_module', name); } catch (e) { /* 忽略 */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================================================================
// 经典调试弹出悬浮窗(可拖动)
// ================================================================
var classicDrag = null;

function popupClassic() {
    var inline = document.getElementById('classicInline');
    var body = document.getElementById('classicPopupBody');
    var popup = document.getElementById('classicPopup');
    var bar = document.getElementById('classicDockedBar');
    while (inline.firstChild) {
        body.appendChild(inline.firstChild);
    }
    inline.style.display = 'none';
    if (bar) bar.style.display = 'block';
    var popBtn = document.getElementById('popupClassicBtn');
    if (popBtn) popBtn.style.display = 'none';
    popup.style.display = 'flex';
    popup.style.left = '';
    popup.style.top = '';
    popup.style.right = '';
    popup.style.bottom = '';
    showToast('🗔 调试窗口已弹出，可拖动标题栏移动', 'success');
}

function dockClassic() {
    var inline = document.getElementById('classicInline');
    var body = document.getElementById('classicPopupBody');
    var popup = document.getElementById('classicPopup');
    var bar = document.getElementById('classicDockedBar');
    while (body.firstChild) {
        inline.appendChild(body.firstChild);
    }
    popup.style.display = 'none';
    inline.style.display = '';
    if (bar) bar.style.display = 'none';
    var popBtn = document.getElementById('popupClassicBtn');
    if (popBtn) popBtn.style.display = '';
    showToast('⤓ 调试窗口已还原到页面', 'success');
}

function startClassicDrag(e) {
    if (e.target && e.target.closest && e.target.closest('.close-btn')) return;
    var w = document.getElementById('classicPopup');
    var rect = w.getBoundingClientRect();
    classicDrag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    document.addEventListener('mousemove', onClassicDrag);
    document.addEventListener('mouseup', endClassicDrag);
    e.preventDefault();
}

function onClassicDrag(e) {
    if (!classicDrag) return;
    var w = document.getElementById('classicPopup');
    var x = e.clientX - classicDrag.dx;
    var y = e.clientY - classicDrag.dy;
    x = Math.max(-w.offsetWidth + 120, Math.min(x, window.innerWidth - 120));
    y = Math.max(0, Math.min(y, window.innerHeight - 60));
    w.style.right = 'auto';
    w.style.bottom = 'auto';
    w.style.left = x + 'px';
    w.style.top = y + 'px';
}

function endClassicDrag() {
    classicDrag = null;
    document.removeEventListener('mousemove', onClassicDrag);
    document.removeEventListener('mouseup', endClassicDrag);
}

// ================================================================
// 模块2: 黄金分割搜索 (0.618 法)
// ================================================================
var GOLD = (Math.sqrt(5) - 1) / 2;
var GS = { param: 'horizontal.ground', low: 0.4, high: 0.6, iter: 0, history: [] };

function gsSave() {
    try { localStorage.setItem('kbm_golden_state', JSON.stringify(GS)); } catch (e) {}
}

function gsRender() {
    var width = GS.high - GS.low;
    document.getElementById('gsParamName').textContent = GS.param;
    document.getElementById('gsLow').textContent = GS.low.toFixed(6);
    document.getElementById('gsHigh').textContent = GS.high.toFixed(6);
    document.getElementById('gsBest').textContent = ((GS.low + GS.high) / 2).toFixed(6);
    document.getElementById('gsWidth').textContent = width.toFixed(6);
    document.getElementById('gsIter').textContent = GS.iter;
    var converged = width < 1e-7;
    document.getElementById('gsBtnA').disabled = converged;
    document.getElementById('gsBtnB').disabled = converged;
    var log = document.getElementById('gsHistory');
    if (GS.history.length === 0) {
        log.innerHTML = '<span style="color:var(--text2);">暂无记录</span>';
    } else {
        var html = '';
        for (var i = 0; i < GS.history.length; i++) {
            var e = GS.history[i];
            html += '<div class="history-item"><span class="time">[' + escHtml(e.time) + ']</span> ' +
                '<span class="action">' + escHtml(e.action) + '</span> ' +
                '<span class="desc">' + escHtml(e.desc) + '</span></div>';
        }
        log.innerHTML = html;
    }
}

function gsTheory() {
    var theo = THEORY[GS.param];
    if (theo === undefined) {
        showToast('⚠️ 该参数无理论值', 'warn');
        return;
    }
    var offset = getParamOffset(GS.param);
    GS.low = paramAllowsNegative(GS.param) ? (theo - offset) : Math.max(0, theo - offset);
    GS.high = theo + offset;
    GS.iter = 0;
    document.getElementById('gsMin').value = GS.low;
    document.getElementById('gsMax').value = GS.high;
    gsHistoryPush('📐 理论值', GS.param + '=' + theo.toFixed(6) + ' 范围[' + GS.low.toFixed(4) + ', ' + GS.high.toFixed(4) + ']');
    gsRender();
    gsSave();
    showToast('✅ 已载入理论值范围', 'success');
}

function gsStart() {
    var low = parseFloat(document.getElementById('gsMin').value);
    var high = parseFloat(document.getElementById('gsMax').value);
    if (isNaN(low) || isNaN(high)) {
        showToast('⚠️ 请填写有效的上下限数值', 'warn');
        return;
    }
    if (low < 0 && !paramAllowsNegative(GS.param)) {
        low = 0;
        document.getElementById('gsMin').value = 0;
        showToast('⚠️ 击退参数不能为负数，下限已调整为 0', 'warn');
    }
    if (low >= high) {
        showToast('⚠️ 下限必须小于上限', 'warn');
        return;
    }
    GS.low = low;
    GS.high = high;
    GS.iter = 0;
    GS.history = [];
    gsHistoryPush('🚀 开始', '范围[' + low.toFixed(4) + ', ' + high.toFixed(4) + ']');
    gsRender();
    gsSave();
    showToast('✅ 已开始黄金分割搜索', 'success');
}

function gsHistoryPush(action, desc) {
    GS.history.unshift({
        action: action,
        desc: desc,
        time: new Date().toLocaleTimeString(),
        low: GS.low,
        high: GS.high,
        iter: GS.iter
    });
    if (GS.history.length > 50) GS.history.pop();
}

function gsChoose(side) {
    var width = GS.high - GS.low;
    if (width < 1e-7) {
        showToast('⚠️ 已收敛', 'warn');
        return;
    }
    var level = document.getElementById('gsLevel').value;
    var factor = (level === 'mild') ? GOLD : (level === 'medium') ? GOLD * GOLD : GOLD * GOLD * GOLD;
    var oldLow = GS.low, oldHigh = GS.high;
    var levelName = { mild: '略微', medium: '中等', strong: '明显' }[level];
    if (side === 'A') {
        GS.high = oldLow + factor * width;
    } else {
        GS.low = oldHigh - factor * width;
    }
    GS.iter++;
    gsHistoryPush('选择' + side + '(' + levelName + ')', '范围[' + GS.low.toFixed(4) + ', ' + GS.high.toFixed(4) + ']');
    gsRender();
    gsSave();
    showToast('✅ 区间已收缩至 [' + GS.low.toFixed(4) + ', ' + GS.high.toFixed(4) + ']（收缩率 ' + (factor * 100).toFixed(1) + '%）', 'success');
}

function gsUndo() {
    if (GS.history.length === 0) {
        showToast('⚠️ 没有可撤销的操作', 'warn');
        return;
    }
    var undone = GS.history[0];
    GS.history.shift();
    var prev = GS.history[0];
    if (prev && typeof prev.low === 'number' && typeof prev.high === 'number') {
        GS.low = prev.low;
        GS.high = prev.high;
        GS.iter = prev.iter || 0;
        document.getElementById('gsMin').value = GS.low;
        document.getElementById('gsMax').value = GS.high;
        showToast('✅ 已撤销“' + undone.action + '”，当前范围 [' + GS.low.toFixed(4) + ', ' + GS.high.toFixed(4) + ']', 'success');
    } else {
        GS.low = 0.4;
        GS.high = 0.6;
        GS.iter = 0;
        document.getElementById('gsMin').value = 0.4;
        document.getElementById('gsMax').value = 0.6;
        showToast('✅ 已撤销“' + undone.action + '”，回到初始范围 [0.4000, 0.6000]', 'success');
    }
    gsRender();
    gsSave();
}

function gsReset() {
    if (!confirm('重置黄金分割搜索状态？')) return;
    GS.low = 0.4;
    GS.high = 0.6;
    GS.iter = 0;
    GS.history = [];
    document.getElementById('gsMin').value = 0.4;
    document.getElementById('gsMax').value = 0.6;
    gsRender();
    gsSave();
    showToast('✅ 已重置', 'success');
}

function gsCopyBest() {
    var best = (GS.low + GS.high) / 2;
    copyText(GS.param + ' = ' + best.toFixed(8));
}

function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showToast('✅ 已复制到剪贴板', 'success');
        }, function() {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('✅ 已复制到剪贴板', 'success'); }
    catch (e) { showToast('⚠️ 复制失败，请手动复制', 'warn'); }
    document.body.removeChild(ta);
}

// ================================================================
// 模块3: 实测插值(线性 / 抛物线)
// ================================================================
function fitFillExample() {
    document.getElementById('fitK1').value = '0.510';
    document.getElementById('fitD1').value = '2.45';
    document.getElementById('fitK2').value = '0.528';
    document.getElementById('fitD2').value = '2.62';
    document.getElementById('fitK3').value = '0.545';
    document.getElementById('fitD3').value = '2.71';
    document.getElementById('fitTarget').value = '2.62';
    showToast('💡 已填入示例数据（h.ground 水平位移）', 'success');
}

function fitCompute() {
    var k1 = parseFloat(document.getElementById('fitK1').value);
    var k2 = parseFloat(document.getElementById('fitK2').value);
    var k3 = parseFloat(document.getElementById('fitK3').value);
    var d1 = parseFloat(document.getElementById('fitD1').value);
    var d2 = parseFloat(document.getElementById('fitD2').value);
    var d3 = parseFloat(document.getElementById('fitD3').value);
    var target = parseFloat(document.getElementById('fitTarget').value);
    var mode = document.getElementById('fitMode').value;
    var out = document.getElementById('fitResult');

    if ([k1, k2, k3, d1, d2, d3].some(isNaN)) {
        out.innerHTML = '⚠️ 请完整填写 3 组参数值与实测数据。';
        return;
    }
    if (new Set([k1, k2, k3]).size < 3) {
        out.innerHTML = '⚠️ 3 个参数值必须互不相同。';
        return;
    }
    if (isNaN(target)) {
        out.innerHTML = '⚠️ 请填写目标位移（格）。';
        return;
    }

    var ks = [k1, k2, k3];
    var ds = [d1, d2, d3];
    var kMin = Math.min(k1, k2, k3);
    var kMax = Math.max(k1, k2, k3);
    var html = '';

    if (mode === 'linear') {
        var fit = fitLinear(ks, ds);
        html += '线性拟合：位移 D = <b>' + fmt(fit.m) + '</b> × k ' + (fit.c >= 0 ? '+ ' : '- ') + '<b>' + fmt(Math.abs(fit.c)) + '</b><br>';
        if (Math.abs(fit.m) < 1e-12) {
            html += '⚠️ 斜率接近 0，拟合无意义，请检查数据。';
        } else {
            var kStar = (target - fit.c) / fit.m;
            html += '目标位移 ' + target + ' 格 → 参数 k* = <b>' + kStar.toFixed(8) + '</b><br>';
            html += suggestRange(kStar, kMin, kMax);
        }
    } else {
        var q = fitQuadratic(ks, ds);
        if (Math.abs(q.a) < 1e-12) {
            var fitL = fitLinear(ks, ds);
            html += '⚠️ 三点几乎共线，抛物线退化，已自动改用线性拟合。<br>';
            html += '线性拟合：位移 D = <b>' + fmt(fitL.m) + '</b> × k ' + (fitL.c >= 0 ? '+ ' : '- ') + '<b>' + fmt(Math.abs(fitL.c)) + '</b><br>';
            if (Math.abs(fitL.m) < 1e-12) {
                html += '⚠️ 斜率接近 0，拟合无意义，请检查数据。';
            } else {
                var kStarL = (target - fitL.c) / fitL.m;
                html += '目标位移 ' + target + ' 格 → 参数 k* = <b>' + kStarL.toFixed(8) + '</b><br>';
                html += suggestRange(kStarL, kMin, kMax);
            }
        } else {
            html += '抛物线拟合：D = <b>' + fmt(q.a) + '</b> k² ' + (q.b >= 0 ? '+ ' : '- ') + '<b>' + fmt(Math.abs(q.b)) + '</b> k ' + (q.c >= 0 ? '+ ' : '- ') + '<b>' + fmt(Math.abs(q.c)) + '</b><br>';
            var disc = q.b * q.b - 4 * q.a * (q.c - target);
            var roots = [];
            if (disc >= 0) {
                var sq = Math.sqrt(disc);
                roots.push((-q.b + sq) / (2 * q.a));
                roots.push((-q.b - sq) / (2 * q.a));
            }
            var kStar2;
            if (roots.length > 0) {
                var candidates2 = roots.filter(function(r) { return r >= kMin - 0.05 && r <= kMax + 0.05; });
                if (candidates2.length > 0) {
                    kStar2 = candidates2.reduce(function(a, b) { return (Math.abs(a - kMin) + Math.abs(a - kMax)) < (Math.abs(b - kMin) + Math.abs(b - kMax)) ? a : b; });
                } else {
                    kStar2 = -q.b / (2 * q.a);
                    html += '⚠️ 方程无区间内实根，已给出最接近的顶点值。<br>';
                }
            } else {
                kStar2 = -q.b / (2 * q.a);
                html += '⚠️ 无实数解，已给出抛物线顶点作为参考。<br>';
            }
            html += '目标位移 ' + target + ' 格 → 参数 k* = <b>' + kStar2.toFixed(8) + '</b><br>';
            html += suggestRange(kStar2, kMin, kMax);
        }
    }
    out.innerHTML = html;
    showToast('✅ 拟合完成', 'success');
}

function fmt(x) {
    return (Math.abs(x) >= 0.001) ? x.toFixed(6) : x.toExponential(3);
}

function suggestRange(kStar, kMin, kMax) {
    var half = Math.max((kMax - kMin) * 0.2, 0.003);
    var low = Math.max(0, kStar - half);
    var high = kStar + half;
    return '💡 建议在经典模块中以此为范围二分：<b>' + low.toFixed(6) + '</b> ~ <b>' + high.toFixed(6) + '</b>（点击下方复制）' +
        '<br><button class="btn btn-info" style="height:30px; margin-top:6px;" onclick="copyText(\'' + low.toFixed(6) + ',' + high.toFixed(6) + '\')">📋 复制建议范围</button>';
}

function fitLinear(ks, ds) {
    var n = ks.length;
    var sK = 0, sD = 0, sKD = 0, sKK = 0;
    for (var i = 0; i < n; i++) {
        sK += ks[i];
        sD += ds[i];
        sKD += ks[i] * ds[i];
        sKK += ks[i] * ks[i];
    }
    var denom = n * sKK - sK * sK;
    if (Math.abs(denom) < 1e-15) return { m: 0, c: sD / n };
    var m = (n * sKD - sK * sD) / denom;
    var c = (sD - m * sK) / n;
    return { m: m, c: c };
}

function fitQuadratic(ks, ds) {
    var k1 = ks[0], k2 = ks[1], k3 = ks[2];
    var d1 = ds[0], d2 = ds[1], d3 = ds[2];
    var det = (k1 - k2) * (k1 - k3) * (k2 - k3);
    if (Math.abs(det) < 1e-15) return { a: 0, b: 0, c: 0 };
    var a = (d1 * (k2 - k3) + d2 * (k3 - k1) + d3 * (k1 - k2)) / det;
    var b = -(d1 * (k2 * k2 - k3 * k3) + d2 * (k3 * k3 - k1 * k1) + d3 * (k1 * k1 - k2 * k2)) / det;
    var c = (d1 * k2 * k3 * (k2 - k3) + d2 * k3 * k1 * (k3 - k1) + d3 * k1 * k2 * (k1 - k2)) / det;
    return { a: a, b: b, c: c };
}

// ================================================================
// 模块4: 候选对比组合导出(分模块调试)
// ================================================================
function renderCompare() {
    var list = candidates;
    var box = document.getElementById('cmpBody');
    if (!box) return;
    if (list.length === 0) {
        box.innerHTML = '<tr><td colspan="4" style="color:var(--text2);">暂无候选。请先在经典模块调试并点击“📌 保留当前推荐值”。</td></tr>';
        document.getElementById('cmpPreview').value = '';
        return;
    }
    var html = '';
    var seen = {};
    for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var v = Number(c.value);
        if (isNaN(v)) continue;
        var param = c.param;
        var auto = !seen[param];
        seen[param] = true;
        var safeName = String(param).replace(/[^a-z0-9_]/g, '_');
        html += '<tr>' +
            '<td><input type="radio" name="cmpParam_' + safeName + '" value="' + i + '"' + (auto ? ' checked' : '') + ' onchange="cmpPreview()"></td>' +
            '<td>' + escHtml(param) + '</td>' +
            '<td class="val">' + v.toFixed(6) + '</td>' +
            '<td>' + escHtml(c.note || '') + (c.note ? '<br>' : '') +
            '<span style="color:var(--text2); font-size:0.75rem;">' + escHtml(c.time || '') + ' · 宽度' + Number(c.width || 0).toFixed(4) + '</span>' +
            '<br><button class="btn btn-danger" style="height:24px; font-size:0.7rem; padding:0 8px; margin-top:4px;" onclick="cmpDelete(' + i + ')">删除</button></td>' +
            '</tr>';
    }
    box.innerHTML = html;
    cmpPreview();
}

function cmpDelete(index) {
    var c = candidates[index];
    if (!c) return;
    if (!confirm('删除该候选？')) return;
    candidates.splice(index, 1);
    saveCandidates();
    renderCompare();
    showToast('🗑 候选已删除', 'success');
}

function cmpSelected() {
    var sel = {};
    var radios = document.querySelectorAll('input[type="radio"][name^="cmpParam_"]');
    for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) {
            var idx = parseInt(radios[i].value, 10);
            var c = candidates[idx];
            if (c) sel[c.param] = c;
        }
    }
    return sel;
}

function cmpPreview() {
    var sel = cmpSelected();
    var keys = Object.keys(sel);
    if (keys.length === 0) {
        document.getElementById('cmpPreview').value = '# 暂无选择';
        return;
    }
    var lines = [];
    lines.push('# KBM 组合配置（来自保留候选）');
    lines.push('# 生成时间: ' + new Date().toLocaleString());
    lines.push('');
    var inHorizontal = false, inVertical = false, inPacket = false, inMisplace = false, inDelay = false;
    for (var i = 0; i < keys.length; i++) {
        var p = keys[i];
        var v = Number(sel[p].value);
        var noteStr = String(sel[p].note || '').replace(/[\r\n]+/g, ' ').replace(/#/g, '＃').trim();
        var parts = p.split('.');
        if (parts[0] === 'horizontal') {
            if (!inHorizontal) { lines.push('horizontal:'); inHorizontal = true; }
            lines.push('  ' + parts[1] + ': ' + v.toFixed(10));
            if (noteStr) lines.push('    # ' + noteStr);
        } else if (parts[0] === 'vertical') {
            if (!inVertical) { lines.push('vertical:'); inVertical = true; }
            lines.push('  ' + parts[1] + ': ' + v.toFixed(10));
            if (noteStr) lines.push('    # ' + noteStr);
        } else if (p === 'packet.misplace.distance') {
            if (!inPacket) { lines.push('packet:'); inPacket = true; }
            if (!inMisplace) { lines.push('  misplace:'); inMisplace = true; }
            lines.push('    enabled: true');
            lines.push('    distance: ' + v.toFixed(2));
            if (noteStr) lines.push('    # ' + noteStr);
        } else if (p === 'packet.delay.ticks') {
            if (!inPacket) { lines.push('packet:'); inPacket = true; }
            if (!inDelay) { lines.push('  delay:'); inDelay = true; }
            lines.push('    enabled: true');
            lines.push('    ticks: ' + Math.round(v));
            if (noteStr) lines.push('    # ' + noteStr);
        }
    }
    document.getElementById('cmpPreview').value = lines.join('\n');
}

function cmpExport() {
    var yaml = document.getElementById('cmpPreview').value;
    if (!yaml || yaml === '# 暂无选择') {
        showToast('⚠️ 请先选择候选', 'warn');
        return;
    }
    var blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'kbm_combined.yml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showToast('✅ 组合 YAML 已导出', 'success');
}

function cmpCopy() {
    copyText(document.getElementById('cmpPreview').value);
}

// ================================================================
// 侧边栏抽屉 显示/隐藏
// ================================================================
function toggleSidebar() {
    var isOpen = document.body.classList.toggle('sidebar-open');
    try {
        localStorage.setItem('kbm_sidebar', isOpen ? 'open' : 'closed');
    } catch (e) { /* 忽略 */ }
}

function toggleFixed() {
    var content = document.getElementById('fixedContent');
    var arrow = document.getElementById('fixedArrow');
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        arrow.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        arrow.textContent = '▶';
    }
}

// 正在二分调试某参数时,导出取其区间中值(推荐值);否则取方案A当前值
function exportValue(key) {
    var state = getCurrentState();
    if (currentParam === key && state.initialized) {
        var b = getCurrentBoundaries();
        if (isFinite(b.low) && isFinite(b.high)) {
            return (b.low + b.high) / 2;
        }
    }
    return schemeA[key];
}

// ================================================================
// 导出配置（YAML）
// ================================================================
function exportConfig() {
    var filename = prompt('请输入文件名（不含扩展名）：', 'kbm_config');
    if (filename === null) return;
    if (filename.trim() === '') filename = 'kbm_config';
    var ext = '.yml';
    var lines = [];
    lines.push('# KBM 配置导出 (方案A)');
    lines.push('# 导出时间: ' + new Date().toLocaleString());
    lines.push('');
    lines.push('horizontal:');
    lines.push('  ground: ' + exportValue('horizontal.ground').toFixed(10));
    lines.push('  air: ' + exportValue('horizontal.air').toFixed(10));
    lines.push('  sprint_extra: ' + exportValue('horizontal.sprint_extra').toFixed(10));
    lines.push('vertical:');
    lines.push('  ground: ' + exportValue('vertical.ground').toFixed(10));
    lines.push('  air: ' + exportValue('vertical.air').toFixed(10));
    lines.push('  sprint_extra: ' + exportValue('vertical.sprint_extra').toFixed(10));
    lines.push('');
    lines.push('packet:');
    lines.push('  misplace:');
    var exportMisplaceDist = extraConfig['packet.misplace.distance'];
    var exportMisplaceEnabled = extraConfig['packet.misplace.enabled'];
    if (currentParam === 'packet.misplace.distance') {
        var exportBoundaries = getCurrentBoundaries();
        if (isFinite(exportBoundaries.low) && isFinite(exportBoundaries.high)) {
            exportMisplaceDist = (exportBoundaries.low + exportBoundaries.high) / 2;
        }
        exportMisplaceEnabled = true;
    }
    lines.push('    enabled: ' + (exportMisplaceEnabled ? 'true' : 'false'));
    lines.push('    distance: ' + Number(exportMisplaceDist).toFixed(2));
    lines.push('  delay:');
    var exportDelayTicks = extraConfig['packet.delay.ticks'];
    var exportDelayEnabled = extraConfig['packet.delay.enabled'];
    if (currentParam === 'packet.delay.ticks') {
        var delayBoundaries = getCurrentBoundaries();
        if (isFinite(delayBoundaries.low) && isFinite(delayBoundaries.high)) {
            exportDelayTicks = Math.round((delayBoundaries.low + delayBoundaries.high) / 2);
        }
        exportDelayEnabled = true;
    }
    lines.push('    enabled: ' + (exportDelayEnabled ? 'true' : 'false'));
    lines.push('    ticks: ' + Number(exportDelayTicks));
    lines.push('');
    // y_limit:正在调试其子项时自动启用,并导出推荐值
    var exportYEnabled = (currentParam.indexOf('y_limit.') === 0) ? true : yLimitSettings.enabled;
    var exportYMax = (currentParam === 'y_limit.max_y_height') ? exportValue('y_limit.max_y_height') : yLimitSettings.max_y_height;
    var exportYAfter = (currentParam === 'y_limit.vertical_kb_after_limit') ? exportValue('y_limit.vertical_kb_after_limit') : yLimitSettings.vertical_kb_after_limit;
    lines.push('y_limit:');
    lines.push('  enabled: ' + (exportYEnabled ? 'true' : 'false'));
    lines.push('  max_y_height: ' + Number(exportYMax).toFixed(4));
    lines.push('  vertical_kb_after_limit: ' + Number(exportYAfter).toFixed(2));
    lines.push('');
    // 乘数与延迟相关(可二分调试)
    lines.push('projectile:');
    lines.push('  enabled: ' + ((fixedParams['projectile.enabled'] || currentParam.indexOf('projectile.') === 0) ? 'true' : 'false'));
    lines.push('  horizontal_multiplier: ' + exportValue('projectile.horizontal_multiplier').toFixed(10));
    lines.push('  vertical_multiplier: ' + exportValue('projectile.vertical_multiplier').toFixed(10));
    lines.push('  direction_override: ' + (fixedParams['projectile.direction_override'] ? 'true' : 'false'));
    lines.push('');
    lines.push('potion:');
    lines.push('  enabled: ' + ((fixedParams['potion.enabled'] || currentParam.indexOf('potion.') === 0) ? 'true' : 'false'));
    lines.push('  horizontal_multiplier: ' + exportValue('potion.horizontal_multiplier').toFixed(10));
    lines.push('  vertical_multiplier: ' + exportValue('potion.vertical_multiplier').toFixed(10));
    lines.push('  compensation_multiplier: ' + exportValue('potion.compensation_multiplier').toFixed(10));
    lines.push('');
    lines.push('hit_delay: ' + Math.round(exportValue('hit_delay')));
    for (var k in fixedParams) {
        var v = fixedParams[k];
        if (k === 'projectile.enabled' || k === 'projectile.direction_override' || k === 'potion.enabled') continue;
        if (typeof v === 'boolean') v = v ? 'true' : 'false';
        lines.push(k + ': ' + v);
    }
    var content = lines.join('\n');
    var blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename + ext;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    addHistory('💾 导出', '文件: ' + filename + ext);
    showToast('✅ 已导出 ' + filename + ext, 'success');
}

// ================================================================
// 保存/恢复进度（JSON）
// ================================================================
function saveProgress() {
    var filename = prompt('请输入进度文件名（不含扩展名）：', 'kbm_progress');
    if (filename === null) return;
    if (filename.trim() === '') filename = 'kbm_progress';
    var ext = '.json';
    var progress = {
        version: '1.5',
        timestamp: new Date().toISOString(),
        currentParam: currentParam,
        independentMode: independentMode,
        schemeA: schemeA,
        schemeB: schemeB,
        paramsState: paramsState,
        presets: presets,
        extraConfig: extraConfig,
        yLimitSettings: yLimitSettings,
        candidates: candidates
    };
    var json = JSON.stringify(progress, null, 2);
    var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename + ext;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    addHistory('💾 保存进度', '文件: ' + filename + ext);
    showToast('✅ 进度已保存为 ' + filename + ext, 'success');
}

function restoreProgress(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var progress = JSON.parse(e.target.result);
            if (!progress.version) {
                alert('无效的进度文件');
                return;
            }
            currentParam = progress.currentParam || 'horizontal.ground';
            independentMode = (progress.independentMode !== undefined) ? progress.independentMode : true;
            if (progress.schemeA) schemeA = progress.schemeA;
            if (progress.schemeB) schemeB = progress.schemeB;
            if (progress.paramsState) paramsState = progress.paramsState;
            if (progress.presets) {
                presets = progress.presets;
                localStorage.setItem('kbm_presets', JSON.stringify(presets));
            }
            if (progress.extraConfig) {
                extraConfig = progress.extraConfig;
                document.getElementById('packetMisplaceEnabled').checked = extraConfig['packet.misplace.enabled'] || false;
                document.getElementById('packetMisplaceDistance').value = extraConfig['packet.misplace.distance'] || 0.1;
            }
            if (extraConfig['packet.delay.enabled'] === undefined) extraConfig['packet.delay.enabled'] = false;
            if (extraConfig['packet.delay.ticks'] === undefined) extraConfig['packet.delay.ticks'] = 2;
            document.getElementById('packetDelayEnabled').checked = extraConfig['packet.delay.enabled'] || false;
            document.getElementById('packetDelayTicks').value = extraConfig['packet.delay.ticks'] || 2;
            if (progress.yLimitSettings) {
                yLimitSettings = progress.yLimitSettings;
                document.getElementById('yLimitEnabled').checked = yLimitSettings.enabled;
                document.getElementById('yLimitMaxHeight').value = yLimitSettings.max_y_height;
                document.getElementById('yLimitAfterKb').value = yLimitSettings.vertical_kb_after_limit;
            }
            if (progress.candidates) {
                candidates = progress.candidates;
                saveCandidates();
            }
            // 迁移:确保进度文件也包含全部可调参数
            for (var mk in THEORY) {
                if (typeof schemeA[mk] !== 'number') schemeA[mk] = THEORY[mk];
                if (typeof schemeB[mk] !== 'number') schemeB[mk] = THEORY[mk];
            }
            document.getElementById('paramSelect').value = currentParam;
            document.getElementById('independentModeToggle').checked = independentMode;
            document.getElementById('modeStatus').textContent = independentMode ? '开启' : '关闭';
            var boundaries = getCurrentBoundaries();
            document.getElementById('minVal').value = boundaries.low;
            document.getElementById('maxVal').value = boundaries.high;
            renderAll();
            event.target.value = '';
            addHistory('📂 恢复进度', '文件: ' + file.name);
            showToast('✅ 进度恢复成功！', 'success');
            notifyChange();
        } catch (err) {
            alert('恢复进度失败：' + err.message);
        }
    };
    reader.readAsText(file);
}

// ================================================================
// 其他功能
// ================================================================
function analyzeTest() {
    var horiz = parseFloat(document.getElementById('testHoriz').value);
    var vert = parseFloat(document.getElementById('testVert').value);
    var param = currentParam;
    var theo = THEORY[param];
    var msg = '';
    if (param.indexOf('horizontal.') === 0) {
        if (theo === 0) {
            msg = '该参数理论值为 0，无法用位移反推，请凭手感评分调整。';
        } else if (isNaN(horiz)) {
            msg = '请填入水平位移实测值（格）';
        } else {
            var expected = theo * 4.97;
            var diff = horiz - expected;
            var ratio = diff / expected;
            if (Math.abs(ratio) < 0.02) msg = '✅ 实测与理论非常接近，无需调整。';
            else if (ratio > 0) msg = '⬆️ 实测偏大 ' + (ratio*100).toFixed(1) + '%，建议将 ' + param + ' 降低 ' + (Math.abs(diff)/4.97).toFixed(4) + ' 左右。';
            else msg = '⬇️ 实测偏小 ' + (Math.abs(ratio)*100).toFixed(1) + '%，建议将 ' + param + ' 提高 ' + (Math.abs(diff)/4.97).toFixed(4) + ' 左右。';
        }
    } else if (param.indexOf('vertical.') === 0) {
        if (theo === 0) {
            msg = '该参数理论值为 0，无法用位移反推，请凭手感评分调整。';
        } else if (isNaN(vert)) {
            msg = '请填入垂直高度实测值（格）';
        } else {
            var expected2 = theo * 2.6774;
            var diff2 = vert - expected2;
            var ratio2 = diff2 / expected2;
            if (Math.abs(ratio2) < 0.02) msg = '✅ 实测与理论非常接近，无需调整。';
            else if (ratio2 > 0) msg = '⬆️ 实测偏高 ' + (ratio2*100).toFixed(1) + '%，建议将 ' + param + ' 降低 ' + (Math.abs(diff2)/2.6774).toFixed(4) + ' 左右。';
            else msg = '⬇️ 实测偏低 ' + (Math.abs(ratio2)*100).toFixed(1) + '%，建议将 ' + param + ' 提高 ' + (Math.abs(diff2)/2.6774).toFixed(4) + ' 左右。';
        }
    } else {
        msg = '该参数暂不支持实测反推（请选择 h 或 v 类参数）';
    }
    document.getElementById('suggestion').textContent = '💡 ' + msg;
}

function toggleMode() {
    var checkbox = document.getElementById('independentModeToggle');
    independentMode = checkbox.checked;
    document.getElementById('modeStatus').textContent = independentMode ? '开启' : '关闭';
    renderAll();
    notifyChange();
}

function toggleGuide() {
    var guide = document.getElementById('guideContent');
    guide.style.display = (guide.style.display === 'none') ? 'block' : 'none';
}

// ================================================================
// 新手导览
// ================================================================
var tourSteps = [
    { selector: '#step-param', title: '步骤 1：选择参数', desc: '侧边栏中从下拉列表选择你想要调整的击退参数。' },
    { selector: '#step-range', title: '步骤 2：设定搜索范围', desc: '输入下限和上限，这是你猜测该参数可能处于的区间。' },
    { selector: '#btnTheory', title: '步骤 3：快速填充理论值', desc: '点击“理论值”按钮，工具自动填入范围。' },
    { selector: '#btnStart', title: '步骤 4：开始二分测试', desc: '点击“开始”按钮，生成方案A和B。' },
    { selector: '#step-configs', title: '步骤 5：测试两种配置', desc: '在游戏内分别测试方案A和B（桌面端两卡片并列）。' },
    { selector: '#btnA', title: '步骤 6：感受评分反馈', desc: '点击“A更接近”或“B更接近”，为两个方案打感受分，工具按分数收缩区间。' },
    { selector: '#step-feedback', title: '步骤 7：可选辅助', desc: '可输入实测数据获取建议。' },
    { selector: '#btnHistoryOpen', title: '步骤 8：历史记录与撤销', desc: '点击“历史记录”打开可拖动的弹窗，可恢复或撤销，均有提示。' },
    { selector: '#sideModuleGolden', title: '步骤 9：模块切换', desc: '侧边栏「📌 模块切换」可在经典二分 / 黄金分割 / 插值反推 / 候选对比之间自由切换，无需另开页面。' }
];
var tourIndex = 0, tourActive = false, tourTarget = null;

function startTour() {
    if (tourActive) return;
    tourActive = true;
    tourIndex = 0;
    document.body.classList.add('sidebar-open');
    showModule('classic');
    document.getElementById('tourHighlight').style.display = 'block';
    document.getElementById('tourTip').style.display = 'block';
    document.getElementById('tourPrev').style.display = 'none';
    window.addEventListener('scroll', updateTourPosition);
    window.addEventListener('resize', updateTourPosition);
    window.addEventListener('orientationchange', function() { setTimeout(updateTourPosition, 300); });
    setTimeout(function() { showTourStep(tourIndex); }, 300);
}
function showTourStep(index) {
    var step = tourSteps[index];
    if (!step) { endTour(); return; }
    var target = document.querySelector(step.selector);
    if (!target) { endTour(); return; }
    tourTarget = target;
    document.getElementById('tourTitle').textContent = step.title;
    document.getElementById('tourDesc').textContent = step.desc;
    document.getElementById('tourPrev').style.display = (index === 0) ? 'none' : 'inline-block';
    document.getElementById('tourNext').textContent = (index === tourSteps.length - 1) ? '完成' : '下一步';
    updateTourPosition();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function updateTourPosition() {
    if (!tourActive || !tourTarget) return;
    var rect = tourTarget.getBoundingClientRect();
    var highlight = document.getElementById('tourHighlight');
    highlight.style.left = (rect.left - 4) + 'px';
    highlight.style.top = (rect.top - 4) + 'px';
    highlight.style.width = (rect.width + 8) + 'px';
    highlight.style.height = (rect.height + 8) + 'px';
    var tip = document.getElementById('tourTip');
    var tipWidth = 300, tipHeight = 180, gap = 15;
    var positions = [
        { x: rect.right + gap, y: rect.top },
        { x: rect.left - tipWidth - gap, y: rect.top },
        { x: rect.left, y: rect.bottom + gap },
        { x: rect.left, y: rect.top - tipHeight - gap }
    ];
    var chosen = null;
    var viewW = window.innerWidth, viewH = window.innerHeight;
    for (var i = 0; i < positions.length; i++) {
        var p = positions[i];
        if (p.x >= 0 && p.y >= 0 && p.x + tipWidth <= viewW && p.y + tipHeight <= viewH) {
            chosen = p;
            break;
        }
    }
    if (!chosen) {
        var first = positions[0];
        var fx = Math.max(10, Math.min(first.x, viewW - tipWidth - 10));
        var fy = Math.max(10, Math.min(first.y, viewH - tipHeight - 10));
        chosen = { x: fx, y: fy };
    }
    tip.style.left = chosen.x + 'px';
    tip.style.top = chosen.y + 'px';
}
function tourNext() {
    if (tourIndex < tourSteps.length - 1) { tourIndex++; showTourStep(tourIndex); }
    else endTour();
}
function tourPrev() {
    if (tourIndex > 0) { tourIndex--; showTourStep(tourIndex); }
}
function endTour() {
    tourActive = false;
    tourTarget = null;
    document.getElementById('tourHighlight').style.display = 'none';
    document.getElementById('tourTip').style.display = 'none';
    window.removeEventListener('scroll', updateTourPosition);
    window.removeEventListener('resize', updateTourPosition);
}

// ================================================================
// 初始化
// ================================================================
window.onload = function() {
    var restored = autoRestoreState();
    if (restored) {
        document.getElementById('paramSelect').value = currentParam;
        document.getElementById('independentModeToggle').checked = independentMode;
        document.getElementById('modeStatus').textContent = independentMode ? '开启' : '关闭';
        var boundaries = getCurrentBoundaries();
        document.getElementById('minVal').value = boundaries.low;
        document.getElementById('maxVal').value = boundaries.high;
        renderAll();
        enableButtons(true);
        var state = getCurrentState();
        if (!state.initialized) {
            enableButtons(false);
            document.getElementById('configADetails').innerHTML = '<div style="color:#666;">请点击“理论值”或“开始”</div>';
            document.getElementById('configBDetails').innerHTML = '<div style="color:#666;">请点击“理论值”或“开始”</div>';
        }
        showToast('✅ 已自动恢复上次状态', 'success');
    } else {
        for (var k in THEORY) {
            schemeA[k] = THEORY[k];
            schemeB[k] = THEORY[k];
        }
        currentParam = document.getElementById('paramSelect').value;
        var state = getCurrentState();
        state.initialized = false;
        state.low = 0.4;
        state.high = 0.6;
        state.mid = 0.5;
        state.iter = 0;
        document.getElementById('minVal').value = '0.4';
        document.getElementById('maxVal').value = '0.6';
        yLimitSettings.enabled = true;
        yLimitSettings.max_y_height = 0.675;
        yLimitSettings.vertical_kb_after_limit = 0.0;
        document.getElementById('yLimitEnabled').checked = true;
        document.getElementById('yLimitMaxHeight').value = 0.675;
        document.getElementById('yLimitAfterKb').value = 0.0;
        extraConfig['packet.delay.enabled'] = false;
        extraConfig['packet.delay.ticks'] = 2;
        document.getElementById('packetDelayEnabled').checked = false;
        document.getElementById('packetDelayTicks').value = 2;
        renderAll();
        enableButtons(false);
        document.getElementById('configADetails').innerHTML = '<div style="color:#666;">点击“理论值”或“开始”</div>';
        document.getElementById('configBDetails').innerHTML = '<div style="color:#666;">点击“理论值”或“开始”</div>';
        document.getElementById('feedbackContent').classList.add('collapsed');
        document.getElementById('feedbackArrow').textContent = '▶';
        renderPresets();
        addHistory('欢迎', '使用“理论值”快速开始');
    }

    // 侧边栏初始状态（默认收起，界面清爽；记忆用户偏好）
    var savedSidebar = null;
    try { savedSidebar = localStorage.getItem('kbm_sidebar'); } catch (e) {}
    if (savedSidebar === 'open') {
        document.body.classList.add('sidebar-open');
    } else {
        document.body.classList.remove('sidebar-open');
    }
    if (savedSidebar === null) {
        setTimeout(function() {
            showToast('💡 点击屏幕左缘「☰ 控制面板」呼出调参面板', 'warn');
        }, 600);
    }

    // 经典二分调试区折叠状态记忆（已废弃，保留兼容清理）
    try { localStorage.removeItem('kbm_debug_collapsed'); } catch (e) {}

    // 恢复上次停留的模块
    var savedModule = null;
    try { savedModule = localStorage.getItem('kbm_module'); } catch (e) {}
    showModule(savedModule || 'classic');

    // 黄金分割状态恢复
    try {
        var savedGs = JSON.parse(localStorage.getItem('kbm_golden_state'));
        if (savedGs && savedGs.param &&
            typeof savedGs.low === 'number' && typeof savedGs.high === 'number' &&
            savedGs.high > savedGs.low) {
            GS = savedGs;
            if (!Array.isArray(GS.history)) GS.history = [];
            if (typeof GS.iter !== 'number' || isNaN(GS.iter)) GS.iter = 0;
            document.getElementById('gsParam').value = GS.param;
            document.getElementById('gsMin').value = GS.low;
            document.getElementById('gsMax').value = GS.high;
        }
    } catch (e) {}
    document.getElementById('gsParam').addEventListener('change', function() {
        GS.param = this.value;
        gsRender();
        gsSave();
    });
    gsRender();
    renderCompare();

    // 经典调试悬浮窗拖动
    var popupHead = document.getElementById('classicPopupHead');
    popupHead.addEventListener('mousedown', startClassicDrag);

    // 历史弹窗拖动
    var dialogHead = document.getElementById('historyDialogHead');
    dialogHead.addEventListener('mousedown', startHistoryDrag);
    var overlay = document.getElementById('historyModal');
    overlay.addEventListener('mousedown', function(e) {
        if (e.target === overlay) closeHistoryModal();
    });

    // 评分弹窗：点击遮罩关闭 + Esc 关闭所有弹窗
    var scoreOverlay = document.getElementById('confidenceModal');
    scoreOverlay.addEventListener('mousedown', function(e) {
        if (e.target === scoreOverlay) closeScoreModal();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeScoreModal();
            closeHistoryModal();
        }
    });
};

// ================================================================
// 登录接口(预留,不在页面显示;为接入网站做准备)
// 说明: 网站接入时只需设置 KBM_AUTH.API_BASE,
//       后端实现 POST {API_BASE}/api/login 返回 { token, user } 即可。
//       本工具其余功能完全不依赖登录状态,可离线使用。
// ================================================================
var KBM_AUTH = {
    API_BASE: '',
    STORAGE_KEY: 'kbm_auth_session',

    init: function() {
        try {
            var raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                var data = JSON.parse(raw);
                this._token = data.token || null;
                this._user = data.user || null;
            }
        } catch (e) {
            this._token = null;
            this._user = null;
        }
    },

    isLoggedIn: function() { return !!this._token; },

    getToken: function() { return this._token; },

    getUser: function() { return this._user; },

    setSession: function(token, user) {
        this._token = token || null;
        this._user = user || null;
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({ token: this._token, user: this._user }));
        } catch (e) { /* 忽略存储错误 */ }
    },

    clearSession: function() {
        this._token = null;
        this._user = null;
        try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) {}
    },

    // 预留:登录(接入网站后调用)
    login: function(username, password) {
        if (!this.API_BASE) {
            return Promise.reject(new Error('未配置 API_BASE'));
        }
        var self = this;
        return fetch(this.API_BASE + '/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        }).then(function(res) {
            if (!res.ok) throw new Error('登录失败 (' + res.status + ')');
            return res.json();
        }).then(function(data) {
            if (!data || !data.token) throw new Error('登录接口返回格式错误');
            self.setSession(data.token, data.user || { name: username });
            return data;
        });
    },

    // 预留:带鉴权的通用请求
    authFetch: function(path, options) {
        options = options || {};
        options.headers = options.headers || {};
        if (this._token) {
            options.headers['Authorization'] = 'Bearer ' + this._token;
        }
        return fetch(this.API_BASE + path, options);
    },

    // 预留:同步调试数据到网站(进度 JSON)
    pushRemoteState: function(progress) {
        if (!this.API_BASE) {
            return Promise.reject(new Error('未配置 API_BASE'));
        }
        return this.authFetch('/api/kbm/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(progress)
        });
    },

    // 预留:从网站拉取调试数据
    fetchRemoteState: function() {
        if (!this.API_BASE) {
            return Promise.reject(new Error('未配置 API_BASE'));
        }
        return this.authFetch('/api/kbm/state').then(function(res) {
            if (!res.ok) throw new Error('拉取失败 (' + res.status + ')');
            return res.json();
        });
    }
};
window.KBM_AUTH = KBM_AUTH;
KBM_AUTH.init();

// ================================================================
// 暴露全局
// ================================================================
window.showToast = showToast;
window.loadTheory = loadTheory;
window.initBisect = initBisect;
window.chooseA = chooseA;
window.chooseB = chooseB;
window.confirmScore = confirmScore;
window.closeScoreModal = closeScoreModal;
window.setQuickScore = setQuickScore;
window.scoreChanged = scoreChanged;
window.analyzeTest = analyzeTest;
window.resetCurrentParam = resetCurrentParam;
window.toggleMode = toggleMode;
window.toggleGuide = toggleGuide;
window.toggleFeedback = toggleFeedback;
window.toggleAdvanced = toggleAdvanced;
window.toggleFixed = toggleFixed;
window.toggleSidebar = toggleSidebar;
window.showModule = showModule;
window.popupClassic = popupClassic;
window.dockClassic = dockClassic;
window.gsTheory = gsTheory;
window.gsStart = gsStart;
window.gsChoose = gsChoose;
window.gsUndo = gsUndo;
window.gsReset = gsReset;
window.gsCopyBest = gsCopyBest;
window.fitFillExample = fitFillExample;
window.fitCompute = fitCompute;
window.copyText = copyText;
window.cmpDelete = cmpDelete;
window.cmpPreview = cmpPreview;
window.cmpExport = cmpExport;
window.cmpCopy = cmpCopy;
window.onExtraConfigChange = onExtraConfigChange;
window.onDelayChange = onDelayChange;
window.onYLimitChange = onYLimitChange;
window.restoreHistory = restoreHistory;
window.undoLast = undoLast;
window.clearHistory = clearHistory;
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;
window.keepCandidate = keepCandidate;
window.loadCandidate = loadCandidate;
window.editCandidateNote = editCandidateNote;
window.deleteCandidate = deleteCandidate;
window.exportCandidates = exportCandidates;
window.importCandidates = importCandidates;
window.exportConfig = exportConfig;
window.importGlobalConfig = importGlobalConfig;
window.saveProgress = saveProgress;
window.restoreProgress = restoreProgress;
window.savePreset = savePreset;
window.loadPreset = loadPreset;
window.deletePreset = deletePreset;
window.saveSchemeAsPreset = saveSchemeAsPreset;
window.loadPresetToScheme = loadPresetToScheme;
window.loadPresetToSchemeFromTag = loadPresetToSchemeFromTag;
window.importYamlToScheme = importYamlToScheme;
window.startTour = startTour;
window.tourNext = tourNext;
window.tourPrev = tourPrev;
window.endTour = endTour;
window.onParamChange = onParamChange;
