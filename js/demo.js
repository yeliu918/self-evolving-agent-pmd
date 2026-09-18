// MemCurator Demo JavaScript

let demoData = null;
let currentIndex = 0;
let isPlaying = false;
let playInterval = null;
let rewardChart = null;
let bankChart = null;

// Task type display names
const TASK_TYPE_NAMES = {
    'look_at_obj_in_light': 'Look at Object',
    'pick_and_place': 'Pick & Place',
    'pick_clean_then_place_in_recep': 'Clean & Place',
    'pick_cool_then_place_in_recep': 'Cool & Place',
    'pick_heat_then_place_in_recep': 'Heat & Place'
};

// Task type colors (Salesforce palette)
const TASK_TYPE_COLORS = {
    'look_at_obj_in_light': '#0176d3',      // Salesforce Blue
    'pick_and_place': '#2e844a',             // Success Green
    'pick_clean_then_place_in_recep': '#fe9339',  // Orange
    'pick_cool_then_place_in_recep': '#5a67d8',   // Purple
    'pick_heat_then_place_in_recep': '#c23934'    // Red
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
    try {
        const response = await fetch('data/demo_data.json');
        demoData = await response.json();
        console.log('Loaded demo data:', demoData.metadata);

        setupUI();
        setupCharts();
        updateVisualization(0);
        setupCaseStudy();
        setupEmbedBridge();
    } catch (error) {
        console.error('Failed to load demo data:', error);
        const host = document.querySelector('main.demo-container') || document.body;
        host.innerHTML = '<div style="padding: 2rem; color: #c23934;">Failed to load demo data. Please ensure <code>data/demo_data.json</code> exists and open this page via HTTP (e.g. <code>python3 -m http.server 8080</code>), not as a local file.</div>';
    }
}

// Setup UI event listeners
function setupUI() {
    // Timeline slider
    const slider = document.getElementById('timelineSlider');
    slider.max = demoData.results.length - 1;
    slider.addEventListener('input', (e) => {
        currentIndex = parseInt(e.target.value);
        updateVisualization(currentIndex);
    });

    // Play button
    document.getElementById('playBtn').addEventListener('click', togglePlay);

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', () => {
        stopPlay();
        currentIndex = 0;
        slider.value = 0;
        updateVisualization(0);
    });

    // Speed select
    document.getElementById('speedSelect').addEventListener('change', (e) => {
        if (isPlaying) {
            stopPlay();
            startPlay();
        }
    });

    // Chart mode
    document.querySelectorAll('input[name="chartMode"]').forEach(radio => {
        radio.addEventListener('change', () => updateRewardChart());
    });

    // Build task tree
    buildTaskTree();
}

// Build task tree in left panel
function buildTaskTree() {
    const taskTree = document.getElementById('taskTree');
    const tasksByType = {};

    demoData.results.forEach((task, index) => {
        const type = task.task_type;
        if (!tasksByType[type]) {
            tasksByType[type] = [];
        }
        tasksByType[type].push({ ...task, index });
    });

    let html = '';
    for (const [type, tasks] of Object.entries(tasksByType)) {
        const successCount = tasks.filter(t => t.success).length;
        html += `
            <div class="task-type-group">
                <div class="task-type-header" data-type="${type}">
                    <span>${TASK_TYPE_NAMES[type] || type}</span>
                    <span class="task-type-count">${successCount}/${tasks.length}</span>
                </div>
                <div class="task-list" id="list-${type}">
                    ${tasks.map(t => `
                        <div class="task-item ${t.success ? 'success' : 'failure'}"
                             data-index="${t.index}"
                             data-id="${t.id}">
                            ${t.id.replace('val:', '')}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    taskTree.innerHTML = html;

    // Add event listeners
    taskTree.querySelectorAll('.task-type-header').forEach(header => {
        header.addEventListener('click', () => {
            const type = header.dataset.type;
            document.getElementById(`list-${type}`).classList.toggle('expanded');
        });
    });

    taskTree.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('click', () => {
            currentIndex = parseInt(item.dataset.index);
            document.getElementById('timelineSlider').value = currentIndex;
            updateVisualization(currentIndex);
        });
    });

    // Expand first group
    document.querySelector('.task-list').classList.add('expanded');
}

