// JitMem Demo JavaScript

let demoData = null;
let currentIndex = 0;
let isPlaying = false;
let playInterval = null;
let seenChart = null;
let unseenChart = null;
let vizSeq = 0;
let runBase = null;
let seenResults = [];
let unseenResults = [];
let unseenCheckpoints = [];
let activeSplit = 'valid_seen';
let activeMechanism = '';
let currentSkillBankRecords = [];
let utilitySkillRecords = [];
let trajectorySplit = 'seen';
let selectedUnseenKey = null;

const RUN_TITLES = {
    'no-skill': ['No-skill', 'Frozen executor, no memory write'],
    skillos: ['SkillOS', 'Write-time skills distilled after each episode'],
    memcurator: ['JitMem', 'Just-in-time memory for LLM agents'],
    'memcurator-success-only': ['JitMem · successful', 'Store and retrieve trajectories accepted by the LLM judge'],
    'memcurator-latest': ['JitMem · latest', 'Index the latest trajectory per task'],
    'memcurator-success-latest': ['JitMem · successful + latest', 'Index the latest LLM-judge-successful trajectory per task']
};

function scrollChildInto(container, el) {
    if (!container || !el) return;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (eRect.top < cRect.top) {
        container.scrollTop -= (cRect.top - eRect.top);
    } else if (eRect.bottom > cRect.bottom) {
        container.scrollTop += (eRect.bottom - cRect.bottom);
    }
}

function restoreWindowScroll(x, y) {
    if (window.scrollX === x && window.scrollY === y) return;
    window.scrollTo(x, y);
}

function skillLabel(skill) {
    if (skill == null) return '';
    if (typeof skill === 'string') return skill;
    return skill.name || skill.skill_name || skill.title || JSON.stringify(skill);
}

function isSuccess(row) {
    // Environment success is authoritative for the current UI. Judge
    // predictions remain in the source data but do not feed plots or counts.
    if (row && row.env_success != null) return Number(row.env_success) === 1;
    if (row && row.success != null) return row.success === true || Number(row.success) === 1;
    return Boolean(row && Number(row.hard) === 1);
}

function numericId(id) {
    const match = String(id || '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

function normalizeResult(row) {
    const retrieved = Array.isArray(row.retrieved_skills)
        ? row.retrieved_skills
        : (Array.isArray(row.retrieved_trajs) ? row.retrieved_trajs : []);
    const skills = retrieved.map(skillLabel).filter(Boolean);
    return {
        ...row,
        success: isSuccess(row),
        retrieved_skills: skills,
        n_turns: row.n_turns == null ? null : row.n_turns,
        fail_reason: row.fail_reason || '',
        task_description: row.task_description || '',
        repo_size_before: row.repo_size_before ?? row.bank_size_before ?? 0,
        repo_size_after: row.repo_size_after ?? row.bank_size_after ?? 0
    };
}

function parseResultsJsonl(text) {
    const results = text.trim().split('\n').filter(Boolean).map((line) => normalizeResult(JSON.parse(line)));
    results.sort((a, b) => numericId(a.id) - numericId(b.id) || String(a.id).localeCompare(String(b.id)));
    return results;
}

function runSplit(run) {
    const parts = String(run || '').split('/');
    return parts.length >= 5 ? parts[4] : '';
}

function runWithSplit(run, split) {
    const parts = String(run || '').split('/');
    if (parts.length < 5) return '';
    parts[4] = split;
    return parts.join('/');
}

function benchmarkFromPair(pair) {
    if (String(pair).startsWith('tau2-')) return 'tau2';
    if (String(pair).startsWith('enterpriseops-')) return 'enterpriseops';
    if (String(pair).startsWith('bird-')) return 'bird';
    return 'alfworld';
}

function epochEndIndices(results) {
    const ends = [];
    (results || []).forEach((row, i) => {
        const ep = row._epoch || 1;
        const next = results[i + 1];
        const nextEp = next ? (next._epoch || 1) : null;
        if (nextEp !== ep) {
            ends.push({ epoch: ep, index: i, run: row._run });
        }
    });
    return ends;
}

async function loadUnseenCheckpoints(seenChain, seenRows) {
    const checkpoints = [];
    const first = seenChain[0] || '';
    const firstParts = first.split('/');
    const mech = firstParts[0];
    const pair = firstParts[1] || '';

    async function pushCheckpoint(epoch, index, leaf) {
        const rows = await loadSplitResults(leaf);
        if (!rows.length) return;
        checkpoints.push({ epoch: epoch, index: index, rows: rows, leaf: leaf });
    }

    const benchmark = benchmarkFromPair(pair);
    if (benchmark !== 'alfworld') {
        if (mech === 'no-skill') {
            await pushCheckpoint(0, -1, runWithSplit(first, 'test'));
            return checkpoints;
        }
        await pushCheckpoint(0, -1, `no-skill/${pair}/n-a/trial1/test`);
        const ends = epochEndIndices(seenRows);
        for (let i = 0; i < ends.length; i++) {
            const end = ends[i];
            const leaf = end.run || seenChain[end.epoch - 1];
            if (leaf) await pushCheckpoint(end.epoch, end.index, runWithSplit(leaf, 'test'));
        }
        return checkpoints;
    }

    // Epoch 0 is always the single canonical no-skill unseen evaluation.
    // It is shared across trials; probing nonexistent trial baselines creates
    // misleading 404s and would imply trial-specific no-skill performance.
    const baselineCandidates = ['no-skill/none/n-a/trial1/test'];
    for (let i = 0; i < baselineCandidates.length; i++) {
        const leaf = baselineCandidates[i];
        const rows = await loadSplitResults(leaf);
        if (rows.length) {
            checkpoints.push({ epoch: 0, index: -1, rows: rows, leaf: leaf });
            break;
        }
    }
    if (mech === 'no-skill') return checkpoints;

    const ends = epochEndIndices(seenRows);
    for (let i = 0; i < ends.length; i++) {
        const end = ends[i];
        const leaf = end.run || seenChain[end.epoch - 1];
        if (!leaf) continue;
        await pushCheckpoint(end.epoch, end.index, runWithSplit(leaf, 'test'));
    }
    return checkpoints;
}

function latestCheckpoint(index) {
    let hit = null;
    unseenCheckpoints.forEach((ck) => {
        if (ck.index <= index) hit = ck;
    });
    return hit;
}

async function loadSplitResults(run) {
    if (!run) return [];
    const tries = [run];
    const na = String(run).replace(/\/epoch_\d+\//, '/n-a/');
    if (na !== run) tries.push(na);
    for (let i = 0; i < tries.length; i++) {
        try {
            const response = await fetch('expt_data/' + tries[i] + '/results.jsonl');
            if (!response.ok) continue;
            return parseResultsJsonl(await response.text());
        } catch (err) {
            /* try next path */
        }
    }
    return [];
}

async function loadRunLeaf(run) {
    const results = await loadSplitResults(run);
    if (!results.length) throw new Error('missing ' + run);
    results.forEach((row) => {
        row._run = run;
        if (!row._epoch) row._epoch = 1;
    });
    return {
        metadata: { experiment: run },
        results,
        curation: results.map((row) => ({ id: row.id, ...(row.curation || { ops: [] }) })),
        trajectories: {}
    };
}

async function loadRunChain(runs) {
    const all = [];
    const curation = [];
    for (let i = 0; i < runs.length; i++) {
        const data = await loadRunLeaf(runs[i]);
        data.results.forEach((row) => {
            row._run = runs[i];
            row._epoch = i + 1;
            row._key = runs[i] + '::' + row.id;
        });
        all.push.apply(all, data.results);
        curation.push.apply(curation, data.curation);
    }
    return {
        metadata: { experiment: runs.join(' | ') },
        results: all,
        curation: curation,
        trajectories: {}
    };
}

async function loadTrajectory(id, runPath) {
    if (!id) return [];
    const cacheKey = (runPath || runBase || '') + '::' + id;
    if (demoData.trajectories && demoData.trajectories[cacheKey]) {
        return demoData.trajectories[cacheKey];
    }
    const base = runPath ? ('expt_data/' + runPath) : runBase;
    if (!base) return [];
    try {
        const response = await fetch(base + '/predictions/' + id + '/conversation.json');
        if (!response.ok) {
            demoData.trajectories[cacheKey] = [];
            return [];
        }
        const data = await response.json();
        const rawSteps = Array.isArray(data) ? data : (data.steps || []);
        const steps = rawSteps.map((step, index) => {
            if (!step || !step.role || step.action != null) return step;
            const role = String(step.role).replace(/^Role\./, '').toLowerCase();
            const content = typeof step.content === 'string'
                ? step.content
                : (step.content == null ? '' : JSON.stringify(step.content));
            const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
            const callText = calls.map((call) => {
                const args = call.arguments && typeof call.arguments === 'object'
                    ? JSON.stringify(call.arguments)
                    : String(call.arguments || '');
                return `${call.name || 'tool'}(${args})`;
            }).join(' · ');
            const label = callText || content || '(empty message)';
            return {
                ...step,
                step: index,
                action: `${role}: ${label}`,
                reasoning: role === 'assistant' || role === 'user' ? content : '',
                env_feedback: role === 'tool' ? content : ''
            };
        });
        demoData.trajectories[cacheKey] = steps;
        return steps;
    } catch (err) {
        demoData.trajectories[cacheKey] = [];
        return [];
    }
}

function applyRunChrome(run) {
    const parts = (run || '').split('/');
    const mech = parts[0];
    const pair = parts[1] || '';
    activeMechanism = mech;
    const titles = RUN_TITLES[mech];
    const heading = document.querySelector('.demo-header h1');
    const subtitle = document.querySelector('.demo-header .subtitle');
    const footer = document.querySelector('.demo-footer p');
    const benchmark = benchmarkFromPair(pair);
    if (benchmark !== 'alfworld') {
        const benchmarkNames = { tau2: 'Tau2', enterpriseops: 'Enterprise Ops', bird: 'BIRD' };
        const dataset = pair.slice((benchmark + '-').length).replaceAll('-', ' ');
        const mechanismName = mech === 'no-skill' ? 'No-memory' : ((titles && titles[0]) || mech);
        if (heading) heading.textContent = `${benchmarkNames[benchmark]} · ${mechanismName}`;
        if (subtitle) subtitle.textContent = benchmark === 'tau2'
            ? `${dataset} · Luna executor · Sol user simulator and NL evaluator`
            : `${dataset} · frozen Luna executor`;
    } else {
        if (titles && heading) heading.textContent = titles[0];
        if (titles && subtitle) subtitle.textContent = titles[1];
    }
    if (footer && run) footer.textContent = run;

    const retrievedTitle = document.getElementById('retrievedSkillsLabel');
    const curationTitle = document.getElementById('curationDecisionLabel');
    if (retrievedTitle) {
        retrievedTitle.textContent = mech.indexOf('memcurator') === 0
            ? 'Retrieved Trajectories'
            : 'Retrieved Skills';
    }
    if (curationTitle) {
        curationTitle.textContent = mech.indexOf('memcurator') === 0
            ? 'Just-in-Time Memory'
            : 'Curation Decision';
    }
}

function showLoadError(message) {
    const host = document.querySelector('main.demo-container') || document.body;
    host.innerHTML = '<div style="padding: 2rem; color: #c23934;">' + message + '</div>';
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'memcurator', type: 'ready' }, '*');
    }
}

// Task type display names
const TASK_TYPE_NAMES = {
    airline: 'Airline',
    retail: 'Retail',
    telecom: 'Telecom',
    'telecom-workflow': 'Telecom Workflow',
    banking_knowledge: 'Banking Knowledge',
    'look_at_obj_in_light': 'Look at Object',
    'pick_and_place': 'Pick & Place',
    'pick_and_place_simple': 'Pick & Place',
    'pick_two_obj_and_place': 'Pick Two',
    'pick_clean_then_place_in_recep': 'Clean & Place',
    'pick_cool_then_place_in_recep': 'Cool & Place',
    'pick_heat_then_place_in_recep': 'Heat & Place'
};

// Task type colors (Salesforce palette)
const TASK_TYPE_COLORS = {
    airline: '#0176d3',
    retail: '#2e844a',
    telecom: '#fe9339',
    'telecom-workflow': '#5a67d8',
    banking_knowledge: '#c23934',
    'look_at_obj_in_light': '#0176d3',
    'pick_and_place': '#2e844a',
    'pick_and_place_simple': '#2e844a',
    'pick_two_obj_and_place': '#0b6bcb',
    'pick_clean_then_place_in_recep': '#fe9339',
    'pick_cool_then_place_in_recep': '#5a67d8',
    'pick_heat_then_place_in_recep': '#c23934'
};

const USAGE_TASK_TYPE_NAMES = {
    'look_at_obj_in_light': 'Inspect',
    'pick_and_place': 'Place',
    'pick_and_place_simple': 'Place',
    'pick_two_obj_and_place': 'Pair',
    'pick_clean_then_place_in_recep': 'Clean',
    'pick_cool_then_place_in_recep': 'Cool',
    'pick_heat_then_place_in_recep': 'Heat',
    unknown: 'Other'
};

