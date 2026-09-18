// Landing page: tabbed hub (Vision | Evolution Playground | Publications)
document.addEventListener('DOMContentLoaded', function() {
    const VALID_TABS = ['vision', 'playground', 'publications'];
    const tabs = Array.from(document.querySelectorAll('.site-tab'));
    const panels = {
        vision: document.getElementById('panel-vision'),
        playground: document.getElementById('panel-playground'),
        publications: document.getElementById('panel-publications')
    };

    function tabFromHash() {
        const raw = (window.location.hash || '').replace('#', '').toLowerCase();
        if (raw === 'publications' || raw === 'papers' || raw === 'vision' || raw === 'playground' || raw === 'evolution-playground') return 'publications';
        return 'publications';
    }

    function activateTab(name, { updateHash = true, focusTab = false } = {}) {
        if (name === 'vision' || name === 'playground' || !VALID_TABS.includes(name)) name = 'publications';

        tabs.forEach((tab) => {
            const isActive = tab.dataset.tab === name;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tab.tabIndex = isActive ? 0 : -1;
            if (isActive && focusTab) tab.focus();
        });

        Object.entries(panels).forEach(([key, panel]) => {
            if (!panel) return;
            const isActive = key === name;
            panel.classList.toggle('is-active', isActive);
            panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        document.documentElement.dataset.hub = name;

        if (updateHash) {
            const nextHash = '#' + name;
            if (window.location.hash !== nextHash) {
                history.replaceState(null, '', nextHash);
            }
        }
    }

    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            activateTab(tab.dataset.tab);
        });

        tab.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') {
                return;
            }
            event.preventDefault();
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tabs.length - 1;
            activateTab(tabs[next].dataset.tab, { focusTab: true });
        });
    });

    document.querySelectorAll('.footer-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            activateTab(tab.dataset.tab);
            document.getElementById('main-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    window.addEventListener('hashchange', () => {
        activateTab(tabFromHash(), { updateHash: false });
    });

    activateTab(tabFromHash(), { updateHash: false });

    /* ------------------------------------------------------------------
     * Test-time evolution overview (generic mechanism animation)
     * ------------------------------------------------------------------ */
    (function initTestTimeEvolution() {
        const root = document.getElementById('tte-overview');
        const svg = document.getElementById('tte-pipeline');
        if (!root || !svg) return;

        const NW = 148, NH = 86;
        const NODES = [
            { id: 'task',       label: 'Task',       x: 0.10, y: 0.22 },
            { id: 'memory',     label: 'Memory',     x: 0.10, y: 0.72 },
            { id: 'executor',   label: 'Executor',   x: 0.36, y: 0.47 },
            { id: 'trajectory', label: 'Trajectory', x: 0.60, y: 0.22 },
            { id: 'verifier',   label: 'Verifier',   x: 0.60, y: 0.72 },
            { id: 'curator',    label: 'Curator',    x: 0.86, y: 0.30 },
            { id: 'gate',       label: 'Gate',       x: 0.86, y: 0.72 }
        ];
        const SKELETON = [
            ['task', 'executor'],
            ['memory', 'executor'],
            ['executor', 'trajectory'],
            ['trajectory', 'verifier'],
            ['verifier', 'curator'],
            ['curator', 'gate'],
            ['gate', 'memory']
        ];
        const ICONS = {
            task: '<rect x="4" y="3" width="13" height="18" rx="2"/><path d="M8 8h6M8 12h6M8 16h4"/>',
            memory: '<ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
            executor: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/>',
            trajectory: '<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>',
            verifier: '<path d="M9 12l2.2 2.2L16 9.5"/><circle cx="12" cy="12" r="8.5"/>',
            curator: '<path d="M12 4l1.6 4.6H18l-3.7 2.8 1.4 4.6L12 13.6 8.3 16l1.4-4.6L6 8.6h4.4z"/>',
            gate: '<path d="M5 8h14v10H5z"/><path d="M9 8V6a3 3 0 016 0v2"/><circle cx="12" cy="13" r="1.4"/>'
        };

        const FRAMES = [
            {
                active: ['task'],
                edge: null,
                chip: { kind: 'task', label: 'NEW TASK', text: 'A fresh problem arrives at inference time — no weight update scheduled.' },
                title: 'A new task arrives',
                body: 'Test-time evolution starts when the agent faces a problem. The policy is already frozen; the only thing that can change is what experience it is allowed to use.',
                pillars: [
                    ['MODE', 'Inference'],
                    ['WEIGHTS', 'Frozen'],
                    ['SIGNAL', '—'],
                    ['MEMORY', 'Loaded']
                ]
            },
            {
                active: ['task', 'memory', 'executor'],
                edge: ['memory', 'executor'],
                token: 'skills',
                chip: { kind: 'recall', label: 'RECALL', text: 'Retrieve what survived earlier gates — skills, notes, or curated briefings.' },
                title: 'Condition the frozen executor',
                body: 'Memory does not retrain the model. It conditions the same frozen executor with whatever experience the gate previously allowed to persist.',
                pillars: [
                    ['MODE', 'Read'],
                    ['WEIGHTS', 'Frozen'],
                    ['SIGNAL', '—'],
                    ['MEMORY', 'Retrieved']
                ]
            },
            {
                active: ['executor', 'trajectory'],
                edge: ['executor', 'trajectory'],
                token: 'actions',
                chip: { kind: 'act', label: 'ATTEMPT', text: 'The executor rolls out a trajectory: observations, actions, and intermediate state.' },
                title: 'Act — leave a trajectory',
                body: 'The attempt is the raw material of evolution. Success or failure both matter: the transcript is what later stages will learn from.',
                pillars: [
                    ['MODE', 'Act'],
                    ['WEIGHTS', 'Frozen'],
                    ['SIGNAL', 'Pending'],
                    ['MEMORY', 'In use']
                ]
            },
            {
                active: ['trajectory', 'verifier'],
                edge: ['trajectory', 'verifier'],
                token: 'outcome',
                chip: { kind: 'signal', label: 'SIGNAL', text: 'Verifier returns success / failure / reward — an external grade of the attempt.' },
                title: 'Verify the outcome',
                body: 'A verifier (environment check, judge, reward) turns the trajectory into a training signal for memory — still without touching weights.',
                pillars: [
                    ['MODE', 'Grade'],
                    ['WEIGHTS', 'Frozen'],
                    ['SIGNAL', 'Ready'],
                    ['MEMORY', 'Unchanged']
                ]
            },
            {
                active: ['verifier', 'curator'],
                edge: ['verifier', 'curator'],
                token: 'proposal',
                chip: { kind: 'curate', label: 'CURATE', text: 'Propose a memory edit: a skill, a rule, a note, or a task-adaptive briefing.' },
                title: 'Curate a candidate update',
                body: 'The curator compresses the attempt into something reusable. This is where experience becomes procedural memory — still a proposal until the gate accepts it.',
                pillars: [
                    ['MODE', 'Write'],
                    ['WEIGHTS', 'Frozen'],
                    ['SIGNAL', 'Used'],
                    ['MEMORY', 'Candidate']
                ]
            },
            {
                active: ['curator', 'gate'],
                edge: ['curator', 'gate'],
                token: 'decide',
                chip: { kind: 'gate', label: 'GATE', text: 'KEEP what generalizes across tasks. DROP instance-specific noise.' },
                title: 'Gate what should persist',
                body: 'Not every proposal deserves to stick. The gate is the evolutionary pressure: only durable, transferable updates enter long-term memory.',
                pillars: [
                    ['MODE', 'Select'],
                    ['WEIGHTS', 'Frozen'],
                    ['SIGNAL', 'Used'],
                    ['MEMORY', 'Filtered']
                ]
            },
            {
                active: ['gate', 'memory', 'task', 'executor'],
                edge: ['gate', 'memory'],
                token: 'persist',
                chip: { kind: 'loop', label: 'EVOLVE', text: 'Accepted updates land in memory. The next task runs with better experience — same weights.' },
                title: 'Carry forward — evolve at test time',
                body: 'The loop closes. Behavior improves because memory improved. That is test-time evolution: adaptation across tasks without gradient steps on the executor.',
                pillars: [
                    ['MODE', 'Loop'],
                    ['WEIGHTS', 'Frozen'],
                    ['SIGNAL', 'Consumed'],
                    ['MEMORY', 'Updated']
                ]
            }
        ];

        let frameIdx = 0;
        let playing = false;
        let timer = null;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const countEl = document.getElementById('tte-frame-count');
        const titleEl = document.getElementById('tte-frame-title');
        const bodyEl = document.getElementById('tte-frame-body');
        const pillarsEl = document.getElementById('tte-pillars');
        const chipEl = document.getElementById('tte-chip');
        const playBtn = document.getElementById('tte-play');
        const prevBtn = document.getElementById('tte-prev');
        const nextBtn = document.getElementById('tte-next');

        function center(n) {
            return { x: n.x * 1120, y: n.y * 400 };
        }

        function nodeById(id) {
            return NODES.find((n) => n.id === id);
        }

        function seg(a, b, tStart = 78, tEnd = 84) {
            const p = center(a), q = center(b);
            const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
            const ux = dx / len, uy = dy / len;
            return {
                x1: p.x + ux * tStart,
                y1: p.y + uy * tStart,
                x2: q.x - ux * tEnd,
                y2: q.y - uy * tEnd
            };
        }

        function stopPlay() {
            playing = false;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (playBtn) {
                playBtn.textContent = '▶ Play';
                playBtn.setAttribute('aria-label', 'Play');
            }
        }

        function render() {
            const frame = FRAMES[frameIdx];
            const active = new Set(frame.active || []);
            const accent = '#0176d3';
            const accent2 = '#fe9339';

            let defs = `<defs>
                <marker id="tte-ah" markerWidth="9" markerHeight="9" refX="6.5" refY="3.2" orient="auto">
                    <path d="M0 0L7 3.2L0 6.4z" fill="#9bb4cc"/></marker>
                <marker id="tte-aha" markerWidth="10" markerHeight="10" refX="6.8" refY="3.4" orient="auto">
                    <path d="M0 0L7.5 3.4L0 6.8z" fill="${accent}"/></marker>
                <filter id="tte-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="b"/><feMerge>
                    <feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>`;

            let edgeSvg = '';
            SKELETON.forEach(([f, t]) => {
                const isActive = frame.edge && frame.edge[0] === f && frame.edge[1] === t;
                if (isActive) return;
                const s = seg(nodeById(f), nodeById(t));
                edgeSvg += `<line class="tte-edge" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" marker-end="url(#tte-ah)"/>`;
            });

            let flowSvg = '';
            if (frame.edge) {
                const s = seg(nodeById(frame.edge[0]), nodeById(frame.edge[1]));
                edgeSvg += `<line class="tte-edge active" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${accent}" marker-end="url(#tte-aha)"/>`;
                if (frame.token) {
                    const w = Math.max(64, frame.token.length * 9 + 28);
                    const path = `M${s.x1} ${s.y1} L${s.x2} ${s.y2}`;
                    const body = `<g class="tte-token"><rect x="${-w / 2}" y="-14" width="${w}" height="28" rx="14" fill="${accent}"/>
                        <text x="0" y="5" text-anchor="middle">${frame.token}</text></g>`;
                    flowSvg = reduce
                        ? `<g transform="translate(${(s.x1 + s.x2) / 2},${(s.y1 + s.y2) / 2})">${body}</g>`
                        : `<g>${body.replace('<g class="tte-token">',
                            `<g class="tte-token"><animateMotion dur="1.45s" repeatCount="indefinite" path="${path}"/>`)}</g>`;
                }
            }

            // feedback loop arc highlight on last frame
            let loopSvg = '';
            if (frameIdx === FRAMES.length - 1) {
                loopSvg = `<path class="tte-loop-arc" d="M980 300 C 980 380, 140 380, 140 300" fill="none" stroke="${accent2}" stroke-width="2.2" stroke-dasharray="7 6"/>
                    <text class="tte-loop-label" x="560" y="388" text-anchor="middle">test-time loop · same weights, better memory</text>`;
            }

            let nodeSvg = '';
            NODES.forEach((n) => {
                const c = center(n);
                const x = c.x - NW / 2, y = c.y - NH / 2;
                const on = active.has(n.id);
                const stroke = on ? accent : '#c5d6e6';
                const fill = on ? '#e8f4fc' : '#ffffff';
                const ink = on ? accent : '#243b53';
                const mute = on ? accent : '#5e7288';
                const pulse = on && !reduce
                    ? `<animate attributeName="stroke-width" values="2;3.6;2" dur="1.5s" repeatCount="indefinite"/>`
                    : '';
                nodeSvg += `<g class="tte-node${on ? ' active' : ''}" ${on ? 'filter="url(#tte-glow)"' : ''}>
                    <rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2">${pulse}</rect>
                    <g transform="translate(${c.x - 12},${c.y - 30}) scale(1.05)" fill="none" stroke="${mute}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[n.id]}</g>
                    <text x="${c.x}" y="${c.y + 28}" text-anchor="middle" fill="${ink}" font-size="15" font-weight="700" font-family="DM Sans, system-ui, sans-serif">${n.label}</text>
                </g>`;
            });

            svg.innerHTML = defs + edgeSvg + loopSvg + nodeSvg + flowSvg;

            if (countEl) countEl.textContent = `STEP ${frameIdx + 1} / ${FRAMES.length}`;
            if (titleEl) titleEl.textContent = frame.title;
            if (bodyEl) bodyEl.textContent = frame.body;
            if (pillarsEl) {
                pillarsEl.innerHTML = (frame.pillars || []).map(([k, v]) =>
                    `<div><span class="pk">${k}</span><span class="pv">${v}</span></div>`
                ).join('');
            }
            if (chipEl) {
                if (frame.chip) {
                    chipEl.hidden = false;
                    chipEl.dataset.kind = frame.chip.kind;
                    chipEl.innerHTML = `<span class="plabel">${frame.chip.label}</span>${frame.chip.text}`;
                } else {
                    chipEl.hidden = true;
                }
            }
        }

        function go(i) {
            frameIdx = (i + FRAMES.length) % FRAMES.length;
            render();
        }

        function playStep() {
            if (frameIdx >= FRAMES.length - 1) {
                stopPlay();
                return;
            }
            go(frameIdx + 1);
            timer = setTimeout(playStep, 2100);
        }

        prevBtn?.addEventListener('click', () => { stopPlay(); go(frameIdx - 1); });
        nextBtn?.addEventListener('click', () => { stopPlay(); go(frameIdx + 1); });
        playBtn?.addEventListener('click', () => {
            if (playing) {
                stopPlay();
                return;
            }
            playing = true;
            playBtn.textContent = '❚❚ Pause';
            playBtn.setAttribute('aria-label', 'Pause');
            if (frameIdx >= FRAMES.length - 1) go(0);
            timer = setTimeout(playStep, 500);
        });

        render();
    })();

    // Publications theme filter
    (function initPubsThemes() {
        const themeHost = document.querySelector('[data-pubs-themes]');
        const paperList = document.querySelector('[data-paper-list]');
        const upcomingList = document.querySelector('[data-upcoming-list]');
        if (!themeHost) return;

        const buttons = Array.from(themeHost.querySelectorAll('[data-theme]'));
        const cards = Array.from(document.querySelectorAll('#panel-publications [data-themes]'));
        let active = null;

        function applyTheme(theme) {
            if (theme && theme === active) theme = null;
            active = theme;
            const filtering = Boolean(theme);

            if (paperList) paperList.classList.toggle('is-filtering', filtering);
            if (upcomingList) upcomingList.classList.toggle('is-filtering', filtering);

            buttons.forEach((btn) => {
                const on = filtering && btn.dataset.theme === theme;
                btn.classList.toggle('is-active', on);
                btn.setAttribute('aria-selected', on ? 'true' : 'false');
            });

            cards.forEach((card) => {
                const themes = (card.dataset.themes || '').split(/\s+/).filter(Boolean);
                const match = !filtering || themes.includes(theme);
                card.classList.toggle('is-match', filtering && match);
                card.classList.toggle('is-dimmed', filtering && !match);
            });
        }

        buttons.forEach((btn) => {
            btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
        });
    })();
});