// Setup charts
function setupCharts() {
    // Reward chart
    const rewardCtx = document.getElementById('rewardChart').getContext('2d');
    rewardChart = new Chart(rewardCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Success Rate',
                data: [],
                borderColor: CHART_COLORS.primary,
                backgroundColor: CHART_COLORS.primaryLight,
                fill: true,
                tension: 0.3,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Task Index', color: CHART_COLORS.textColor },
                    ticks: { color: CHART_COLORS.textColor },
                    grid: { color: CHART_COLORS.gridColor }
                },
                y: {
                    title: { display: true, text: 'Success Rate (%)', color: CHART_COLORS.textColor },
                    ticks: { color: CHART_COLORS.textColor },
                    grid: { color: CHART_COLORS.gridColor },
                    min: 0,
                    max: 100
                }
            }
        }
    });

    // Bank size chart
    const bankCtx = document.getElementById('bankChart').getContext('2d');
    bankChart = new Chart(bankCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Skill Bank Size',
                data: [],
                borderColor: CHART_COLORS.purple,
                backgroundColor: CHART_COLORS.purpleLight,
                fill: true,
                stepped: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Task Index', color: CHART_COLORS.textColor },
                    ticks: { color: CHART_COLORS.textColor },
                    grid: { color: CHART_COLORS.gridColor }
                },
                y: {
                    title: { display: true, text: 'Skills', color: CHART_COLORS.textColor },
                    ticks: { color: CHART_COLORS.textColor, stepSize: 1 },
                    grid: { color: CHART_COLORS.gridColor },
                    min: 0
                }
            }
        }
    });
}