const USAGE_TASK_TYPE_COLORS = {
    'look_at_obj_in_light': '#4e79a7',
    'pick_and_place': '#f28e2b',
    'pick_and_place_simple': '#f28e2b',
    'pick_two_obj_and_place': '#59a14f',
    'pick_clean_then_place_in_recep': '#e15759',
    'pick_cool_then_place_in_recep': '#b07aa1',
    'pick_heat_then_place_in_recep': '#76b7b2',
    unknown: '#9c9c9c'
};

// Salesforce chart colors
const CHART_COLORS = {
    primary: '#0176d3',
    primaryLight: 'rgba(1, 118, 211, 0.1)',
    success: '#2e844a',
    successLight: 'rgba(46, 132, 74, 0.1)',
    purple: '#5a67d8',
    purpleLight: 'rgba(90, 103, 216, 0.1)',
    gridColor: '#dbe7f2',
    textColor: '#5e7288'
};

// Initialize demo
async function init() {
    const params = new URLSearchParams(location.search);
    const run = params.get('run');
    setupPanelFolding();
    try {
        if (run) {
            const chain = (params.get('runs') || run).split('|').map((s) => s.trim()).filter(Boolean);
            demoData = chain.length > 1 ? await loadRunChain(chain) : await loadRunLeaf(chain[0] || run);
            runBase = 'expt_data/' + (chain[chain.length - 1] || run);
            applyRunChrome(chain[chain.length - 1] || run);
            const last = chain[chain.length - 1] || run;
            const split = runSplit(last) === 'test' ? 'test' : 'valid_seen';
            activeSplit = split;
            if (split === 'test') {
                unseenResults = demoData.results;
                const seenChain = chain.map((leaf) => runWithSplit(leaf, 'valid_seen')).filter(Boolean);
                seenResults = [];
                for (let i = 0; i < seenChain.length; i++) {
                    const rows = await loadSplitResults(seenChain[i]);
                    rows.forEach((row) => {
                        row._run = seenChain[i];
                        row._epoch = i + 1;
                    });
                    seenResults = seenResults.concat(rows);
                }
                unseenCheckpoints = await loadUnseenCheckpoints(seenChain, seenResults);
            } else {
                seenResults = demoData.results;
                unseenResults = [];
                unseenCheckpoints = await loadUnseenCheckpoints(chain, seenResults);
            }
        } else {
            const response = await fetch('data/demo_data.json');
            if (!response.ok) throw new Error('demo data missing');
            demoData = await response.json();
            demoData.trajectories = demoData.trajectories || {};
            demoData.results = (demoData.results || []).map(normalizeResult);
            runBase = null;
            activeSplit = 'valid_seen';
            seenResults = demoData.results;
            unseenResults = [];
            unseenCheckpoints = [];
        }
        console.log('Loaded demo data:', demoData.metadata);
    } catch (error) {
        console.error('Failed to load demo data:', error);
        if (run) {
            showLoadError(
                'No matching experiment at <code>' + escapeHtml(run) + '</code>. '
                + (error && error.message ? escapeHtml(String(error.message)) + '. ' : '')
                + 'Pick another config in the playground.'
            );
        } else {
            showLoadError('Failed to load demo data. Please ensure <code>data/demo_data.json</code> exists and open this page via HTTP.');
        }
        return;
    }

    try {
        setupUI();
        setupCharts();
        currentIndex = Math.max(0, demoData.results.length - 1);
        const slider = document.getElementById('timelineSlider');
        if (slider) slider.value = currentIndex;
        updateVisualization(currentIndex);
        setupEmbedBridge();
    } catch (vizErr) {
        console.error('Visualization failed:', vizErr);
        try { setupEmbedBridge(); } catch (e) { /* ignore */ }
    }
}

// Setup UI event listeners
function setupUI() {
    // Timeline slider
    const slider = document.getElementById('timelineSlider');
    const last = Math.max(0, demoData.results.length - 1);
    if (slider) {
        slider.max = last;
        slider.addEventListener('input', (e) => {
            currentIndex = parseInt(e.target.value, 10);
            updateVisualization(currentIndex);
            notifyParentSeek(currentIndex);
        });
    }

    const labels = document.querySelectorAll('.timeline-labels span');
    if (labels[2]) labels[2].textContent = 'Task ' + last;
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.addEventListener('click', togglePlay);
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        stopPlay();
        seekTo(-1);
        notifyParentSeek(-1);
    });
    const speedSelect = document.getElementById('speedSelect');
    if (speedSelect) speedSelect.addEventListener('change', () => {
        if (isPlaying) {
            stopPlay();
            startPlay();
        }
    });

    document.querySelectorAll('input[name="chartModeSeen"], input[name="chartModeUnseen"]').forEach((radio) => {
        radio.addEventListener('change', () => updateSuccessCharts());
    });

    const seenOutcomeRows = document.getElementById('seenOutcomeRows');
    if (seenOutcomeRows) {
        seenOutcomeRows.addEventListener('click', (event) => {
            const cell = event.target.closest('[data-seen-index]');
            if (!cell) return;
            const index = parseInt(cell.dataset.seenIndex, 10);
            if (!Number.isFinite(index)) return;
            openSeenTrajectory(index);
        });
    }

    const unseenOutcomeRows = document.getElementById('unseenOutcomeRows');
    if (unseenOutcomeRows) {
        unseenOutcomeRows.addEventListener('click', (event) => {
            const cell = event.target.closest('[data-unseen-key]');
            if (!cell) return;
            openUnseenTrajectory(cell.dataset.unseenKey);
        });
    }

    document.querySelectorAll('[data-trajectory-split]').forEach((button) => {
        button.addEventListener('click', () => selectTrajectorySplit(button.dataset.trajectorySplit));
    });

    const skillUtilitySelect = document.getElementById('skillUtilitySelect');
    if (skillUtilitySelect) {
        skillUtilitySelect.addEventListener('change', () => {
            const index = parseInt(skillUtilitySelect.value, 10);
            if (!Number.isFinite(index) || !utilitySkillRecords[index]) {
                renderSkillUtilityPanel(null);
                return;
            }
            const selected = utilitySkillRecords[index];
            const bankHost = document.getElementById('skillBankFolders');
            if (bankHost) {
                bankHost.querySelectorAll('[data-bank-item]').forEach((item) => {
                    const record = currentSkillBankRecords[Number(item.dataset.bankItem)];
                    const matches = record && (selected.aliases || []).some((alias) => record.name === alias || record.aliases.includes(alias));
                    item.classList.toggle('is-selected', Boolean(matches));
                });
            }
            renderSkillUtilityPanel(selected);
        });
    }

    // Build task tree
    buildTaskTree();
    buildSkillExplorer();
}

function queryText(result) {
    return String((result && result.task_description) || '').trim();
}

function stepCount(result, trajectory) {
    if (Array.isArray(trajectory) && trajectory.length) return trajectory.length;
    if (!result || result.n_turns == null) return null;
    const value = Number(result.n_turns);
    return Number.isFinite(value) ? value : null;
}

function displayTaskId(id) {
    return String(id || 'task');
}

function updateTrajListCount() {
    const el = document.getElementById('trajListCount');
    if (!el) return;
    const items = Array.from(document.querySelectorAll('.task-item'));
    const visible = items.filter((item) => !item.classList.contains('hidden')).length;
    el.textContent = visible + (visible === 1 ? ' trajectory' : ' trajectories');
}

function syncPanelsToReplay(index) {
    let availableTrajectories = 0;
    document.querySelectorAll('.task-item').forEach((item) => {
        if (trajectorySplit !== 'seen') {
            item.hidden = false;
            item.disabled = false;
            item.classList.remove('hidden');
            availableTrajectories++;
            return;
        }
        const itemIndex = parseInt(item.dataset.index, 10);
        const available = Number.isFinite(itemIndex) && itemIndex <= index;
        item.hidden = !available;
        item.disabled = !available;
        item.classList.toggle('hidden', !available);
        if (available) availableTrajectories++;
    });
    const trajCount = document.getElementById('trajListCount');
    if (trajCount) trajCount.textContent = `${availableTrajectories} ${availableTrajectories === 1 ? 'trajectory' : 'trajectories'} at this time`;

    let availableSamples = 0;
    document.querySelectorAll('.skill-sample-item').forEach((item) => {
        const itemIndex = parseInt(item.dataset.skillIndex, 10);
        const available = Number.isFinite(itemIndex) && itemIndex <= index;
        item.hidden = !available;
        item.disabled = !available;
        item.classList.toggle('hidden', !available);
        if (available) availableSamples++;
    });
    const skillCount = document.getElementById('skillSampleCount');
    if (skillCount) skillCount.textContent = `${availableSamples} sample${availableSamples === 1 ? '' : 's'} at this time`;
}

function notifyParentSeek(index) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'memcurator', type: 'seeked', index: index }, '*');
    }
}

function trajectoryCheckpoints() {
    const trained = unseenCheckpoints.filter((checkpoint) => checkpoint.epoch > 0);
    return trained.length ? trained : unseenCheckpoints.filter((checkpoint) => checkpoint.epoch === 0);
}

function unseenTrajectoryItems() {
    const items = [];
    trajectoryCheckpoints().forEach((checkpoint) => {
        checkpoint.rows.forEach((row, rowIndex) => {
            items.push({
                result: { ...row, _epoch: checkpoint.epoch, _run: checkpoint.leaf, _unseen: true },
                key: `${checkpoint.epoch}:${rowIndex}`
            });
        });
    });
    return items;
}

