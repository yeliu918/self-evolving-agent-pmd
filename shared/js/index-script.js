// Landing page: tabbed hub (Evolution Playground | Publications)
document.addEventListener('DOMContentLoaded', function() {
    const VALID_TABS = ['playground', 'publications'];
    const tabs = Array.from(document.querySelectorAll('.site-tab'));
    const panels = {
        playground: document.getElementById('panel-playground'),
        publications: document.getElementById('panel-publications')
    };

    function tabFromHash() {
        const raw = (window.location.hash || '').replace('#', '').toLowerCase();
        if (raw === 'evolution-playground' || raw === 'playground') return 'playground';
        if (raw === 'publications' || raw === 'papers') return 'publications';
        return 'playground';
    }

    function activateTab(name, { updateHash = true, focusTab = false } = {}) {
        if (!VALID_TABS.includes(name)) name = 'playground';

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

    const STAGES = {
        task: {
            kicker: '01 Task',
            title: 'Put a hot apple in the fridge',
            body: 'ALFWorld Heat & Place (pick_heat_then_place_in_recep). The kitchen starts with an apple on the countertop, a microwave, and a fridge. Success is two checks: the apple is in the fridge, and it is hot.',
            trace: '<span class="dim"># valid_unseen · Apple-None-Fridge-10</span>\nYou are in the middle of a room. Looking quickly around you, you see\na cabinet 1, a countertop 1, a fridge 1, a microwave 1, a sinkbasin 1.\n\nYour task is to: put a hot apple in fridge.\nAdmissible: [go to countertop 1, go to fridge 1, go to microwave 1, look]'
        },
        executor: {
            kicker: '02 Executor',
            title: 'The policy places it cold',
            body: 'The current skill says “find, take, put.” The executor finds the apple and goes straight to the fridge. It never opens the microwave. The trace is legal — every action is admissible — but the heat subgoal is skipped.',
            trace: 'go to countertop 1\n  On the countertop 1, you see an apple 1, a butterknife 1, a mug 1.\ntake apple 1\n  You pick up the apple 1 from the countertop 1.\ngo to fridge 1\nopen fridge 1\nput apple 1 in fridge 1\n  You put the apple 1 in the fridge 1.\n<span class="dim">episode ends · microwave unused</span>'
        },
        verifier: {
            kicker: '03 Verifier',
            title: 'In the fridge, not hot',
            body: 'ALFWorld grades the world state, not the transcript. The apple is in the fridge, so the place check passes. The heat check fails. Reward 0 — a wrong_sequence failure, not a navigation miss.',
            trace: 'hidden checks (PDDL goal)\n  apple 1 in fridge 1     <span class="ok">pass</span>\n  apple 1 is hot          <span class="bad">fail</span>\n\nreward  0.0\nfail    skipped heat · microwave never used'
        },
        curator: {
            kicker: '04 Curator',
            title: 'Heat before placing',
            body: 'The error analyst reads the failed batch. The common pattern is appliance skip: Heat & Place, Cool & Place, and Clean & Place all need a transform before the destination. It proposes one skill edit, not an apple-specific note.',
            trace: 'failure_type  wrong_sequence / appliance_error\ncount         6 / 8 heat-and-place episodes\n\nskill edit (append)\n  Heat & Place: take the object → go to microwave →\n  heat object with microwave → then go to the destination.\n  Do not put a cold object in the fridge.'
        },
        gating: {
            kicker: '05 Gating loop',
            title: 'Keep the rule, run again',
            body: 'The gate keeps the transform-before-place rule — it covers heat, cool, and clean, not just this apple. It drops “apple is on countertop 1,” which would not transfer. The next executor call retrieves the rule, heats first, and the verifier returns 1.0.',
            trace: '<span class="ok">KEEP</span>  transform before placing (heat / cool / clean)\n<span class="bad">DROP</span>  “apple is on countertop 1” (instance-specific)\n\nnext pass\n  take apple 1\n  go to microwave 1 → heat apple 1 with microwave 1\n  go to fridge 1 → put apple 1 in fridge 1\n  apple in fridge  <span class="ok">pass</span>   apple is hot  <span class="ok">pass</span>   reward 1.0'
        }
    };

    const stageButtons = Array.from(document.querySelectorAll('.stage[data-stage]'));
    const kickerEl = document.getElementById('stage-kicker');
    const titleEl = document.getElementById('stage-title');
    const bodyEl = document.getElementById('stage-body');
    const traceEl = document.getElementById('stage-trace');
    const playBtn = document.getElementById('play-loop');
    const STAGE_ORDER = ['task', 'executor', 'verifier', 'curator', 'gating'];
    let playTimer = null;

    function selectStage(name) {
        const info = STAGES[name];
        if (!info) return;
        stageButtons.forEach((btn) => {
            const on = btn.dataset.stage === name;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (kickerEl) kickerEl.textContent = info.kicker;
        if (titleEl) titleEl.textContent = info.title;
        if (bodyEl) bodyEl.textContent = info.body;
        if (traceEl) traceEl.innerHTML = info.trace;
    }

    stageButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            if (playTimer) {
                clearTimeout(playTimer);
                playTimer = null;
                if (playBtn) {
                    playBtn.disabled = false;
                    playBtn.textContent = 'Play example';
                }
            }
            selectStage(btn.dataset.stage);
        });
    });

    selectStage('task');

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (playTimer) return;
            playBtn.disabled = true;
            playBtn.textContent = 'Playing…';
            let i = 0;
            const step = () => {
                selectStage(STAGE_ORDER[i]);
                i += 1;
                if (i < STAGE_ORDER.length) {
                    playTimer = setTimeout(step, 2200);
                } else {
                    playTimer = null;
                    playBtn.disabled = false;
                    playBtn.textContent = 'Play example';
                }
            };
            step();
        });
    }
});