// Update all visualizations for current index
function updateVisualization(index) {
    const result = demoData.results[index];
    const curation = demoData.curation[index];
    const trajectory = demoData.trajectories[result.id];

    // Update timeline label
    document.getElementById('currentTaskLabel').textContent = `Current: ${index} (${result.id})`;

    // Update task tree selection
    document.querySelectorAll('.task-item').forEach(item => {
        item.classList.remove('selected');
        const itemIndex = parseInt(item.dataset.index);
        item.classList.toggle('hidden', itemIndex > index);
    });
    const selectedItem = document.querySelector(`.task-item[data-index="${index}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        // Expand parent group
        const parentList = selectedItem.closest('.task-list');
        if (parentList) parentList.classList.add('expanded');
    }

    // Update trajectory viewer
    updateTrajectoryViewer(trajectory, result);

    // Update skill panel
    updateSkillPanel(result, curation);

    // Update stats
    updateStats(index);

    // Update charts
    updateRewardChart();
    updateBankChart();
}

// Update trajectory viewer
function updateTrajectoryViewer(trajectory, result) {
    const viewer = document.getElementById('trajectoryViewer');

    if (!trajectory || trajectory.length === 0) {
        viewer.innerHTML = '<div class="placeholder-text">No trajectory data available</div>';
        return;
    }

    let html = `<div class="trajectory-header" style="padding: 0.5rem; background: var(--bg-tertiary); margin-bottom: 0.5rem; border-radius: 4px;">
        <strong>${result.task_description}</strong>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
            ${result.n_turns} steps | ${result.success ? '✓ Success' : '✗ Failed: ' + result.fail_reason}
        </div>
    </div>`;

    trajectory.forEach(step => {
        const isSuccess = step.done && step.reward > 0;
        html += `
            <div class="trajectory-step ${isSuccess ? 'success-step' : ''}">
                <div class="step-header">
                    <span class="step-number">Step ${step.step}</span>
                    <span class="step-reward ${step.reward > 0 ? 'has-reward' : ''}">
                        ${step.reward > 0 ? `+${step.reward}` : '0'}
                    </span>
                </div>
                <div class="step-action">${escapeHtml(step.action)}</div>
                <div class="step-feedback">${escapeHtml(step.env_feedback)}</div>
            </div>
        `;
    });

    viewer.innerHTML = html;
}

// Update skill panel
function updateSkillPanel(result, curation) {
    // Query
    document.getElementById('currentQuery').innerHTML = `"${escapeHtml(result.task_description)}"`;

    // Retrieved skills
    const skillsDiv = document.getElementById('retrievedSkills');
    if (result.retrieved_skills && result.retrieved_skills.length > 0) {
        skillsDiv.innerHTML = result.retrieved_skills.map(s =>
            `<span class="skill-tag">${escapeHtml(s)}</span>`
        ).join('');
    } else {
        skillsDiv.innerHTML = '<span class="skill-tag empty">No memory (cold start)</span>';
    }

    // Curation operation
    const opDiv = document.getElementById('curationOp');
    if (curation && curation.ops && curation.ops.length > 0) {
        const op = curation.ops[0];
        let opClass = 'update';
        let opLabel = 'UPDATE';
        if (op.tool === 'new_skill_insert') {
            opClass = 'insert';
            opLabel = 'INSERT';
        } else if (op.tool === 'skill_delete') {
            opClass = 'delete';
            opLabel = 'DELETE';
        }

        let opText = op.arguments.skill_name;
        if (op.arguments.new_name && op.arguments.new_name !== op.arguments.skill_name) {
            opText += ` → ${op.arguments.new_name}`;
        }

        opDiv.innerHTML = `<span class="op-badge ${opClass}">${opLabel}</span>${escapeHtml(opText)}`;
    } else {
        opDiv.innerHTML = '<span class="placeholder-text">No curation</span>';
    }

    // Result badge
    const resultDiv = document.getElementById('resultBadge');
    if (result.success) {
        resultDiv.innerHTML = `✓ SUCCESS (${result.n_turns} steps)`;
        resultDiv.className = 'result-badge success';
    } else {
        resultDiv.innerHTML = `✗ FAILED (${result.fail_reason || 'Unknown'})`;
        resultDiv.className = 'result-badge failure';
    }
}

// Update stats
function updateStats(upToIndex) {
    const visibleResults = demoData.results.slice(0, upToIndex + 1);
    const totalTasks = visibleResults.length;
    const successTasks = visibleResults.filter(r => r.success).length;
    const failedTasks = totalTasks - successTasks;
    const skillBankSize = visibleResults[visibleResults.length - 1]?.repo_size_after || 0;

    document.getElementById('totalTasks').textContent = totalTasks;
    document.getElementById('successTasks').textContent = successTasks;
    document.getElementById('failedTasks').textContent = failedTasks;
    document.getElementById('skillBankSize').textContent = skillBankSize;

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

// Update reward chart
function updateRewardChart() {
    const mode = document.querySelector('input[name="chartMode"]:checked').value;
    const upToIndex = currentIndex;
    const visibleResults = demoData.results.slice(0, upToIndex + 1);

    if (mode === 'cumulative') {
        // Cumulative success rate
        let cumSum = 0;
        const data = visibleResults.map((r, i) => {
            cumSum += r.success ? 1 : 0;
            return Math.round(100 * cumSum / (i + 1));
        });

        rewardChart.data.labels = visibleResults.map((_, i) => i);
        rewardChart.data.datasets = [{
            label: 'Cumulative Success Rate',
            data: data,
            borderColor: CHART_COLORS.primary,
            backgroundColor: CHART_COLORS.primaryLight,
            fill: true,
            tension: 0.3,
            pointRadius: 2
        }];
    } else if (mode === 'rolling') {
        // Rolling average (window=10)
        const window = 10;
        const data = visibleResults.map((_, i) => {
            const start = Math.max(0, i - window + 1);
            const slice = visibleResults.slice(start, i + 1);
            const sum = slice.reduce((acc, r) => acc + (r.success ? 1 : 0), 0);
            return Math.round(100 * sum / slice.length);
        });

        rewardChart.data.labels = visibleResults.map((_, i) => i);
        rewardChart.data.datasets = [{
            label: 'Rolling Success Rate (10)',
            data: data,
            borderColor: CHART_COLORS.success,
            backgroundColor: CHART_COLORS.successLight,
            fill: true,
            tension: 0.3,
            pointRadius: 2
        }];
    } else if (mode === 'byType') {
        // By task type
        const byType = {};
        visibleResults.forEach((r, i) => {
            if (!byType[r.task_type]) {
                byType[r.task_type] = [];
            }
            byType[r.task_type].push({ index: i, success: r.success });
        });

        rewardChart.data.labels = visibleResults.map((_, i) => i);
        rewardChart.data.datasets = Object.entries(byType).map(([type, entries]) => {
            // Create sparse data array
            const data = new Array(visibleResults.length).fill(null);
            let cumSum = 0;
            entries.forEach((e, j) => {
                cumSum += e.success ? 1 : 0;
                data[e.index] = Math.round(100 * cumSum / (j + 1));
            });

            return {
                label: TASK_TYPE_NAMES[type] || type,
                data: data,
                borderColor: TASK_TYPE_COLORS[type] || '#8b98a5',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3,
                pointRadius: 3,
                spanGaps: true
            };
        });
    }

    rewardChart.update('none');
}

// Update bank chart
function updateBankChart() {
    const upToIndex = currentIndex;
    const visibleResults = demoData.results.slice(0, upToIndex + 1);

    bankChart.data.labels = visibleResults.map((_, i) => i);
    bankChart.data.datasets[0].data = visibleResults.map(r => r.repo_size_after);
    bankChart.update('none');
}

// Setup case study
function setupCaseStudy() {
    const caseStudyIds = ['val:0000', 'val:0001', 'val:0002'];
    const cardsDiv = document.getElementById('caseStudyCards');
    const insightDiv = document.getElementById('caseStudyInsight');

    // Build case study cards
    let cardsHtml = '';
    caseStudyIds.forEach((id, i) => {
        const result = demoData.results.find(r => r.id === id);
        const curation = demoData.curation.find(c => c.id === id);

        if (!result) return;

        let statusClass = result.success ? 'success' : 'failure';
        let statusText = result.success ? `✓ ${result.n_turns} steps` : `✗ ${result.n_turns} steps`;
        if (i === 0 && result.retrieved_skills.length === 0) {
            statusClass = 'cold';
            statusText = `Cold Start ✓`;
        }

        const opText = curation?.ops?.[0]?.tool?.replace('_', ' ').toUpperCase() || '-';
        const skillName = curation?.ops?.[0]?.arguments?.skill_name || '-';

        cardsHtml += `
            <div class="case-card" data-id="${id}">
                <div class="case-card-header">
                    <span class="case-card-id">${id}</span>
                    <span class="case-card-status ${statusClass}">${statusText}</span>
                </div>
                <div class="case-card-body">
                    <div class="case-card-label">Task</div>
                    <div class="case-card-value">${result.task_description}</div>

                    <div class="case-card-label">Retrieved</div>
                    <div class="case-card-value">${result.retrieved_skills.length > 0 ? result.retrieved_skills[0] : '(none)'}</div>

                    <div class="case-card-label">Curation</div>
                    <div class="case-card-value">${opText}: ${skillName}</div>
                </div>
            </div>
        `;

        if (i < caseStudyIds.length - 1) {
            cardsHtml += '<div class="case-arrow">→</div>';
        }
    });
    cardsDiv.innerHTML = cardsHtml;

    // Insight
    insightDiv.innerHTML = `
        <div class="insight-title">💡 Key Insight</div>
        <div class="insight-text">
            <strong>val:0001</strong> failed because the lamp was on <em>dresser 1</em> while the bowl was on <em>desk 1</em> —
            they weren't co-located. The agent spent 30 steps trying different approaches but never realized the spatial requirement.
            <br><br>
            After the failure, the curator updated the skill name from "Inspect Object Under a Lamp" to "Inspect Object Using a Desk Lamp."
            When <strong>val:0002</strong> encountered the same task with both objects on the same desk,
            the updated skill helped the agent succeed in just 3 steps.
            <br><br>
            <strong>Same task description, different environment layouts, memory-augmented agent learned to handle both.</strong>
        </div>
    `;

    // Case study button
    document.getElementById('showCaseStudy').addEventListener('click', () => {
        currentIndex = 0;
        document.getElementById('timelineSlider').value = 0;
        updateVisualization(0);

        // Auto-expand look_at_obj_in_light group
        document.querySelectorAll('.task-list').forEach(l => l.classList.remove('expanded'));
        document.getElementById('list-look_at_obj_in_light')?.classList.add('expanded');
    });

    // Card click
    cardsDiv.querySelectorAll('.case-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const index = demoData.results.findIndex(r => r.id === id);
            if (index >= 0) {
                currentIndex = index;
                document.getElementById('timelineSlider').value = index;
                updateVisualization(index);
            }
        });
    });
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
    currentIndex = Math.max(0, Math.min(index, demoData.results.length - 1));
    const slider = document.getElementById('timelineSlider');
    if (slider) slider.value = currentIndex;
    updateVisualization(currentIndex);

    document.querySelectorAll('.task-list').forEach((list) => list.classList.remove('expanded'));
    const selectedItem = document.querySelector(`.task-item[data-index="${currentIndex}"]`);
    if (selectedItem) {
        const parentList = selectedItem.closest('.task-list');
        if (parentList) parentList.classList.add('expanded');
        selectedItem.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    if (rewardChart) rewardChart.resize();
    if (bankChart) bankChart.resize();
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

function setupEmbedBridge() {
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.source !== 'sea-playground') return;
        if (data.type === 'seek') applySeekPayload(data);
        if (data.type === 'play') startPlay();
        if (data.type === 'stop') stopPlay();
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