function updateTrajectorySplitButtons() {
    document.querySelectorAll('[data-trajectory-split]').forEach((button) => {
        const selected = button.dataset.trajectorySplit === trajectorySplit;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
}

function showTrajectoryPanel() {
    const panel = document.querySelector('.trajectory-panel');
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openSeenTrajectory(index) {
    trajectorySplit = 'seen';
    selectedUnseenKey = null;
    updateTrajectorySplitButtons();
    buildTaskTree();
    currentIndex = Math.max(0, Math.min(index, demoData.results.length - 1));
    const slider = document.getElementById('timelineSlider');
    if (slider) slider.value = currentIndex;
    updateVisualization(currentIndex, { scrollList: true, scrollSkill: false });
    notifyParentSeek(currentIndex);
    showTrajectoryPanel();
}

async function openUnseenTrajectory(key) {
    const item = unseenTrajectoryItems().find((candidate) => candidate.key === key);
    if (!item) return;
    trajectorySplit = 'unseen';
    selectedUnseenKey = key;
    updateTrajectorySplitButtons();
    buildTaskTree();
    document.querySelectorAll('.task-item').forEach((button) => {
        const selected = button.dataset.unseenKey === key;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    const selected = document.querySelector(`.task-item[data-unseen-key="${key}"]`);
    if (selected) scrollChildInto(document.getElementById('taskTree'), selected);
    const seq = ++vizSeq;
    const trajectory = await loadTrajectory(item.result.id, item.result._run);
    if (seq !== vizSeq || trajectorySplit !== 'unseen' || selectedUnseenKey !== key) return;
    updateTrajectoryViewer(trajectory, item.result);
    showTrajectoryPanel();
}

function selectTrajectorySplit(split) {
    if (split === 'seen') {
        openSeenTrajectory(currentIndex);
        return;
    }
    const items = unseenTrajectoryItems();
    if (!items.length) {
        trajectorySplit = 'unseen';
        updateTrajectorySplitButtons();
        buildTaskTree();
        const viewer = document.getElementById('trajectoryViewer');
        if (viewer) viewer.innerHTML = '<div class="placeholder-text">No unseen trajectories are available for this configuration.</div>';
        return;
    }
    const key = selectedUnseenKey && items.some((item) => item.key === selectedUnseenKey)
        ? selectedUnseenKey
        : items[items.length - 1].key;
    openUnseenTrajectory(key);
}

// Build task tree in left panel — newest first
function buildTaskTree() {
    const taskTree = document.getElementById('taskTree');
    if (!taskTree) return;
    const items = trajectorySplit === 'seen'
        ? demoData.results.map((result, index) => ({ result: result, index: index, key: null })).reverse()
        : unseenTrajectoryItems().slice().reverse();

    taskTree.innerHTML = items.map((item) => {
        const t = item.result;
        const query = escapeHtml(queryText(t) || 'Untitled task');
        const n = stepCount(t);
        const ok = !!t.success;
        const epoch = t._epoch ? `<span class="task-item-epoch">e${t._epoch}</span>` : '';
        const selectionData = trajectorySplit === 'seen'
            ? `data-index="${item.index}"`
            : `data-unseen-key="${escapeHtml(item.key)}"`;
        return `
        <button type="button"
             class="task-item ${ok ? 'success' : 'failure'}"
             role="option"
             aria-selected="false"
             ${selectionData}
             data-id="${escapeHtml(String(t.id || ''))}">
            <span class="task-item-top">
                <span class="task-item-id">${escapeHtml(displayTaskId(t.id))}</span>
                ${epoch}
            </span>
            <span class="task-item-query">${query}</span>
            <span class="task-item-meta">
                <span class="task-item-pill">${n == null ? 'steps not recorded' : `${n} step${n === 1 ? '' : 's'}`}</span>
                <span class="task-item-pill task-item-out">${ok ? 'Success' : 'Failed'}</span>
            </span>
        </button>`;
    }).join('');

    taskTree.querySelectorAll('.task-item').forEach((item) => {
        item.addEventListener('mousedown', (event) => {
            event.preventDefault();
        });
        item.addEventListener('click', () => {
            if (typeof item.focus === 'function') item.focus({ preventScroll: true });
            if (item.dataset.unseenKey) {
                openUnseenTrajectory(item.dataset.unseenKey);
            } else {
                openSeenTrajectory(parseInt(item.dataset.index, 10));
            }
        });
    });
    updateTrajectorySplitButtons();
    updateTrajListCount();
}

function curationAt(index) {
    const result = demoData.results[index];
    return (demoData.curation || [])[index] || (result && result.curation) || { ops: [] };
}

function buildSkillExplorer() {
    const panel = document.querySelector('.skill-panel');
    const content = panel && panel.querySelector('.panel-content');
    const list = document.getElementById('skillSampleList');
    const count = document.getElementById('skillSampleCount');
    const note = document.getElementById('skillPanelNote');
    const noSkill = activeMechanism === 'no-skill';
    if (panel) panel.classList.toggle('is-empty', noSkill);
    if (content) content.hidden = noSkill;
    if (note) note.hidden = noSkill;
    if (noSkill || !list) return;

    const items = demoData.results.map((result, index) => ({ result, index })).reverse();
    list.innerHTML = items.map(({ result, index }) => {
        const epoch = result._epoch ? `e${result._epoch} · ` : '';
        return `<button type="button" class="skill-sample-item" role="option" aria-selected="false" data-skill-index="${index}">
            <span class="skill-sample-id">${escapeHtml(epoch + displayTaskId(result.id))}</span>
            <span class="skill-sample-query">${escapeHtml(queryText(result) || 'Untitled task')}</span>
            <span class="skill-sample-state ${result.success ? 'success' : 'failure'}">${result.success ? 'Success' : 'Failed'}</span>
        </button>`;
    }).join('');
    if (count) count.textContent = `${items.length} sample${items.length === 1 ? '' : 's'}`;

    list.querySelectorAll('[data-skill-index]').forEach((button) => {
        button.addEventListener('click', () => {
            const index = parseInt(button.dataset.skillIndex, 10);
            currentIndex = index;
            const slider = document.getElementById('timelineSlider');
            if (slider) slider.value = index;
            updateVisualization(index, { scrollList: true, scrollSkill: false });
            notifyParentSeek(index);
        });
    });
}

function skillBankRecordsAt(index) {
    const mode = activeMechanism || 'skillos';
    const records = new Map();
    const makeRecord = (name) => ({ name, aliases: [name], description: '', versions: [], trajectories: [] });
    const addTrajectory = (record, result, i, role) => {
        if (!record || record.trajectories.some((item) => item.index === i && item.role === role)) return;
        record.trajectories.push({ index: i, id: result.id, epoch: result._epoch || 0, role: role, success: !!result.success });
    };

    for (let i = 0; i <= index; i++) {
        const result = demoData.results[i];
        if (!result) continue;
        if (mode.indexOf('memcurator') === 0) {
            if (result.stored_traj) {
                const name = skillLabel(result.stored_traj).trim();
                const record = makeRecord(name);
                record.description = queryText(result) || result.jit_skill || '';
                const storedContent = result.jit_skill || queryText(result) || '';
                record.versions.push({ index: i, id: result.id, epoch: result._epoch || 0, tool: 'trajectory_store', ok: true, reason: result.success ? 'environment success' : 'stored by policy', before: '', after: storedContent, contentRecorded: Boolean(storedContent) });
                addTrajectory(record, result, i, 'stored');
                records.set(name, record);
            }
            continue;
        }
        const curation = curationAt(i);
        (curation.ops || []).forEach((op) => {
            const args = op.arguments || {};
            const oldName = skillLabel(args.skill_name || args.new_name).trim();
            const nextName = skillLabel(args.new_name || args.skill_name).trim();
            if (op.tool === 'skill_delete') {
                records.delete(oldName);
            } else if (op.tool === 'skill_update') {
                const record = records.get(oldName) || makeRecord(oldName || nextName);
                const before = record.description || args.content || '';
                record.name = nextName || oldName;
                if (oldName && !record.aliases.includes(oldName)) record.aliases.push(oldName);
                if (record.name && !record.aliases.includes(record.name)) record.aliases.push(record.name);
                record.description = args.new_content || args.content || record.description;
                record.versions.push({ index: i, id: result.id, epoch: result._epoch || 0, tool: op.tool, ok: op.ok, reason: op.reason || '', before: before, after: record.description, fromName: oldName, toName: record.name, contentRecorded: Boolean(args.new_content || args.content) });
                addTrajectory(record, result, i, 'edited');
                records.delete(oldName);
                records.set(record.name, record);
            } else if (op.tool === 'new_skill_insert') {
                const record = records.get(nextName) || makeRecord(nextName);
                record.description = args.content || args.new_content || record.description;
                record.versions.push({ index: i, id: result.id, epoch: result._epoch || 0, tool: op.tool, ok: op.ok, reason: op.reason || '', before: '', after: record.description, toName: nextName, contentRecorded: Boolean(args.content || args.new_content) });
                addTrajectory(record, result, i, 'created');
                records.set(nextName, record);
            }
        });
    }
    for (let i = 0; i <= index; i++) {
        const result = demoData.results[i];
        (result && result.retrieved_skills || []).forEach((retrieved) => {
            const name = skillLabel(retrieved).trim();
            const record = Array.from(records.values()).find((item) => item.aliases.includes(name));
            if (record) addTrajectory(record, result, i, 'retrieved');
        });
    }
    return Array.from(records.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function markdownInline(text) {
    return escapeHtml(String(text || ''))
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderMarkdown(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let list = null;
    let inCode = false;
    const closeList = () => {
        if (list) html.push(`</${list}>`);
        list = null;
    };
    lines.forEach((line) => {
        if (/^```/.test(line.trim())) {
            closeList();
            html.push(inCode ? '</code></pre>' : '<pre><code>');
            inCode = !inCode;
            return;
        }
        if (inCode) {
            html.push(escapeHtml(line) + '\n');
            return;
        }
        const heading = line.match(/^(#{1,4})\s+(.+)$/);
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (heading) {
            closeList();
            const level = heading[1].length + 2;
            html.push(`<h${level}>${markdownInline(heading[2])}</h${level}>`);
        } else if (bullet || numbered) {
            const type = bullet ? 'ul' : 'ol';
            if (list !== type) {
                closeList();
                list = type;
                html.push(`<${type}>`);
            }
            html.push(`<li>${markdownInline((bullet || numbered)[1])}</li>`);
        } else if (!line.trim()) {
            closeList();
        } else {
            closeList();
            html.push(`<p>${markdownInline(line)}</p>`);
        }
    });
    closeList();
    if (inCode) html.push('</code></pre>');
    return html.join('');
}

function openSkillBankItem(name) {
    const wanted = skillLabel(name).trim();
    const index = currentSkillBankRecords.findIndex((record) => record.name === wanted || record.aliases.includes(wanted));
    if (index < 0) return;
    const host = document.getElementById('skillBankFolders');
    const button = host && host.querySelector(`[data-bank-item="${index}"]`);
    if (button) {
        host.querySelectorAll('[data-bank-item]').forEach((item) => item.classList.toggle('is-selected', item === button));
        scrollChildInto(host, button);
    }
    renderSkillBankDetail(currentSkillBankRecords[index]);
    const detail = document.getElementById('skillBankDetail');
    if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function wireRetrievedSkillButtons(container, skills) {
    if (!container) return;
    container.querySelectorAll('[data-open-skill]').forEach((button) => button.addEventListener('click', () => {
        const skill = skills[parseInt(button.dataset.openSkill, 10)];
        if (skill != null) openSkillBankItem(skill);
    }));
}

function skillDiffHtml(before, after) {
    const left = String(before || '').split('\n');
    const right = String(after || '').split('\n');
    const dp = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
    for (let i = left.length - 1; i >= 0; i--) {
        for (let j = right.length - 1; j >= 0; j--) {
            dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const rows = [];
    let i = 0, j = 0;
    while (i < left.length || j < right.length) {
        if (i < left.length && j < right.length && left[i] === right[j]) {
            if (left[i] || (before && after)) rows.push({ type: 'context', text: left[i] });
            i++; j++;
        } else if (j >= right.length || (i < left.length && dp[i + 1][j] >= dp[i][j + 1])) {
            if (left[i]) rows.push({ type: 'delete', text: left[i] });
            i++;
        } else {
            if (right[j]) rows.push({ type: 'insert', text: right[j] });
            j++;
        }
    }
    const body = rows.map((row) => `<span class="diff-${row.type}"><i>${row.type === 'delete' ? '−' : row.type === 'insert' ? '+' : ' '}</i>${escapeHtml(row.text)}</span>`).join('');
    return `<div class="skill-git-diff"><div class="skill-diff-file"><span>--- previous</span><span>+++ current</span></div><pre>${body || '<span class="diff-context"><i> </i>No text change</span>'}</pre></div>`;
}

function skillWasRetrieved(record, result) {
    const retrieved = (result && result.retrieved_skills || []).map((item) => skillLabel(item).trim());
    return retrieved.some((name) => (record.aliases || []).includes(name) || name === record.name);
}

function skillAliasesAcrossRun(record) {
    if (activeMechanism.indexOf('memcurator') === 0) return [record.name, ...(record.aliases || [])].filter(Boolean);
    const aliases = new Set([record.name, ...(record.aliases || [])].filter(Boolean));
    for (let i = 0; i < demoData.results.length; i++) {
        const curation = curationAt(i);
        (curation && curation.ops || []).forEach((op) => {
            if (op.tool !== 'skill_update') return;
            const args = op.arguments || {};
            const oldName = skillLabel(args.skill_name || args.new_name).trim();
            const nextName = skillLabel(args.new_name || args.skill_name).trim();
            if (aliases.has(oldName) || aliases.has(nextName)) {
                if (oldName) aliases.add(oldName);
                if (nextName) aliases.add(nextName);
            }
        });
    }
    return Array.from(aliases);
}

function skillFullRunMetrics(record) {
    const fullRunRecord = { ...record, aliases: skillAliasesAcrossRun(record) };
    const memcurator = activeMechanism.indexOf('memcurator') === 0;
    let usage = 0;
    let helpful = 0;
    let edits = 0;
    for (let i = 0; i < demoData.results.length; i++) {
        const result = demoData.results[i];
        if (skillWasRetrieved(fullRunRecord, result)) {
            usage++;
            if (result.success) helpful++;
        }
        if (!memcurator) {
            const curation = curationAt(i);
            (curation && curation.ops || []).forEach((op) => {
                if (op.tool !== 'skill_update') return;
                const args = op.arguments || {};
                const oldName = skillLabel(args.skill_name || args.new_name).trim();
                const nextName = skillLabel(args.new_name || args.skill_name).trim();
                if ([oldName, nextName].some((name) => name && fullRunRecord.aliases.includes(name))) edits++;
            });
        }
    }
    if (memcurator) {
        edits = (record.versions || []).filter((version) => version.tool === 'skill_update').length;
    }
    return { usage, edits, helpRate: usage ? helpful / usage : 0 };
}

function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function skillCategoryThresholds(cohort) {
    const cohortMetrics = cohort.map((item) => skillFullRunMetrics(item));
    return {
        usageMedian: median(cohortMetrics.map((item) => item.usage)),
        editMedian: median(cohortMetrics.map((item) => item.edits))
    };
}

function skillCategoryProfile(record, thresholds) {
    if (!thresholds) {
        const finalRecords = skillBankRecordsAt(Math.max(0, demoData.results.length - 1));
        const cohort = finalRecords.length ? finalRecords : currentSkillBankRecords;
        thresholds = skillCategoryThresholds(cohort);
    }
    const usageMedian = thresholds.usageMedian;
    const editMedian = thresholds.editMedian;
    const metrics = skillFullRunMetrics(record);
    const highUsage = metrics.usage > usageMedian;
    const highEdits = metrics.edits > editMedian;
    const helpsOften = metrics.usage > 0 && metrics.helpRate >= 0.5;
    const usageCode = highUsage ? '🔋' : '🪫';
    const editCode = highEdits ? '✂️' : '🔒';
    const outcomeCode = helpsOften ? '👍' : '👎';
    return {
        metrics,
        usageMedian,
        editMedian,
        label: `${usageCode} · ${editCode} · ${outcomeCode}`,
        explanation: `${highUsage ? 'High use' : 'Low use'} · ${highEdits ? 'Many edits' : 'Few edits'} · ${helpsOften ? 'Helps' : 'Hurts'}`
    };
}

function skillUtilityHtml(record) {
    const memcurator = activeMechanism.indexOf('memcurator') === 0;
    const category = skillCategoryProfile(record);
    const fullRunRecord = { ...record, aliases: skillAliasesAcrossRun(record) };
    const uses = [];
    const operationEvents = memcurator ? (record.versions || []).map((version) => ({
        index: version.index,
        id: version.id,
        type: version.tool === 'skill_update' ? 'edit' : 'create',
        label: version.tool === 'trajectory_store' ? 'Trajectory stored' : version.tool === 'skill_update' ? 'Skill edited' : 'Skill created'
    })) : [];
    for (let i = 0; i < demoData.results.length; i++) {
        const result = demoData.results[i];
        if (!result) continue;
        if (!skillWasRetrieved(fullRunRecord, result)) continue;
        uses.push({ index: i, result: result, helped: !!result.success });
    }
    if (!memcurator) {
        for (let i = 0; i < demoData.results.length; i++) {
            const result = demoData.results[i];
            const curation = result ? curationAt(i) : null;
            (curation && curation.ops || []).forEach((op) => {
                const args = op.arguments || {};
                const oldName = skillLabel(args.skill_name || args.new_name).trim();
                const nextName = skillLabel(args.new_name || args.skill_name).trim();
                if (![oldName, nextName].some((name) => name && fullRunRecord.aliases.includes(name))) return;
                if (op.tool === 'new_skill_insert') operationEvents.push({ index: i, id: result.id, type: 'create', label: 'Skill created' });
                if (op.tool === 'skill_update') operationEvents.push({ index: i, id: result.id, type: 'edit', label: 'Skill edited' });
                if (op.tool === 'skill_delete') operationEvents.push({ index: i, id: result.id, type: 'delete', label: 'Skill deleted' });
            });
        }
    }
    operationEvents.sort((a, b) => a.index - b.index);
    const operationCounts = operationEvents.reduce((counts, event) => {
        counts[event.type] = (counts[event.type] || 0) + 1;
        return counts;
    }, { create: 0, edit: 0, delete: 0 });
    const definition = memcurator
        ? 'Use = trajectory retrieved · Help/hurt = downstream episode succeeded/failed'
        : 'Use = skill retrieved · Help/hurt = episode succeeded/failed';
    if (!uses.length && !operationEvents.length) {
        return `<section class="skill-utility"><header><span class="skill-utility-definition">${escapeHtml(definition)}</span><span class="skill-utility-header-category"><b>Category</b> ${escapeHtml(category.label)} <small>${escapeHtml(category.explanation)}</small></span></header><div class="skill-utility-empty">No lifecycle or usage events were recorded in this run.</div></section>`;
    }

    const width = 560;
    const pad = { left: 42, right: 15 };
    const innerW = width - pad.left - pad.right;
    const maxTime = Math.max(1, demoData.results.length - 1);
    const xAt = (index) => pad.left + innerW * index / maxTime;
    const starPoints = (cx, cy) => Array.from({ length: 10 }, (_, pointIndex) => {
        const radius = pointIndex % 2 === 0 ? 7 : 3.2;
        const angle = -Math.PI / 2 + pointIndex * Math.PI / 5;
        return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
    }).join(' ');

    const helpUses = uses.filter((use) => use.helped);
    const hurtUses = uses.filter((use) => !use.helped);
    const timestampUsage = new Map();
    uses.forEach((use) => {
        if (!timestampUsage.has(use.index)) timestampUsage.set(use.index, { help: 0, hurt: 0 });
        timestampUsage.get(use.index)[use.helped ? 'help' : 'hurt']++;
    });
    const usageEntries = Array.from(timestampUsage.entries()).sort((a, b) => a[0] - b[0]);
    const usageMax = Math.max(1, helpUses.length, hurtUses.length);
    const usageHeight = 220;
    const usagePad = { left: 42, right: 18, top: 18, bottom: 38 };
    const usageInnerW = width - usagePad.left - usagePad.right;
    const usageInnerH = usageHeight - usagePad.top - usagePad.bottom;
    const fullUsageMaxTime = Math.max(1, demoData.results.length - 1);
    const usageX = (timestamp) => usagePad.left + usageInnerW * timestamp / fullUsageMaxTime;
    const usageY = (value) => usagePad.top + usageInnerH * (1 - value / usageMax);
    const usageTicks = Array.from(new Set([0, Math.ceil(usageMax / 2), usageMax])).sort((a, b) => a - b).map((value) => `<line x1="${usagePad.left}" y1="${usageY(value)}" x2="${width - usagePad.right}" y2="${usageY(value)}"></line><text x="${usagePad.left - 7}" y="${usageY(value) + 3}" text-anchor="end">${value}</text>`).join('');
    const usageTimeTicks = Array.from(new Set([0, Math.round(fullUsageMaxTime * 0.25), Math.round(fullUsageMaxTime * 0.5), Math.round(fullUsageMaxTime * 0.75), fullUsageMaxTime])).sort((a, b) => a - b).map((timestamp) => `<line x1="${usageX(timestamp)}" y1="${usagePad.top}" x2="${usageX(timestamp)}" y2="${usageHeight - usagePad.bottom}"></line><text x="${usageX(timestamp)}" y="${usageHeight - 18}" text-anchor="middle">t${timestamp + 1}</text>`).join('');
    const usageByTimestamp = new Map(usageEntries);
    let cumulativeHelpfulUsage = 0;
    let cumulativeHarmfulUsage = 0;
    const usageSeries = Array.from({ length: demoData.results.length }, (_, timestamp) => {
        const value = usageByTimestamp.get(timestamp) || { help: 0, hurt: 0 };
        cumulativeHelpfulUsage += value.help;
        cumulativeHarmfulUsage += value.hurt;
        return { timestamp, help: cumulativeHelpfulUsage, hurt: cumulativeHarmfulUsage };
    });
    const helpfulUsagePath = usageSeries.map((point, index) => `${index ? 'L' : 'M'} ${usageX(point.timestamp)} ${usageY(point.help)}`).join(' ');
    const harmfulUsagePath = usageSeries.map((point, index) => `${index ? 'L' : 'M'} ${usageX(point.timestamp)} ${usageY(point.hurt)}`).join(' ');
    const usageEditMarkers = operationEvents.filter((event) => event.type === 'edit').map((event) => {
        const x = usageX(event.index);
        const y = usagePad.top + 8;
        return `<polygon class="skill-usage-edit-marker" points="${starPoints(x, y)}"><title>Skill edit · t${event.index + 1} · ${escapeHtml(event.id || '')}</title></polygon>`;
    }).join('');
    const taskTypeSegments = [];
    demoData.results.forEach((result, index) => {
        const type = result.task_type || 'unknown';
        const category = USAGE_TASK_TYPE_NAMES[type] || 'Other';
        const previous = taskTypeSegments[taskTypeSegments.length - 1];
        if (previous && previous.category === category) previous.end = index;
        else taskTypeSegments.push({ type, category, start: index, end: index });
    });
    const usageBoundaryX = (boundary) => usagePad.left + usageInnerW * boundary / Math.max(1, demoData.results.length);
    const usageStripY = usagePad.top + usageInnerH + 3;
    const usageTaskStrip = taskTypeSegments.map((segment) => {
        const x = usageBoundaryX(segment.start);
        const segmentWidth = Math.max(1, usageBoundaryX(segment.end + 1) - x);
        const label = segment.category;
        const color = USAGE_TASK_TYPE_COLORS[segment.type] || USAGE_TASK_TYPE_COLORS.unknown;
        return `<rect x="${x}" y="${usageStripY}" width="${segmentWidth}" height="7" fill="${color}"><title>t${segment.start + 1}–${segment.end + 1} · ${escapeHtml(label)}</title></rect>`;
    }).join('');
    const usageTaskCategories = new Map();
    demoData.results.forEach((result) => {
        const type = result.task_type || 'unknown';
        const label = USAGE_TASK_TYPE_NAMES[type] || 'Other';
        if (!usageTaskCategories.has(label)) usageTaskCategories.set(label, USAGE_TASK_TYPE_COLORS[type] || USAGE_TASK_TYPE_COLORS.unknown);
    });
    const usageTaskLegend = Array.from(usageTaskCategories.entries()).map(([label, color]) => `<span><i style="background:${color}"></i>${escapeHtml(label)}</span>`).join('');

    const lifecycleRows = [
        { type: 'create', label: memcurator ? 'Store' : 'Create', y: 28 },
        { type: 'edit', label: 'Edit', y: 58 },
        ...(!memcurator ? [{ type: 'delete', label: 'Delete', y: 88 }] : [])
    ];
    const lifecycleHeight = memcurator ? 104 : 134;
    const lifecycleY = (type) => (lifecycleRows.find((row) => row.type === type) || lifecycleRows[0]).y;
    const lifecycleLanes = lifecycleRows.map((row) => `<line class="utility-operation-lane" x1="${pad.left}" y1="${row.y}" x2="${width - pad.right}" y2="${row.y}"></line><text class="utility-operation-label" x="${pad.left - 7}" y="${row.y + 3}" text-anchor="end">${row.label}</text>`).join('');
    const lifecycleMarks = operationEvents.map((event) => {
        const x = xAt(event.index);
        const y = lifecycleY(event.type);
        const title = `${event.label} · ${event.id || `t${event.index + 1}`} · t${event.index + 1}`;
        if (event.type === 'create') return `<polygon class="utility-operation create" points="${x},${y - 9} ${x + 7},${y + 4} ${x - 7},${y + 4}"><title>${escapeHtml(title)}</title></polygon>`;
        if (event.type === 'edit') return `<rect class="utility-operation edit" x="${x - 6}" y="${y - 6}" width="12" height="12"><title>${escapeHtml(title)}</title></rect>`;
        return `<g class="utility-operation delete"><line x1="${x - 6}" y1="${y - 6}" x2="${x + 6}" y2="${y + 6}"></line><line x1="${x + 6}" y1="${y - 6}" x2="${x - 6}" y2="${y + 6}"></line><title>${escapeHtml(title)}</title></g>`;
    }).join('');
    const lifecycleCards = operationEvents.map((event) => `<button type="button" class="skill-lifecycle-event ${event.type}" data-lifecycle-index="${event.index}" title="Show the corresponding Skill Curator sample for ${escapeHtml(event.label)}"><b>t${event.index + 1}</b><span>${escapeHtml(event.label)}</span><small>${escapeHtml(event.id || '')}</small></button>`).join('');

    return `<section class="skill-utility">
        <header><span class="skill-utility-definition">${escapeHtml(definition)}</span><span class="skill-utility-header-category"><b>Category</b> ${escapeHtml(category.label)} <small>${escapeHtml(category.explanation)}</small></span></header>
        <div class="skill-utility-views">
        <div class="skill-utility-view">
            <div class="skill-utility-view-head"><b>Skill lifecycle</b></div>
            <div class="skill-utility-legend"><span><i class="create"></i>${memcurator ? 'Store' : 'Create'} (${operationCounts.create})</span><span><i class="edit"></i>Edit (${operationCounts.edit})</span>${memcurator ? '' : `<span><i class="delete"></i>Delete (${operationCounts.delete})</span>`}</div>
            ${operationEvents.length ? `<svg class="skill-lifecycle-chart" viewBox="0 0 ${width} ${lifecycleHeight}" role="img" aria-label="Skill lifecycle operations by type over replay time">${lifecycleLanes}${lifecycleMarks}<text class="utility-axis-title" x="${width / 2}" y="${lifecycleHeight - 7}" text-anchor="middle">Replay time</text></svg><div class="skill-lifecycle-list">${lifecycleCards}</div>` : '<div class="skill-utility-empty">No lifecycle operations are recorded.</div>'}
        </div>
        <div class="skill-utility-view">
            <div class="skill-utility-view-head"><b>Cumulative skill usage</b></div>
            <div class="skill-utility-legend"><span><i class="help"></i>Helpful uses (${helpUses.length})</span><span><i class="hurt"></i>Harmful uses (${hurtUses.length})</span><span><i class="edit-star">★</i>Skill edit</span></div>
            ${usageEntries.length ? `<svg class="skill-utility-chart skill-usage-chart" viewBox="0 0 ${width} ${usageHeight}" role="img" aria-label="Cumulative helpful and harmful skill usage line plot over replay timestamps with skill edits marked above and task types marked below"><g class="utility-grid">${usageTicks}${usageTimeTicks}</g><path class="skill-usage-line help" d="${helpfulUsagePath}"><title>${helpUses.length} cumulative helpful uses</title></path><path class="skill-usage-line hurt" d="${harmfulUsagePath}"><title>${hurtUses.length} cumulative harmful uses</title></path>${usageEditMarkers}<g class="skill-task-type-strip">${usageTaskStrip}</g><text class="utility-axis-title" x="${width / 2}" y="${usageHeight - 4}" text-anchor="middle">Timestamp</text></svg><div class="skill-task-type-legend" aria-label="Task type legend">${usageTaskLegend}</div>` : '<div class="skill-utility-empty">This skill has not been retrieved yet.</div>'}
        </div>
        </div>
    </section>`;
}

function renderSkillUtilityPanel(record) {
    const host = document.getElementById('skillUtilityPanelContent');
    const select = document.getElementById('skillUtilitySelect');
    if (!host) return;
    if (!record) {
        if (select) select.value = '';
        host.innerHTML = `<div class="placeholder-text">${activeMechanism === 'no-skill' ? 'No skill lifecycle or usage is available for the no-skill baseline.' : 'Select a skill in the Skill Panel to inspect its lifecycle and usage.'}</div>`;
        return;
    }
    if (select) {
        const index = utilitySkillRecords.indexOf(record);
        select.value = index >= 0 ? String(index) : '';
    }
    host.innerHTML = skillUtilityHtml(record);
    host.querySelectorAll('[data-lifecycle-index]').forEach((button) => button.addEventListener('click', () => {
        const targetIndex = parseInt(button.dataset.lifecycleIndex, 10);
        if (!Number.isFinite(targetIndex)) return;
        const skillPanel = document.querySelector('.skill-panel');
        if (skillPanel) {
            setDashboardPanel(skillPanel, false);
            skillPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        const sampleList = document.getElementById('skillSampleList');
        const targetSample = sampleList && sampleList.querySelector(`[data-skill-index="${targetIndex}"]`);
        if (sampleList && targetSample) {
            sampleList.querySelectorAll('.is-lifecycle-target').forEach((item) => item.classList.remove('is-lifecycle-target'));
            targetSample.classList.add('is-lifecycle-target');
            scrollChildInto(sampleList, targetSample);
            targetSample.focus({ preventScroll: true });
            window.setTimeout(() => targetSample.classList.remove('is-lifecycle-target'), 2600);
        }
    }));
}

function renderSkillBankDetail(record) {
    const host = document.getElementById('skillBankDetail');
    if (!host) return;
    if (!record) {
        host.innerHTML = '<span class="placeholder-text">Select a bank item to inspect its description, edit history, and trajectories.</span>';
        return;
    }
    const versions = record.versions.map((version, i) => `<article class="skill-version">
        <header><b>v${i + 1} · ${escapeHtml(String(version.tool || '').replaceAll('_', ' '))}</b><span>${escapeHtml((version.epoch ? `e${version.epoch} · ` : '') + version.id)}</span></header>
        ${version.fromName && version.toName && version.fromName !== version.toName ? `<p><strong>Rename</strong><br><code>${escapeHtml(version.fromName)} → ${escapeHtml(version.toName)}</code></p>` : ''}
        ${version.contentRecorded ? skillDiffHtml(version.before, version.after) : `<div class="skill-diff-unavailable">No content payload was recorded for this ${version.tool === 'skill_update' ? (version.fromName && version.toName && version.fromName !== version.toName ? 'legacy rename-only update' : 'legacy name-only update') : escapeHtml(String(version.tool || 'operation').replaceAll('_', ' '))}, so a text diff cannot be reconstructed.</div>`}
        ${version.reason ? `<p><strong>Status</strong><br>${version.ok === false ? 'Failed' : 'Applied'} · ${escapeHtml(version.reason)}</p>` : ''}
    </article>`).join('');
    const trajectories = record.trajectories.map((item) => `<button type="button" class="skill-trajectory-link" data-bank-index="${item.index}">${escapeHtml((item.epoch ? `e${item.epoch} · ` : '') + item.id)} · ${escapeHtml(item.role)}</button>`).join('');
    host.innerHTML = `<h3>${escapeHtml(record.name)}</h3>
        <h4>Current description</h4>
        <div class="skill-bank-description skill-markdown">${renderMarkdown(record.description || 'No description was recorded.')}</div>
        <h4>Version history · exact edits</h4>
        <div class="skill-version-list">${versions || '<span class="placeholder-text">No edit history recorded.</span>'}</div>
        <h4>Trajectories</h4>
        <div class="skill-trajectory-links">${trajectories || '<span class="placeholder-text">No linked trajectories.</span>'}</div>`;
    const utilityRecord = utilitySkillRecords.find((candidate) => {
        const aliases = new Set([candidate.name, ...(candidate.aliases || [])]);
        return [record.name, ...(record.aliases || [])].some((alias) => aliases.has(alias));
    });
    renderSkillUtilityPanel(utilityRecord || record);
    host.querySelectorAll('[data-bank-index]').forEach((button) => button.addEventListener('click', () => {
        const targetIndex = parseInt(button.dataset.bankIndex, 10);
        currentIndex = targetIndex;
        const slider = document.getElementById('timelineSlider');
        if (slider) slider.value = targetIndex;
        updateVisualization(targetIndex, { scrollList: true, scrollSkill: true });
        notifyParentSeek(targetIndex);
    }));
}

function renderSkillCategoryDistribution() {
    const host = document.getElementById('skillCategoryDistribution');
    if (!host) return;
    const records = activeMechanism === 'no-skill' ? [] : skillBankRecordsAt(Math.max(0, demoData.results.length - 1));
    if (!records.length) {
        host.innerHTML = '<div class="placeholder-text">No skills are available for category analysis.</div>';
        return;
    }
    const categories = [
        { code: '🔋 · ✂️ · 👍', meaning: 'high usage · high edits · helps often' },
        { code: '🔋 · ✂️ · 👎', meaning: 'high usage · high edits · hurts often' },
        { code: '🔋 · 🔒 · 👍', meaning: 'high usage · low edits · helps often' },
        { code: '🔋 · 🔒 · 👎', meaning: 'high usage · low edits · hurts often' },
        { code: '🪫 · ✂️ · 👍', meaning: 'low usage · high edits · helps often' },
        { code: '🪫 · ✂️ · 👎', meaning: 'low usage · high edits · hurts often' },
        { code: '🪫 · 🔒 · 👍', meaning: 'low usage · low edits · helps often' },
        { code: '🪫 · 🔒 · 👎', meaning: 'low usage · low edits · hurts often' }
    ];
    const thresholds = skillCategoryThresholds(records);
    const counts = new Map(categories.map((category) => [category.code, 0]));
    records.forEach((record) => {
        const code = skillCategoryProfile(record, thresholds).label;
        counts.set(code, (counts.get(code) || 0) + 1);
    });
    const maxCount = Math.max(1, ...counts.values());
    const rows = categories.map((category) => {
        const count = counts.get(category.code) || 0;
        const width = 100 * count / maxCount;
        return `<div class="skill-category-row" title="${escapeHtml(category.meaning)}"><span class="skill-category-code">${category.code}</span><span class="skill-category-bar" aria-hidden="true"><i style="width:${width}%"></i></span><b class="skill-category-count">${count}</b></div>`;
    }).join('');
    host.innerHTML = `<p class="skill-category-summary"><b>${records.length}</b> full-run skills across eight categories.</p><div class="skill-category-distribution">${rows}</div><p class="skill-category-key">🔋 high / 🪫 low use · ✂️ many / 🔒 few edits · 👍 help / 👎 hurt</p>`;
}

function renderSkillBank(index) {
    const host = document.getElementById('skillBankFolders');
    const count = document.getElementById('skillBankFolderCount');
    const utilitySelect = document.getElementById('skillUtilitySelect');
    if (!host) return;
    const records = index < 0 ? [] : skillBankRecordsAt(index);
    currentSkillBankRecords = records;
    renderSkillCategoryDistribution();
    if (count) count.textContent = `${records.length} item${records.length === 1 ? '' : 's'}`;
    if (utilitySelect) {
        const selectedRecord = utilitySkillRecords[parseInt(utilitySelect.value, 10)];
        const selectedName = selectedRecord && selectedRecord.name;
        utilitySkillRecords = activeMechanism === 'no-skill'
            ? []
            : skillBankRecordsAt(Math.max(0, demoData.results.length - 1));
        const rankedRecords = utilitySkillRecords.map((record, itemIndex) => {
            return { record, itemIndex, uses: skillFullRunMetrics(record).usage };
        })
            .sort((a, b) => b.uses - a.uses || a.record.name.localeCompare(b.record.name));
        utilitySelect.innerHTML = '<option value="">Select a skill · most used first</option>' + rankedRecords.map(({ record, itemIndex, uses }) => `<option value="${itemIndex}">${escapeHtml(record.name)} · ${uses} use${uses === 1 ? '' : 's'}</option>`).join('');
        utilitySelect.disabled = utilitySkillRecords.length === 0;
        const selectedIndex = utilitySkillRecords.findIndex((record) => record.name === selectedName);
        utilitySelect.value = selectedIndex >= 0 ? String(selectedIndex) : '';
    }
    host.innerHTML = records.length
        ? records.map((record, itemIndex) => `<button type="button" class="skill-folder" role="listitem" data-bank-item="${itemIndex}">
            <span class="skill-list-index">${String(itemIndex + 1).padStart(2, '0')}</span>
            <span class="skill-folder-name">${escapeHtml(record.name)}</span>
        </button>`).join('')
        : '<div class="skill-bank-empty">The skill bank is empty at this sample.</div>';
    renderSkillBankDetail(null);
    const selectedUtilityIndex = utilitySelect ? parseInt(utilitySelect.value, 10) : NaN;
    renderSkillUtilityPanel(Number.isFinite(selectedUtilityIndex) ? utilitySkillRecords[selectedUtilityIndex] : null);
    host.querySelectorAll('[data-bank-item]').forEach((button) => button.addEventListener('click', () => {
        host.querySelectorAll('[data-bank-item]').forEach((item) => item.classList.toggle('is-selected', item === button));
        renderSkillBankDetail(records[parseInt(button.dataset.bankItem, 10)]);
    }));
}

function chartMode(name) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return (el && el.value) || 'cumulative';
}

function cumulativeRate(results) {
    let ok = 0;
    return results.map((r, i) => {
        if (r.success) ok += 1;
        return Math.round((100 * ok) / (i + 1));
    });
}

function byTypeDatasets(results) {
    const byType = {};
    results.forEach((r, i) => {
        const type = r.task_type || 'other';
        if (!byType[type]) byType[type] = [];
        byType[type].push({ index: i, success: r.success });
    });
    return Object.entries(byType).map(([type, entries]) => {
        const data = new Array(results.length).fill(null);
        let ok = 0;
        entries.forEach((entry, j) => {
            if (entry.success) ok += 1;
            data[entry.index] = Math.round((100 * ok) / (j + 1));
        });
        return {
            label: TASK_TYPE_NAMES[type] || type,
            data: data,
            borderColor: TASK_TYPE_COLORS[type] || '#8b98a5',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            pointRadius: 2,
            spanGaps: true
        };
    });
}

function unseenStepSeries(len) {
    const data = [];
    for (let i = 0; i < len; i++) {
        const ck = latestCheckpoint(i);
        if (!ck) {
            data.push(null);
            continue;
        }
        data.push(rateStats(ck.rows).pct);
    }
    return data;
}

function unseenByTypeDatasets(len) {
    const types = [];
    unseenCheckpoints.forEach((ck) => {
        ck.rows.forEach((row) => {
            const type = row.task_type || 'other';
            if (types.indexOf(type) < 0) types.push(type);
        });
    });
    return types.map((type) => {
        const data = [];
        for (let i = 0; i < len; i++) {
            const ck = latestCheckpoint(i);
            if (!ck) {
                data.push(null);
                continue;
            }
            const subset = ck.rows.filter((row) => (row.task_type || 'other') === type);
            if (!subset.length) {
                data.push(null);
                continue;
            }
            data.push(Math.round((100 * subset.filter((row) => row.success).length) / subset.length));
        }
        return {
            label: TASK_TYPE_NAMES[type] || type,
            data: data,
            borderColor: TASK_TYPE_COLORS[type] || '#8b98a5',
            backgroundColor: 'transparent',
            fill: false,
            stepped: true,
            points: checkpointXs(len),
            spanGaps: true
        };
    });
}

function checkpointXs(len) {
    const marks = [];
    unseenCheckpoints.forEach((ck) => {
        const x = Math.max(0, ck.index);
        if (x < len) marks.push(x);
    });
    return marks;
}

function linePath(data, xAt, yAt, stepped) {
    let d = '';
    let pen = false;
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v == null || !Number.isFinite(Number(v))) {
            pen = false;
            continue;
        }
        const x = xAt(i);
        const y = yAt(Number(v));
        if (!pen) {
            d += 'M ' + x + ' ' + y + ' ';
            pen = true;
        } else if (stepped) {
            d += 'H ' + x + ' V ' + y + ' ';
        } else {
            d += 'L ' + x + ' ' + y + ' ';
        }
    }
    return d.trim();
}

function areaPath(data, xAt, yAt, baseY, stepped) {
    const segs = [];
    let cur = [];
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v == null || !Number.isFinite(Number(v))) {
            if (cur.length) segs.push(cur);
            cur = [];
            continue;
        }
        cur.push([i, Number(v)]);
    }
    if (cur.length) segs.push(cur);
    return segs.map((seg) => {
        let d = '';
        seg.forEach((pt, k) => {
            const x = xAt(pt[0]);
            const y = yAt(pt[1]);
            if (k === 0) d += 'M ' + x + ' ' + y + ' ';
            else if (stepped) d += 'H ' + x + ' V ' + y + ' ';
            else d += 'L ' + x + ' ' + y + ' ';
        });
        const lastX = xAt(seg[seg.length - 1][0]);
        const firstX = xAt(seg[0][0]);
        d += 'L ' + lastX + ' ' + baseY + ' L ' + firstX + ' ' + baseY + ' Z';
        return d;
    }).join(' ');
}

function drawSvgChart(host, spec) {
    if (!host) return;
    const series = (spec && spec.series) || [];
    const width = Math.max(260, Math.floor(host.clientWidth) || 400);
    const height = 240;
    const pad = { l: 38, r: 10, t: 12, b: 32 };
    const innerW = Math.max(1, width - pad.l - pad.r);
    const innerH = Math.max(1, height - pad.t - pad.b);
    let n = 1;
    series.forEach((s) => {
        n = Math.max(n, (s.data && s.data.length) || 0);
    });
    const xAt = (i) => pad.l + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const yAt = (v) => pad.t + innerH * (1 - Math.max(0, Math.min(100, v)) / 100);
    const grid = [0, 25, 50, 75, 100].map((g) => {
        const y = yAt(g);
        return '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (width - pad.r) + '" y2="' + y + '" stroke="' + CHART_COLORS.gridColor + '" />'
            + '<text x="' + (pad.l - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="' + CHART_COLORS.textColor + '">' + g + '</text>';
    }).join('');
    const xticks = [];
    const tickN = Math.min(6, n);
    for (let t = 0; t < tickN; t++) {
        const i = tickN === 1 ? 0 : Math.round((t * (n - 1)) / (tickN - 1));
        xticks.push('<text x="' + xAt(i) + '" y="' + (height - 8) + '" text-anchor="middle" font-size="10" fill="' + CHART_COLORS.textColor + '">' + i + '</text>');
    }
    const paths = series.map((s, si) => {
        const data = s.data || [];
        const color = s.borderColor || CHART_COLORS.primary;
        const fill = s.backgroundColor || 'transparent';
        const stepped = !!s.stepped;
        let html = '';
        if (s.fill && fill && fill !== 'transparent') {
            html += '<path d="' + areaPath(data, xAt, yAt, pad.t + innerH, stepped) + '" fill="' + fill + '" stroke="none" />';
        }
        html += '<path d="' + linePath(data, xAt, yAt, stepped) + '" fill="none" stroke="' + color + '" stroke-width="2" />';
        if (s.points) {
            s.points.forEach((i) => {
                const v = data[i];
                if (v == null || !Number.isFinite(Number(v))) return;
                html += '<circle cx="' + xAt(i) + '" cy="' + yAt(Number(v)) + '" r="3.5" fill="#fff" stroke="' + color + '" stroke-width="2" />';
            });
        }
        return html;
    }).join('');
    const legend = (spec.showLegend && series.length > 1)
        ? '<div class="chart-legend">' + series.map((s) =>
            '<span><i style="background:' + (s.borderColor || '#8b98a5') + '"></i>' + escapeHtml(s.label || '') + '</span>'
        ).join('') + '</div>'
        : '';
    host.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-hidden="true">'
        + grid + paths
        + '<text x="' + (width / 2) + '" y="' + (height - 1) + '" text-anchor="middle" font-size="10" fill="' + CHART_COLORS.textColor + '">'
        + escapeHtml((spec && spec.xTitle) || 'Seen tasks') + '</text>'
        + xticks.join('')
        + '</svg>' + legend;
}

function fillUnseenChart(len) {
    if (!unseenChart || !unseenChart.el) return;
    const mode = chartMode('chartModeUnseen');
    let series;
    let showLegend = false;
    if (!len || !unseenCheckpoints.length) {
        series = [{ label: 'Unseen · test', data: [], borderColor: CHART_COLORS.success, backgroundColor: CHART_COLORS.successLight, fill: true }];
    } else if (mode === 'byType') {
        series = unseenByTypeDatasets(len);
        showLegend = true;
    } else {
        series = [{
            label: 'Unseen · epoch eval',
            data: unseenStepSeries(len),
            borderColor: CHART_COLORS.success,
            backgroundColor: CHART_COLORS.successLight,
            fill: true,
            stepped: true,
            points: checkpointXs(len)
        }];
    }
    drawSvgChart(unseenChart.el, { series: series, xTitle: 'Seen tasks', showLegend: showLegend });
}

function rateStats(results) {
    const n = results.length;
    const ok = results.filter((r) => r.success).length;
    const pct = n ? Math.round((100 * ok) / n) : null;
    return { n: n, ok: ok, pct: pct };
}

function fillRateChart(chart, rows, label, color, fill) {
    if (!chart || !chart.el) return;
    const mode = chartMode('chartModeSeen');
    let series;
    let showLegend = false;
    if (!rows.length) {
        series = [{ label: label, data: [], borderColor: color, backgroundColor: fill, fill: true }];
    } else if (mode === 'byType') {
        series = byTypeDatasets(rows);
        showLegend = true;
    } else {
        series = [{ label: label, data: cumulativeRate(rows), borderColor: color, backgroundColor: fill, fill: true }];
    }
    drawSvgChart(chart.el, { series: series, xTitle: 'Seen tasks', showLegend: showLegend });
}

function makeRateChart(elId) {
    const el = document.getElementById(elId);
    return el ? { el: el } : null;
}

function setupCharts() {
    seenChart = makeRateChart('seenChart');
    unseenChart = makeRateChart('unseenChart');
}

function updateVisualizationEmpty() {
    currentIndex = -1;
    syncPanelsToReplay(-1);
    const label = document.getElementById('currentTaskLabel');
    if (label) label.textContent = 'Current: —';
    const skillNote = document.getElementById('skillPanelNote');
    if (skillNote) skillNote.textContent = 'replay start · no samples yet';
    document.querySelectorAll('.task-item').forEach((item) => {
        item.classList.remove('selected');
        item.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.skill-sample-item').forEach((item) => {
        item.classList.remove('is-selected');
        item.setAttribute('aria-selected', 'false');
    });
    const query = document.getElementById('currentQuery');
    if (query) query.innerHTML = '<span class="placeholder-text">Select a task</span>';
    const skills = document.getElementById('retrievedSkills');
    if (skills) skills.innerHTML = '<span class="placeholder-text">No skills retrieved</span>';
    const retrievalNote = document.getElementById('retrievalKNote');
    if (retrievalNote) retrievalNote.textContent = '';
    const op = document.getElementById('curationOp');
    if (op) op.innerHTML = '<span class="placeholder-text">-</span>';
    const curatorOutput = document.getElementById('curatorOutput');
    if (curatorOutput) curatorOutput.innerHTML = '<span class="placeholder-text">No curator output at replay start.</span>';
    const curatorStats = document.getElementById('curatorStats');
    if (curatorStats) curatorStats.innerHTML = '<span class="placeholder-text">No curator calls at replay start.</span>';
    const badge = document.getElementById('resultBadge');
    if (badge) {
        badge.className = 'result-badge';
        badge.innerHTML = '<span class="placeholder-text">-</span>';
    }
    const judgeBadge = document.getElementById('judgeBadge');
    if (judgeBadge) {
        judgeBadge.className = 'result-badge neutral';
        judgeBadge.innerHTML = '<span class="placeholder-text">-</span>';
    }
    renderSkillBank(-1);
    const viewer = document.getElementById('trajectoryViewer');
    if (viewer) {
        viewer.innerHTML = '<div class="placeholder-text">Select a trajectory to see the original query, step count, outcome, and individual steps.</div>';
    }
    updateStats(-1);
    updateSuccessCharts();
}

// Update all visualizations for current index
async function updateVisualization(index, opts) {
    if (index < 0) {
        updateVisualizationEmpty();
        return;
    }
    const result = demoData.results[index];
    if (!result) return;
    const seq = ++vizSeq;
    const curation = (demoData.curation || [])[index] || result.curation;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    syncPanelsToReplay(index);

    // Update timeline label
    const taskLabel = document.getElementById('currentTaskLabel');
    if (taskLabel) taskLabel.textContent = `Current: ${index} (${result.id})`;

    // Highlight seen trajectories only; unseen selection remains pinned while replay time changes.
    if (trajectorySplit === 'seen') {
        document.querySelectorAll('.task-item').forEach((item) => {
            const itemIndex = parseInt(item.dataset.index, 10);
            const selected = itemIndex === index;
            item.classList.toggle('selected', selected);
            item.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        if (opts && opts.scrollList) {
            const selectedItem = document.querySelector(`.task-item[data-index="${index}"]`);
            if (selectedItem) {
                scrollChildInto(document.getElementById('taskTree'), selectedItem);
            }
        }
    }
    updateTrajListCount();

    document.querySelectorAll('.skill-sample-item').forEach((item) => {
        const itemIndex = parseInt(item.dataset.skillIndex, 10);
        const selected = itemIndex === index;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (!opts || opts.scrollSkill !== false) {
        const selectedSkill = document.querySelector(`.skill-sample-item[data-skill-index="${index}"]`);
        if (selectedSkill) scrollChildInto(document.getElementById('skillSampleList'), selectedSkill);
    }

    updateSkillPanel(result, curation, index);
    updateStats(index);
    renderCuratorStats(index);
    updateSuccessCharts();
    restoreWindowScroll(scrollX, scrollY);
    requestAnimationFrame(() => restoreWindowScroll(scrollX, scrollY));

    if (trajectorySplit !== 'seen') return;
    const trajectory = await loadTrajectory(result.id, result._run);
    if (seq !== vizSeq) return;
    updateTrajectoryViewer(trajectory, result);
    restoreWindowScroll(scrollX, scrollY);
    requestAnimationFrame(() => restoreWindowScroll(scrollX, scrollY));
}

function humanStepNumber(step, index) {
    if (step && Number.isFinite(Number(step.step))) {
        const n = Number(step.step);
        return n >= 0 ? n + 1 : index + 1;
    }
    return index + 1;
}

function stepDetailHtml(step) {
    const think = String((step && (step.reasoning || step.think)) || '').trim();
    const feedback = String((step && (step.env_feedback || step.observation)) || '').trim();
    const thinkHtml = think
        ? `<div class="step-block"><span class="step-kicker">Think</span><div class="step-think">${escapeHtml(think)}</div></div>`
        : '';
    const obsHtml = feedback
        ? `<div class="step-block"><span class="step-kicker">Environment</span><div class="step-feedback">${escapeHtml(feedback)}</div></div>`
        : '';
    const inner = (thinkHtml || obsHtml)
        ? thinkHtml + obsHtml
        : '<p class="traj-empty-steps">No extra detail for this step.</p>';
    return `<div class="step-detail">${inner}</div>`;
}

function renderStep(step, index, orderIndex) {
    const reward = Number(step && step.reward) || 0;
    const doneWin = !!(step && step.done && reward > 0);
    const action = String((step && step.action) || '').trim();
    const n = humanStepNumber(step, index);
    const rewardHtml = reward > 0
        ? `<span class="step-reward has-reward">+${escapeHtml(String(reward))}</span>`
        : '';
    return `
        <article class="trajectory-step ${doneWin ? 'success-step' : ''}" data-i="${orderIndex}">
            <button type="button" class="step-toggle" aria-expanded="false">
                <span class="step-number">Step ${n}</span>
                <span class="step-action-line">${escapeHtml(action || '-')}</span>
                ${rewardHtml}
            </button>
        </article>`;
}

function wireCompareButton(viewer, result, steps) {
    const button = viewer && viewer.querySelector('.traj-compare-save');
    if (!button || !result) return;
    button.addEventListener('click', () => {
        const run = result._run || runBase || '';
        const curation = result._unseen ? (result.curation || { ops: [] }) : curationAt(currentIndex);
        window.parent.postMessage({
            source: 'memcurator',
            type: 'save-compare',
            item: {
                key: run + '|' + result.id,
                run: run,
                id: result.id,
                epoch: result._epoch || 0,
                query: queryText(result),
                retrieved: Array.isArray(result.retrieved_skills) ? result.retrieved_skills.map(skillLabel) : [],
                envSuccess: !!result.success,
                failReason: result.fail_reason || '',
                judgeSuccess: result.judge_success,
                judgeRationale: result.judge_rationale || '',
                curation: curation || result.curation || null,
                jitSkill: result.jit_skill || '',
                executorHeading: result.executor_heading || '',
                storedTraj: result.stored_traj || '',
                bankBefore: result.repo_size_before ?? result.bank_size_before ?? null,
                bankAfter: result.repo_size_after ?? result.bank_size_after ?? null,
                nTurns: stepCount(result, steps),
                steps: (steps || []).map((step, index) => ({
                    number: humanStepNumber(step, index),
                    action: step.action || '',
                    reasoning: step.reasoning || step.think || '',
                    feedback: step.env_feedback || step.observation || '',
                    reward: step.reward || 0
                }))
            }
        }, '*');
        button.textContent = 'Saved for comparison';
        button.classList.add('is-saved');
    });
}

function updateTrajectoryViewer(trajectory, result) {
    const viewer = document.getElementById('trajectoryViewer');
    if (!viewer) return;

    try {
        const steps = Array.isArray(trajectory) ? trajectory.slice() : [];
        const n = stepCount(result, steps);
        const query = escapeHtml(queryText(result) || '-');
        const ok = !!(result && result.success);
        const reason = !ok && result && result.fail_reason ? escapeHtml(result.fail_reason) : '';
        const rationale = result && result.judge_rationale ? escapeHtml(result.judge_rationale) : '';
        const judgeRecorded = result && (result.judge_success === 1 || result.judge_success === 0 || result.judge_success === true || result.judge_success === false);
        const judgeOk = result && (result.judge_success === 1 || result.judge_success === true);
        const retrieved = (result && Array.isArray(result.retrieved_skills))
            ? result.retrieved_skills.map(skillLabel).filter(Boolean)
            : [];
        const retrievedHtml = retrieved.length
            ? retrieved.map((skill, index) => `<button type="button" class="traj-retrieved-tag" data-open-skill="${index}">${escapeHtml(skill)}</button>`).join('')
            : '<span class="traj-retrieved-empty">None</span>';

        const summary = `
        <div class="traj-summary">
            <dl class="traj-summary-grid">
                <div class="traj-field">
                    <dt>Original query</dt>
                    <dd>${query}</dd>
                    <div class="traj-retrieved">
                        <span class="traj-retrieved-label">Retrieved skills</span>
                        <div class="traj-retrieved-list">${retrievedHtml}</div>
                    </div>
                </div>
                <div class="traj-field stat">
                    <dt>Number of steps</dt>
                    <dd>${n == null ? 'Not recorded' : n}</dd>
                </div>
                <div class="traj-field traj-outcome">
                    <dt>Final outcome</dt>
                    <dd>
                        <span class="traj-outcome-badge ${ok ? 'success' : 'failure'}">${ok ? 'Success' : 'Failed'}</span>
                        ${reason ? `<div class="traj-outcome-reason">${reason}</div>` : ''}
                    </dd>
                </div>
            </dl>
            ${(rationale || judgeRecorded) ? `<div class="traj-rationale">
                <div class="traj-rationale-head">
                    <span>Self-judge assessment</span>
                    ${judgeRecorded ? `<span class="traj-outcome-badge ${judgeOk ? 'success' : 'failure'}">${judgeOk ? 'Predicted success' : 'Predicted failure'}</span>` : '<span class="traj-outcome-badge neutral">Not recorded</span>'}
                </div>
                ${rationale ? `<p>${rationale}</p>` : '<p>No rationale recorded.</p>'}
            </div>` : ''}
            <button type="button" class="traj-compare-save">Save to compare</button>
        </div>`;

        if (!steps.length) {
            viewer.innerHTML = summary + '<p class="traj-empty-steps">No step trace is available for this trajectory.</p>';
            wireCompareButton(viewer, result, steps);
            wireRetrievedSkillButtons(viewer, retrieved);
            viewer.scrollTop = 0;
            return;
        }

        const ordered = steps
            .map((step, index) => ({ step, index }))
            .sort((a, b) => {
                const sa = Number(a.step && a.step.step);
                const sb = Number(b.step && b.step.step);
                const na = Number.isFinite(sa) ? sa : a.index;
                const nb = Number.isFinite(sb) ? sb : b.index;
                return na - nb || a.index - b.index;
            });
        const stepHtml = ordered.map(({ step, index }, i) => renderStep(step, index, i)).join('');

        viewer.innerHTML = summary +
            `<div class="traj-steps-head"><span>Individual steps</span><span>Step 1 to ${ordered.length}</span></div>
            <div class="traj-steps">${stepHtml}</div>`;
        wireCompareButton(viewer, result, ordered.map((item) => item.step));
        wireRetrievedSkillButtons(viewer, retrieved);
        viewer.scrollTop = 0;
        const stepsPane = viewer.querySelector('.traj-steps');
        if (stepsPane) {
            stepsPane.scrollTop = 0;
            stepsPane.querySelectorAll('.step-toggle').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('.trajectory-step');
                    if (!row) return;
                    const opening = btn.getAttribute('aria-expanded') !== 'true';
                    btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
                    row.classList.toggle('is-open', opening);
                    let body = row.querySelector('.step-detail');
                    if (opening && !body) {
                        const item = ordered[Number(row.dataset.i)];
                        row.insertAdjacentHTML('beforeend', stepDetailHtml(item && item.step));
                        body = row.querySelector('.step-detail');
                    }
                    if (body) body.hidden = !opening;
                });
            });
        }
    } catch (err) {
        console.error('Trajectory viewer failed:', err);
        viewer.innerHTML = '<p class="traj-empty-steps">Could not render this trajectory.</p>';
    }
}

function curatorDisplayValue(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

function curatorRows(fields) {
    return fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd><pre>${escapeHtml(curatorDisplayValue(value))}</pre></dd></div>`).join('');
}

function renderCuratorOutput(result, curation) {
    const host = document.getElementById('curatorOutput');
    if (!host) return;
    const payload = curation || {};
    const ops = Array.isArray(payload.ops) ? payload.ops : [];
    const bankBefore = result.repo_size_before ?? result.bank_size_before;
    const bankAfter = result.repo_size_after ?? result.bank_size_after;
    const summary = [
        ['bank', bankBefore != null || bankAfter != null ? `${bankBefore ?? '—'} → ${bankAfter ?? '—'}` : null],
        ['retrieved', payload.n_retrieved != null ? payload.n_retrieved : (result.retrieved_skills || []).length],
        ['operations', payload.n_ops != null ? payload.n_ops : ops.length],
        ['valid operations', payload.n_valid],
        ['skipped', payload.skipped],
        ['stored trajectory', result.stored_traj || (result.stored_traj === null ? 'no' : null)],
        ['JIT characters', payload.jit_skill_chars]
    ].filter(([, value]) => value != null);
    let html = `<div class="curator-output-summary">${summary.map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(String(value))}</span>`).join('')}</div>`;

    if (payload.raw_text) {
        html += `<section class="curator-record"><header><span>Curator rationale / raw response</span><small>verbatim</small></header><p class="curator-raw-text">${escapeHtml(payload.raw_text)}</p></section>`;
    }
    if (result.jit_skill) {
        html += `<section class="curator-record"><header><span>Just-in-time memory</span><small>exact output</small></header><p class="curator-raw-text">${escapeHtml(result.jit_skill)}</p></section>`;
    }
    ops.forEach((op, index) => {
        const args = op.arguments || {};
        html += `<section class="curator-record"><header><span>Operation ${index + 1} · ${escapeHtml(op.tool || 'unknown')}</span><small>${op.ok === false ? 'failed' : 'applied'}</small></header><dl>${curatorRows([
            ['tool', op.tool],
            ['status', op.ok],
            ['reason', op.reason],
            ...Object.entries(args).map(([key, value]) => [`argument · ${key}`, value])
        ])}</dl></section>`;
    });
    host.innerHTML = html;
}

function renderCuratorStats(index) {
    const host = document.getElementById('curatorStats');
    if (!host) return;
    if (activeMechanism === 'no-skill') {
        host.innerHTML = '<span class="placeholder-text">No curator is active for the no-skill baseline.</span>';
        return;
    }
    const opCounts = {};
    const tokenCounts = {};
    let calls = 0;
    let operations = 0;
    let applied = 0;
    let failed = 0;
    let skipped = 0;
    let jitGenerated = 0;
    let stored = 0;
    let retrievedTotal = 0;
    let underK = 0;
    let underKWithCapacity = 0;
    for (let i = 0; i <= index; i++) {
        const result = demoData.results[i];
        if (!result) continue;
        const curation = curationAt(i) || {};
        calls++;
        const ops = Array.isArray(curation.ops) ? curation.ops : [];
        operations += ops.length;
        ops.forEach((op) => {
            const key = op.tool || 'unknown';
            opCounts[key] = (opCounts[key] || 0) + 1;
            if (op.ok === false) failed++;
            else applied++;
        });
        if (curation.skipped) skipped++;
        if (result.jit_skill) jitGenerated++;
        if (result.stored_traj) stored++;
        const retrieved = Array.isArray(result.retrieved_skills) ? result.retrieved_skills.length : 0;
        retrievedTotal += retrieved;
        if (retrieved < 5) underK++;
        const bankBefore = Number(result.repo_size_before ?? result.bank_size_before ?? 0);
        if (retrieved < 5 && bankBefore >= 5) underKWithCapacity++;
        Object.entries(curation.usage || {}).forEach(([key, value]) => {
            const number = Number(value);
            if (Number.isFinite(number)) tokenCounts[key] = (tokenCounts[key] || 0) + number;
        });
    }
    const current = demoData.results[index] || {};
    const currentRetrieved = Array.isArray(current.retrieved_skills) ? current.retrieved_skills.length : 0;
    const bankAfter = current.repo_size_after ?? current.bank_size_after ?? 0;
    const cards = [
        [calls, 'curator calls'],
        [operations, 'operations'],
        [applied, 'applied'],
        [failed, 'failed'],
        [skipped, 'skipped'],
        [jitGenerated, 'JIT outputs'],
        [stored, 'stored traces'],
        [calls ? (retrievedTotal / calls).toFixed(2) : '—', 'mean retrieved'],
        [underK, 'calls below K=5'],
        [underKWithCapacity, 'below K with bank ≥5'],
        [currentRetrieved + '/5', 'current retrieval'],
        [bankAfter, 'current bank size']
    ];
    const opRows = Object.entries(opCounts).sort((a, b) => b[1] - a[1]).map(([key, value]) => `<div class="curator-stat-row"><span>${escapeHtml(key.replaceAll('_', ' '))}</span><b>${value}</b></div>`).join('');
    const tokenRows = Object.entries(tokenCounts).map(([key, value]) => `<div class="curator-stat-row"><span>${escapeHtml(key.replaceAll('_', ' '))}</span><b>${Math.round(value).toLocaleString()}</b></div>`).join('');
    host.innerHTML = `<div class="curator-stat-grid">${cards.map(([value, label]) => `<div class="curator-stat"><b>${escapeHtml(String(value))}</b><span>${escapeHtml(label)}</span></div>`).join('')}</div>
        <section class="curator-op-stats"><h4>Operations by type</h4>${opRows || '<div class="curator-stat-row"><span>No operation records</span><b>0</b></div>'}</section>
        <section class="curator-token-stats"><h4>Curator token usage</h4>${tokenRows || '<div class="curator-stat-row"><span>Not recorded for this mechanism</span><b>—</b></div>'}</section>`;
}

// Update skill panel
function updateSkillPanel(result, curation, replayIndex) {
    const panel = document.querySelector('.skill-panel');
    const content = panel && panel.querySelector('.panel-content');
    const note = document.getElementById('skillPanelNote');
    const noSkill = activeMechanism === 'no-skill';
    if (panel) panel.classList.toggle('is-empty', noSkill);
    if (content) content.hidden = noSkill;
    if (note) note.hidden = noSkill;
    if (noSkill) {
        currentSkillBankRecords = [];
        utilitySkillRecords = [];
        renderSkillUtilityPanel(null);
        renderSkillCategoryDistribution();
        return;
    }
    if (note) {
        const epoch = result && result._epoch ? `epoch ${result._epoch} · ` : '';
        note.textContent = `${epoch}replay sample ${replayIndex + 1}/${demoData.results.length} · bank after ${result.id}`;
    }

    // Query
    document.getElementById('currentQuery').innerHTML = `"${escapeHtml(result.task_description)}"`;

    // Retrieved skills
    const skillsDiv = document.getElementById('retrievedSkills');
    if (result.retrieved_skills && result.retrieved_skills.length > 0) {
        skillsDiv.innerHTML = result.retrieved_skills.map((s, index) =>
            `<button type="button" class="skill-tag" data-open-skill="${index}">${escapeHtml(skillLabel(s))}</button>`
        ).join('');
    } else {
        skillsDiv.innerHTML = '<span class="skill-tag empty">No memory (cold start)</span>';
    }
    const retrievalNote = document.getElementById('retrievalKNote');
    if (retrievalNote) {
        const retrievedCount = Array.isArray(result.retrieved_skills) ? result.retrieved_skills.length : 0;
        const bankBefore = Number(result.repo_size_before ?? result.bank_size_before ?? 0);
        retrievalNote.classList.toggle('is-warning', retrievedCount < 5 && bankBefore >= 5);
        if (retrievedCount < 5 && bankBefore < 5) {
            retrievalNote.textContent = `Retrieved ${retrievedCount}/5 because only ${bankBefore} bank item${bankBefore === 1 ? '' : 's'} existed before this sample.`;
        } else if (retrievedCount < 5) {
            const uniqueCount = new Set((result.retrieved_skills || []).map((item) => skillLabel(item))).size;
            retrievalNote.textContent = `Retrieved ${retrievedCount} of the maximum K=5 from a bank of ${bankBefore}. Bank size is not limiting${uniqueCount === retrievedCount ? ' and the returned items are unique' : ''}. The run stores no candidate scores or drop reason, so relevance filtering cannot be distinguished from an upstream retrieval issue.`;
        } else {
            retrievalNote.textContent = 'Retrieved the maximum K=5 items.';
        }
    }

    // Curation operation
    const opDiv = document.getElementById('curationOp');
    if (result.jit_skill) {
        opDiv.innerHTML = `<span class="op-badge update">CURATED</span>${escapeHtml(result.jit_skill)}`;
    } else if (curation && curation.ops && curation.ops.length > 0) {
        opDiv.innerHTML = curation.ops.map((op) => {
            let opClass = 'update';
            let opLabel = 'UPDATE';
            if (op.tool === 'new_skill_insert') {
                opClass = 'insert';
                opLabel = 'INSERT';
            } else if (op.tool === 'skill_delete') {
                opClass = 'delete';
                opLabel = 'DELETE';
            }
            const args = op.arguments || {};
            let opText = args.skill_name || op.tool || 'op';
            if (args.new_name && args.new_name !== args.skill_name) opText += ` → ${args.new_name}`;
            return `<div class="curation-decision"><span class="op-badge ${opClass}">${opLabel}</span>${escapeHtml(opText)}</div>`;
        }).join('');
    } else {
        opDiv.innerHTML = '<span class="placeholder-text">No curation</span>';
    }
    renderCuratorOutput(result, curation);

    // Result badge
    const resultDiv = document.getElementById('resultBadge');
    if (result.success) {
        resultDiv.innerHTML = `✓ SUCCESS (${result.n_turns} steps)`;
        resultDiv.className = 'result-badge success';
    } else {
        resultDiv.innerHTML = `✗ FAILED (${result.fail_reason || 'Unknown'})`;
        resultDiv.className = 'result-badge failure';
    }

    const judgeDiv = document.getElementById('judgeBadge');
    if (judgeDiv) {
        if (result.judge_success === 1 || result.judge_success === true) {
            judgeDiv.textContent = '✓ JUDGE: SUCCESS';
            judgeDiv.className = 'result-badge success';
        } else if (result.judge_success === 0 || result.judge_success === false) {
            judgeDiv.textContent = '✗ JUDGE: FAILED';
            judgeDiv.className = 'result-badge failure';
        } else {
            judgeDiv.textContent = 'Not recorded';
            judgeDiv.className = 'result-badge neutral';
        }
    }

    renderSkillBank(replayIndex);
    wireRetrievedSkillButtons(skillsDiv, result.retrieved_skills || []);
}

// Update stats
function updateStats(upToIndex) {
    if (!document.getElementById('totalTasks')) return;
    const visibleResults = demoData.results.slice(0, Math.max(0, upToIndex + 1));
    const totalTasks = visibleResults.length;
    const successTasks = visibleResults.filter(r => r.success).length;
    const failedTasks = totalTasks - successTasks;
    const skillBankSize = visibleResults[visibleResults.length - 1]?.repo_size_after || 0;

    const steps = visibleResults.filter(r => r.n_turns != null).map(r => Number(r.n_turns)).filter(Number.isFinite);
    const successSteps = visibleResults.filter(r => r.success && r.n_turns != null).map(r => Number(r.n_turns)).filter(Number.isFinite);
    const failureSteps = visibleResults.filter(r => !r.success && r.n_turns != null).map(r => Number(r.n_turns)).filter(Number.isFinite);
    const tokens = visibleResults.map(r => Number(r.total_tokens)).filter(Number.isFinite);
    const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const median = (values) => {
        if (!values.length) return null;
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    const fmt = (value, digits) => value == null ? '—' : value.toFixed(digits == null ? 1 : digits);
    const budgetHits = visibleResults.filter(r => {
        const turns = r.n_turns == null ? NaN : Number(r.n_turns);
        const budget = Number(r.max_turns);
        return Number.isFinite(turns) && Number.isFinite(budget) && turns >= budget;
    }).length;

    document.getElementById('totalTasks').textContent = totalTasks;
    document.getElementById('successTasks').textContent = successTasks;
    document.getElementById('failedTasks').textContent = failedTasks;
    document.getElementById('skillBankSize').textContent = skillBankSize;
    document.getElementById('successRate').textContent = totalTasks ? Math.round(100 * successTasks / totalTasks) + '%' : '—';
    document.getElementById('meanSteps').textContent = fmt(mean(steps));
    document.getElementById('medianSteps').textContent = fmt(median(steps));
    document.getElementById('meanSuccessSteps').textContent = fmt(mean(successSteps));
    document.getElementById('meanFailureSteps').textContent = fmt(mean(failureSteps));
    document.getElementById('budgetExhausted').textContent = budgetHits;
    document.getElementById('meanTokens').textContent = mean(tokens) == null ? '—' : Math.round(mean(tokens)).toLocaleString();

    // Task type breakdown
    const byType = {};
    visibleResults.forEach(r => {
        if (!byType[r.task_type]) {
            byType[r.task_type] = { total: 0, success: 0 };
        }
        byType[r.task_type].total++;
        if (r.success) byType[r.task_type].success++;
    });

    let breakdownHtml = '';
    for (const [type, stats] of Object.entries(byType)) {
        const pct = stats.total > 0 ? Math.round(100 * stats.success / stats.total) : 0;
        breakdownHtml += `
            <div class="type-row">
                <span class="type-name">${TASK_TYPE_NAMES[type] || type}</span>
                <span class="type-stats">${stats.success}/${stats.total} (${pct}%)</span>
            </div>
        `;
    }
    document.getElementById('taskTypeBreakdown').innerHTML = breakdownHtml;
}

// Update seen / unseen success charts
function unseenCheckpointTag(ck) {
    if (!ck) return '';
    if (ck.epoch === 0) {
        return String(ck.leaf || '').indexOf('no-skill') === 0
            ? 'epoch 0 · no-skill test'
            : 'epoch 0';
    }
    return 'epoch ' + ck.epoch;
}

function outcomeRowHtml(epoch, items, options) {
    const interactive = options && options.interactive;
    const current = options && options.current;
    const successes = items.filter((item) => item.row.success).length;
    const cells = items.map((item) => {
        const state = item.row.success ? 'success' : 'failure';
        const replayState = interactive
            ? (item.index === currentIndex ? ' is-current' : item.index < currentIndex ? ' is-past' : ' is-future')
            : '';
        const label = `${item.row.id || 'episode'} · ${state}`;
        if (interactive) {
            return `<button type="button" class="eval-outcome-cell ${state}${replayState}" data-seen-index="${item.index}" role="listitem" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></button>`;
        }
        if (item.unseenKey) {
            return `<button type="button" class="eval-outcome-cell ${state}" data-unseen-key="${escapeHtml(item.unseenKey)}" role="listitem" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></button>`;
        }
        return `<span class="eval-outcome-cell ${state}" role="listitem" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></span>`;
    }).join('');
    return `<div class="eval-outcome-row${current ? ' is-current' : ''}">
        <div class="eval-outcome-row-label"><b>Epoch ${epoch}</b><span>${successes}/${items.length}</span></div>
        <div class="eval-outcome-strip" role="list">${cells || '<span class="placeholder-text">No evaluation records</span>'}</div>
    </div>`;
}

function renderOutcomeRows() {
    const seenHost = document.getElementById('seenOutcomeRows');
    if (seenHost) {
        const epochs = new Map();
        seenResults.forEach((row, index) => {
            const epoch = Number(row._epoch) || 1;
            if (!epochs.has(epoch)) epochs.set(epoch, []);
            epochs.get(epoch).push({ row: row, index: index });
        });
        seenHost.innerHTML = Array.from(epochs.entries()).sort((a, b) => a[0] - b[0])
            .map(([epoch, items]) => outcomeRowHtml(epoch, items, { interactive: true }))
            .join('') || '<span class="placeholder-text">No seen evaluation records.</span>';
    }

    const unseenHost = document.getElementById('unseenOutcomeRows');
    if (unseenHost) {
        let checkpoints = unseenCheckpoints.filter((checkpoint) => checkpoint.epoch > 0);
        if (!checkpoints.length) checkpoints = unseenCheckpoints.filter((checkpoint) => checkpoint.epoch === 0);
        const activeCheckpoint = latestCheckpoint(currentIndex);
        unseenHost.innerHTML = checkpoints.map((checkpoint) => {
            const items = checkpoint.rows.map((row, index) => ({ row: row, index: index, unseenKey: `${checkpoint.epoch}:${index}` }));
            return outcomeRowHtml(checkpoint.epoch, items, { current: checkpoint === activeCheckpoint });
        }).join('') || '<span class="placeholder-text">No unseen evaluation records.</span>';
    }
}

function updateSuccessCharts() {
    try {
        const seenRows = currentIndex < 0 ? [] : seenResults.slice(0, currentIndex + 1);
        fillRateChart(seenChart, seenRows, 'Seen · valid_seen', CHART_COLORS.primary, CHART_COLORS.primaryLight);
        const ck = latestCheckpoint(currentIndex);
        const unseenLen = seenRows.length || (ck ? 1 : 0);
        fillUnseenChart(unseenLen);

        const seenStats = rateStats(seenRows);
        const unseenStats = ck ? rateStats(ck.rows) : { n: 0, ok: 0, pct: null };
        const seenLabel = document.getElementById('seenRateLabel');
        const unseenLabel = document.getElementById('unseenRateLabel');
        if (seenLabel) {
            seenLabel.textContent = seenStats.n ? `${seenStats.ok}/${seenStats.n} (${seenStats.pct}%)` : '0';
        }
        if (unseenLabel) {
            unseenLabel.textContent = unseenStats.n
                ? `${unseenStats.ok}/${unseenStats.n} (${unseenStats.pct}%) · ${unseenCheckpointTag(ck)}`
                : '—';
        }
        renderOutcomeRows();
    } catch (err) {
        console.error('Charts failed:', err);
    }
}

// Play/pause controls
function togglePlay() {
    if (isPlaying) {
        stopPlay();
    } else {
        startPlay();
    }
}

function startPlay() {
    isPlaying = true;
    document.getElementById('playBtn').textContent = '⏸ Pause';

    const speed = parseInt(document.getElementById('speedSelect').value);
    playInterval = setInterval(() => {
        if (currentIndex < demoData.results.length - 1) {
            currentIndex++;
            document.getElementById('timelineSlider').value = currentIndex;
            updateVisualization(currentIndex);
            notifyParentSeek(currentIndex);
        } else {
            stopPlay();
        }
    }, speed);
}

function stopPlay() {
    isPlaying = false;
    document.getElementById('playBtn').textContent = '▶ Play';
    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }
}

function seekTo(index) {
    if (!demoData || !demoData.results.length) return;
    stopPlay();
    currentIndex = Math.max(-1, Math.min(index, demoData.results.length - 1));
    const slider = document.getElementById('timelineSlider');
    if (slider) slider.value = Math.max(0, currentIndex);
    if (currentIndex < 0) updateVisualizationEmpty();
    else updateVisualization(currentIndex);
}

function applySeekPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (typeof payload.index === 'number' && !Number.isNaN(payload.index)) {
        seekTo(payload.index);
        return;
    }
    if (payload.taskId) {
        const index = demoData.results.findIndex((r) => r.id === payload.taskId);
        if (index >= 0) seekTo(index);
        return;
    }
    if (payload.taskType) {
        const index = demoData.results.findIndex((r) => r.task_type === payload.taskType);
        if (index >= 0) seekTo(index);
    }
}

function setupPanelFolding() {
    const standardPanels = Array.from(document.querySelectorAll('.evaluation-panel, .trajectory-panel, .skill-panel'));
    standardPanels.forEach((panel) => {
        const heading = panel.querySelector(':scope > .panel-title');
        if (!heading || heading.querySelector('.panel-fold-btn')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'panel-fold-btn';
        button.textContent = '−';
        button.setAttribute('aria-expanded', 'true');
        button.setAttribute('aria-label', 'Collapse panel');
        button.addEventListener('click', () => setDashboardPanel(panel, !panel.classList.contains('is-user-collapsed')));
        heading.appendChild(button);
    });
}

function setDashboardPanel(panel, collapsed) {
    if (!panel) return;
    panel.classList.toggle('is-user-collapsed', collapsed);
    const button = panel.querySelector(':scope > .panel-title .panel-fold-btn');
    if (button) {
        button.textContent = collapsed ? '+' : '−';
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        button.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
    }
}

function setDashboardPanels(collapsed) {
    document.querySelectorAll('.evaluation-panel, .trajectory-panel, .skill-panel').forEach((panel) => setDashboardPanel(panel, collapsed));
}

function setupEmbedBridge() {
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.source !== 'sea-playground') return;
        if (data.type === 'seek') applySeekPayload(data);
        if (data.type === 'play') startPlay();
        if (data.type === 'stop') stopPlay();
        if (data.type === 'fold-panels') setDashboardPanels(!!data.collapsed);
    });

    const params = new URLSearchParams(location.search);
    if (params.has('index')) applySeekPayload({ index: parseInt(params.get('index'), 10) });
    else if (params.has('task')) applySeekPayload({ taskId: params.get('task') });
    else if (params.has('type')) applySeekPayload({ taskType: params.get('type') });

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'memcurator', type: 'ready' }, '*');
    }
}

// Utility: escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
