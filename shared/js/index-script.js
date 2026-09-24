// Landing page: tabbed hub (Vision | Evolution Playground | Publications)
document.addEventListener('DOMContentLoaded', function() {
    const PLAYGROUND_DATA_ROOT = 'https://huggingface.co/datasets/srijanbansal/skillevo-trajectories/resolve/main/playground/v1';
    const VALID_TABS = ['vision', 'playground', 'publications'];
    const tabs = Array.from(document.querySelectorAll('.site-tab'));
    const panels = {
        vision: document.getElementById('panel-vision'),
        playground: document.getElementById('panel-playground'),
        publications: document.getElementById('panel-publications')
    };

    function tabFromHash() {
        const raw = (window.location.hash || '').replace('#', '').toLowerCase();
        if (raw === 'vision') return 'vision';
        if (raw === 'evolution-playground' || raw === 'playground') return 'playground';
        if (raw === 'publications' || raw === 'papers') return 'publications';
        return 'vision';
    }

    function activateTab(name, { updateHash = true, focusTab = false } = {}) {
        if (!VALID_TABS.includes(name)) name = 'vision';

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

    /* Config + mechanism tabs in the Evolution Playground */
    const pgExpt = {
        leaves: [],
        loaded: false,
        current: null,
        syncConfig: null,
        shortModel: function (value) {
            return String(value || '').toLowerCase().includes('sol') ? 'sol' : 'luna';
        },
        padEpoch: function (n) {
            return 'epoch_' + String(n).padStart(3, '0');
        },
        readConfig: function () {
            const benchmarkEl = document.getElementById('pg-benchmark');
            const benchmark = (benchmarkEl && benchmarkEl.value) || 'alfworld';
            const domainEl = document.getElementById('pg-domain');
            if (benchmark !== 'alfworld') {
                const defaults = { tau2: 'airline', enterpriseops: 'csm', bird: 'all' };
                const domain = (domainEl && domainEl.value) || defaults[benchmark] || 'all';
                const mechanism = document.getElementById('pg-mechanism');
                const mech = (mechanism && mechanism.value) || 'no-skill';
                const epochs = document.getElementById('pg-epochs');
                const selectedEpoch = parseInt(epochs && epochs.value, 10);
                return {
                    benchmark: benchmark,
                    mech: mech,
                    pair: benchmark + '-' + domain,
                    epochN: mech === 'no-skill' ? 1 : (Number.isFinite(selectedEpoch) ? selectedEpoch : 3),
                    trial: 'trial1',
                    split: 'train'
                };
            }
            const mechanism = document.getElementById('pg-mechanism');
            const selectedMech = mechanism ? mechanism.value : 'skillos';
            const memoryFilter = document.getElementById('pg-memory-filter');
            const filterMechanisms = {
                all: 'memcurator',
                successful: 'memcurator-success-only',
                latest: 'memcurator-latest',
                'successful-latest': 'memcurator-success-latest'
            };
            const mech = selectedMech === 'memcurator'
                ? (filterMechanisms[(memoryFilter && memoryFilter.value) || 'all'] || 'memcurator')
                : selectedMech;
            const curator = document.getElementById('pg-curator');
            const judge = document.getElementById('pg-judge');
            const pair = mech === 'no-skill'
                ? 'none'
                : this.shortModel(curator && curator.value) + '-' + this.shortModel(judge && judge.value);
            const epochs = document.getElementById('pg-epochs');
            const epN = parseInt(epochs && epochs.value, 10);
            const epochN = Number.isFinite(epN) ? epN : 3;
            const trialEl = document.getElementById('pg-trial');
            return {
                benchmark: benchmark,
                mech: mech,
                pair: pair,
                epochN: epochN,
                trial: (trialEl && trialEl.value) || 'trial1',
                split: 'valid_seen'
            };
        },
        leaf: function (cfg, epochName) {
            return [cfg.mech, cfg.pair, epochName, cfg.trial, cfg.split].join('/');
        },
        resolve: function () {
            const cfg = this.readConfig();
            const last = this.leaf(cfg, this.padEpoch(cfg.epochN));
            if (!this.loaded) return { run: last, runs: [], found: false, pending: true };

            if (cfg.mech === 'no-skill') {
                const fallbacks = [
                    this.leaf(cfg, 'n-a')
                ];
                if (cfg.benchmark === 'alfworld') {
                    fallbacks.push(['no-skill', 'none', 'n-a', 'trial1', cfg.split].join('/'));
                }
                const hit = fallbacks.find((leaf) => this.leaves.includes(leaf));
                const runs = hit ? [hit] : [];
                return {
                    run: hit || fallbacks[0],
                    runs: runs,
                    found: runs.length > 0,
                    epochN: cfg.epochN
                };
            }

            const runs = [];
            for (let i = 1; i <= cfg.epochN; i++) {
                const leaf = this.leaf(cfg, this.padEpoch(i));
                if (this.leaves.includes(leaf)) runs.push(leaf);
            }
            if (!runs.length && cfg.mech === 'no-skill') {
                const fallbacks = [
                    this.leaf({ ...cfg, pair: 'none' }, 'n-a'),
                    ['no-skill', 'none', 'n-a', 'trial1', cfg.split].join('/')
                ];
                fallbacks.forEach((leaf) => {
                    if (this.leaves.includes(leaf) && !runs.includes(leaf)) runs.push(leaf);
                });
            }
            const found = cfg.mech === 'no-skill'
                ? runs.length > 0
                : runs.length === cfg.epochN;
            return {
                run: runs[runs.length - 1] || last,
                runs: found ? runs : [],
                found: found,
                epochN: cfg.epochN
            };
        },
        apply: function () {
            const res = this.resolve();
            if (res.pending) return;
            const key = (res.found ? '1' : '0') + ':' + (res.runs.length ? res.runs.join('|') : res.run);
            if (key === this.current) return;
            this.current = key;
            document.dispatchEvent(new CustomEvent('pg-run', { detail: res }));
            const frame = document.getElementById('playground-dashboard-frame');
            const missing = document.getElementById('pg-dashboard-missing');
            if (!frame) return;
            document.dispatchEvent(new CustomEvent('pg-dashboard-reload'));
            if (!res.found) {
                frame.hidden = true;
                if (missing) missing.hidden = false;
                frame.src = 'about:blank';
                return;
            }
            if (missing) missing.hidden = true;
            frame.hidden = false;
            const q = new URLSearchParams();
            q.set('embed', '1');
            q.set('v', '120');
            q.set('run', res.run);
            q.set('runs', res.runs.join('|'));
            q.set('data', PLAYGROUND_DATA_ROOT);
            frame.src = 'playground-dashboard.html?' + q.toString();
        }
    };

    (function initOverview() {
        const root = document.getElementById('pg-overview');
        if (!root) return;
        const mechanismsHost = document.getElementById('pg-overview-mechanisms');
        const pairsHost = document.getElementById('pg-overview-pairs');
        const taskFilter = document.getElementById('pg-overview-task-filter');
        const taskTypesHost = document.getElementById('pg-overview-task-types');
        const seenChart = document.getElementById('pg-overview-seen-chart');
        const heldoutChart = document.getElementById('pg-overview-heldout-chart');
        const note = document.getElementById('pg-overview-note');
        const benchmarkSelect = document.getElementById('pg-benchmark');
        const modeHost = root.querySelector('.pg-overview-mode');
        const pairFilter = pairsHost.closest('.pg-overview-pair');
        const taskFilterLabel = taskFilter.querySelector('b');
        const seenCaption = seenChart.closest('figure').querySelector('figcaption');
        const heldoutCaption = heldoutChart.closest('figure').querySelector('figcaption');
        const overviewEpoch = document.getElementById('pg-epochs');
        const averageField = document.getElementById('pg-overview-average-field');
        const averageDatasets = document.getElementById('pg-overview-average-datasets');
        const names = { 'no-skill': 'No-skill', skillos: 'SkillOS', memcurator: 'JitMem · all', 'memcurator-success-only': 'JitMem · successful', 'memcurator-latest': 'JitMem · latest', 'memcurator-success-latest': 'JitMem · successful + latest' };
        // Mechanism owns color; model pair owns dash pattern; task type owns marker shape.
        // Keep these categorical hues deliberately far apart so dense overlays remain legible.
        const colors = {
            'no-skill': '#5f6b7a',
            skillos: '#0176d3',
            memcurator: '#2e844a',
            'memcurator-success-only': '#e66c37',
            'memcurator-latest': '#8e5bd9',
            'memcurator-success-latest': '#d149a0'
        };
        const pairDashes = { 'luna-luna': '', 'luna-sol': '8 4', 'sol-luna': '2 4', 'sol-sol': '10 3 2 3' };
        const taskShapeSymbols = ['●', '■', '▲', '◆', '✚', '⬟'];
        let payload = null;

        const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
        const shortType = (value) => ({ look_at_obj_in_light: 'inspect', pick_and_place: 'place', pick_clean_then_place_in_recep: 'clean', pick_cool_then_place_in_recep: 'cool', pick_heat_then_place_in_recep: 'heat', pick_two_obj_and_place: 'two objects', airline: 'airline', retail: 'retail', telecom: 'telecom', 'telecom-workflow': 'telecom workflow', banking_knowledge: 'banking knowledge' })[value] || value;
        const currentBenchmark = () => (benchmarkSelect && benchmarkSelect.value) || 'alfworld';
        const isDatasetBenchmark = () => currentBenchmark() !== 'alfworld';
        const datasetUnit = () => currentBenchmark() === 'tau2' ? 'domain' : 'dataset';
        const benchmarkExperiments = () => payload.experiments.filter((experiment) => (experiment.benchmark || 'alfworld') === currentBenchmark());
        const activeTaskTypes = () => {
            const byBenchmark = payload.task_types_by_benchmark || {};
            return Object.prototype.hasOwnProperty.call(byBenchmark, currentBenchmark())
                ? byBenchmark[currentBenchmark()]
                : (currentBenchmark() === 'alfworld' ? (payload.task_types || []) : []);
        };

        function metricAt(experiment, epoch, split, type) {
            const summary = experiment.epochs[String(epoch)] && experiment.epochs[String(epoch)][split];
            return summary ? (type ? summary.by_type[type] || null : summary) : null;
        }

        function selectedGroups() {
            const selectedMechanisms = new Set(Array.from(mechanismsHost.querySelectorAll('input:checked')).map((input) => input.value));
            const selectedPairs = new Set(Array.from(pairsHost.querySelectorAll('input[data-pair]:checked')).map((input) => input.value));
            const groups = new Map();
            benchmarkExperiments().forEach((experiment) => {
                if (!selectedMechanisms.has(experiment.mechanism)) return;
                if (experiment.mechanism !== 'no-skill' && !selectedPairs.has(experiment.pair)) return;
                const key = `${experiment.mechanism}/${experiment.pair}`;
                if (!groups.has(key)) groups.set(key, { id: key, mechanism: experiment.mechanism, pair: experiment.pair, trials: [], color: colors[experiment.mechanism], dash: pairDashes[experiment.pair] || '' });
                groups.get(key).trials.push(experiment);
            });
            return Array.from(groups.values());
        }

        function aggregate(group, epoch, split, type) {
            const metrics = group.trials.map((trial) => metricAt(trial, epoch, split, type)).filter((metric) => metric && metric.pct != null);
            if (!metrics.length) return null;
            const values = metrics.map((metric) => metric.pct);
            return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, min: Math.min(...values), max: Math.max(...values), trials: values.length, ok: metrics.reduce((sum, metric) => sum + metric.ok, 0), n: metrics.reduce((sum, metric) => sum + metric.n, 0) };
        }

        function macroAverage(group, epoch, split, types) {
            const metrics = types.map((type) => aggregate(group, epoch, split, type)).filter((metric) => metric && metric.mean != null);
            if (!metrics.length) return null;
            const values = metrics.map((metric) => metric.mean);
            return {
                mean: values.reduce((sum, value) => sum + value, 0) / values.length,
                min: Math.min(...values),
                max: Math.max(...values),
                trials: metrics.reduce((sum, metric) => sum + metric.trials, 0),
                ok: metrics.reduce((sum, metric) => sum + metric.ok, 0),
                n: metrics.reduce((sum, metric) => sum + metric.n, 0),
                datasets: metrics.length
            };
        }

        function selectedTaskTypes() {
            return Array.from(taskTypesHost.querySelectorAll('input[data-task-type]:checked')).map((input) => input.value);
        }

        function pointsFor(group, split, mode, type) {
            const baselineTrial = benchmarkExperiments().find((item) => item.id === payload.epoch0_baseline);
            const metricType = mode === 'type' ? type : null;
            const points = [];
            if (group.mechanism === 'no-skill' && baselineTrial) {
                const baseline = metricAt(baselineTrial, 0, split, metricType);
                if (baseline) {
                    [0, 1, 2, 3].forEach((x) => points.push({ x, mean: baseline.pct, min: baseline.pct, max: baseline.pct, trials: 1, ok: baseline.ok, n: baseline.n }));
                }
                return points;
            }
            if (baselineTrial) {
                const baseline = metricAt(baselineTrial, 0, split, metricType);
                if (baseline) points.push({ x: 0, mean: baseline.pct, min: baseline.pct, max: baseline.pct, trials: 1, ok: baseline.ok, n: baseline.n });
            }
            [0, 1, 2, 3].forEach((epoch) => {
                const point = aggregate(group, epoch, split, metricType);
                if (point) points.push({ x: epoch, ...point });
            });
            return points;
        }

        function autoYDomain(groups, mode, taskTypes) {
            const values = [];
            ['valid_seen', 'test'].forEach((split) => {
                groups.forEach((group) => {
                    (mode === 'type' ? taskTypes : [null]).forEach((type) => {
                        pointsFor(group, split, mode, type).forEach((point) => {
                            values.push(point.mean);
                        });
                    });
                });
            });
            if (!values.length) return { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] };
            const dataMin = Math.min(...values);
            const dataMax = Math.max(...values);
            const paddedMin = Math.max(0, dataMin - Math.max(3, (dataMax - dataMin) * 0.12));
            const paddedMax = Math.min(100, dataMax + Math.max(3, (dataMax - dataMin) * 0.12));
            const desiredStep = Math.max(1, (paddedMax - paddedMin) / 4);
            const step = [5, 10, 20, 25, 50].find((candidate) => candidate >= desiredStep) || 50;
            let min = Math.max(0, Math.floor(paddedMin / step) * step);
            let max = Math.min(100, Math.ceil(paddedMax / step) * step);
            if (max - min < step * 2) {
                min = Math.max(0, min - step);
                max = Math.min(100, max + step);
            }
            if (max <= min) {
                min = Math.max(0, min - step);
                max = Math.min(100, min + step * 2);
            }
            const ticks = [];
            for (let value = min; value <= max + 0.001; value += step) ticks.push(value);
            return { min, max, ticks };
        }

        function markerSvg(shapeIndex, x, y, color, title) {
            const safeTitle = `<title>${esc(title)}</title>`;
            if (shapeIndex === 1) return `<rect class="overview-point" x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1" fill="${color}">${safeTitle}</rect>`;
            if (shapeIndex === 2) return `<polygon class="overview-point" points="${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}" fill="${color}">${safeTitle}</polygon>`;
            if (shapeIndex === 3) return `<polygon class="overview-point" points="${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}" fill="${color}">${safeTitle}</polygon>`;
            if (shapeIndex === 4) return `<g class="overview-point overview-plus" style="stroke:${color}">${safeTitle}<path d="M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}"></path></g>`;
            if (shapeIndex === 5) return `<polygon class="overview-point" points="${x - 5},${y} ${x - 2.5},${y - 4.5} ${x + 2.5},${y - 4.5} ${x + 5},${y} ${x + 2.5},${y + 4.5} ${x - 2.5},${y + 4.5}" fill="${color}">${safeTitle}</polygon>`;
            return `<circle class="overview-point" cx="${x}" cy="${y}" r="4" fill="${color}">${safeTitle}</circle>`;
        }

        function renderChart(host, split, mode, groups, taskTypes, yDomain) {
            const width = 640, height = 340;
            const margin = { top: 20, right: 18, bottom: 40, left: 46 };
            const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom;
            const xValues = [0, 1, 2, 3];
            const xPos = (x) => margin.left + (xValues.length < 2 ? innerW / 2 : x * innerW / (xValues.length - 1));
            const ySpan = Math.max(1, yDomain.max - yDomain.min);
            const yPos = (y) => margin.top + innerH * (1 - (Math.max(yDomain.min, Math.min(yDomain.max, y)) - yDomain.min) / ySpan);
            let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`;
            yDomain.ticks.forEach((value) => {
                svg += `<line class="overview-grid" x1="${margin.left}" y1="${yPos(value)}" x2="${width - margin.right}" y2="${yPos(value)}"></line><text class="overview-axis-label" x="${margin.left - 8}" y="${yPos(value) + 3}" text-anchor="end">${value}%</text>`;
            });
            xValues.forEach((value, index) => {
                const label = `epoch ${value}`;
                svg += `<text class="overview-axis-label" x="${xPos(value)}" y="${height - 13}" text-anchor="middle">${esc(label)}</text>`;
            });
            groups.forEach((group) => {
                (mode === 'type' ? taskTypes : [null]).forEach((type) => {
                    const points = pointsFor(group, split, mode, type);
                    if (!points.length) return;
                    const label = names[group.mechanism] + (group.pair !== 'none' ? ` · ${group.pair.replace('-', '/')}` : '') + (type ? ` · ${shortType(type)}` : '');
                    const coords = points.map((point) => `${xPos(point.x)},${yPos(point.mean)}`).join(' ');
                    const dash = group.mechanism === 'no-skill' ? '4 5' : group.dash;
                    if (points.length > 1) svg += `<polyline class="overview-line${group.mechanism === 'no-skill' ? ' is-baseline' : ''}" points="${coords}" stroke="${group.color}"${dash ? ` stroke-dasharray="${dash}"` : ''}></polyline>`;
                    const shapeIndex = type ? activeTaskTypes().indexOf(type) : 0;
                    points.forEach((point) => {
                        const range = point.max > point.min ? `, range ${point.min.toFixed(1)}–${point.max.toFixed(1)}%` : '';
                        const title = `${label}: mean ${point.mean.toFixed(1)}%${range} · ${point.trials} trial${point.trials === 1 ? '' : 's'} · ${point.ok}/${point.n}`;
                        svg += markerSvg(shapeIndex, xPos(point.x), yPos(point.mean), group.color, title);
                    });
                });
            });
            if (!groups.length || (mode === 'type' && !taskTypes.length)) svg += `<text class="overview-empty" x="${width / 2}" y="${height / 2}" text-anchor="middle">Choose at least one ${!groups.length ? 'mechanism' : 'task type'}</text>`;
            host.innerHTML = svg + '</svg>';
        }

        function renderDatasetChart(host, split, groups, domains, yDomain, average) {
            const width = 640, height = 340;
            const margin = { top: 24, right: 18, bottom: 58, left: 46 };
            const innerW = width - margin.left - margin.right, innerH = height - margin.top - margin.bottom;
            const ySpan = Math.max(1, yDomain.max - yDomain.min);
            const yPos = (y) => margin.top + innerH * (1 - (Math.max(yDomain.min, Math.min(yDomain.max, y)) - yDomain.min) / ySpan);
            const plottedDomains = average ? ['__average__'] : domains;
            const slot = innerW / Math.max(1, plottedDomains.length);
            const groupCount = Math.max(1, groups.length);
            const barWidth = Math.min(42, slot * 0.7 / groupCount);
            const selectedEpoch = Math.max(1, parseInt(overviewEpoch && overviewEpoch.value, 10) || 3);
            let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`;
            yDomain.ticks.forEach((value) => {
                svg += `<line class="overview-grid" x1="${margin.left}" y1="${yPos(value)}" x2="${width - margin.right}" y2="${yPos(value)}"></line><text class="overview-axis-label" x="${margin.left - 8}" y="${yPos(value) + 3}" text-anchor="end">${value}%</text>`;
            });
            plottedDomains.forEach((domain, index) => {
                const x = margin.left + slot * (index + 0.5);
                groups.forEach((group, groupIndex) => {
                    const epoch = group.mechanism === 'no-skill' ? 0 : selectedEpoch;
                    const point = domain === '__average__'
                        ? macroAverage(group, epoch, split, domains)
                        : aggregate(group, epoch, split, domain);
                    if (!point) return;
                    const offset = (groupIndex - (groups.length - 1) / 2) * barWidth;
                    const barX = x + offset;
                    const top = yPos(point.mean);
                    const bottom = yPos(yDomain.min);
                    const mechanismName = group.mechanism === 'no-skill' ? 'No-memory' : names[group.mechanism];
                    const epochLabel = group.mechanism === 'no-skill' ? 'baseline' : `epoch ${epoch}`;
                    const datasetLabel = domain === '__average__' ? `macro average across ${point.datasets} datasets` : shortType(domain);
                    const title = `${mechanismName} · ${epochLabel} · ${datasetLabel}: ${point.mean.toFixed(1)}% · ${point.ok}/${point.n}`;
                    svg += `<rect class="overview-point" x="${barX - barWidth / 2 + 1}" y="${top}" width="${Math.max(2, barWidth - 2)}" height="${Math.max(1, bottom - top)}" rx="3" fill="${group.color}"><title>${esc(title)}</title></rect>`;
                });
                const axisLabel = domain === '__average__' ? 'dataset average' : shortType(domain);
                svg += `<text class="overview-axis-label" x="${x}" y="${height - 28}" text-anchor="middle"><tspan x="${x}">${esc(axisLabel.replace(' workflow', ''))}</tspan>${domain === 'telecom-workflow' ? `<tspan x="${x}" dy="12">workflow</tspan>` : ''}</text>`;
            });
            if (!groups.length || !domains.length) svg += `<text class="overview-empty" x="${width / 2}" y="${height / 2}" text-anchor="middle">Choose at least one ${!groups.length ? 'mechanism' : 'domain'}</text>`;
            host.innerHTML = svg + '</svg>';
        }

        function render() {
            const datasetBenchmark = isDatasetBenchmark();
            const average = Boolean(averageDatasets && averageDatasets.checked);
            const mode = datasetBenchmark ? 'type' : ((root.querySelector('input[name="pg-overview-mode"]:checked') || {}).value || 'epoch');
            const groups = selectedGroups();
            const taskTypes = selectedTaskTypes();
            taskFilter.hidden = !datasetBenchmark && mode !== 'type';
            const yDomain = datasetBenchmark
                ? { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }
                : autoYDomain(groups, mode, taskTypes);
            if (datasetBenchmark) {
                renderDatasetChart(seenChart, 'valid_seen', groups, taskTypes, yDomain, average);
                renderDatasetChart(heldoutChart, 'test', groups, taskTypes, yDomain, average);
            } else {
                renderChart(seenChart, 'valid_seen', mode, groups, taskTypes, yDomain);
                renderChart(heldoutChart, 'test', mode, groups, taskTypes, yDomain);
            }
            const trialCount = new Set(groups.flatMap((group) => group.trials.map((trial) => trial.id))).size;
            if (datasetBenchmark) {
                if (!groups.length) {
                    const benchmarkNames = { tau2: 'Tau2', enterpriseops: 'Enterprise Ops', bird: 'BIRD' };
                    note.textContent = `${benchmarkNames[currentBenchmark()] || currentBenchmark()}: no completed runs are imported yet.`;
                    return;
                }
                const selectedEpoch = Math.max(1, parseInt(overviewEpoch && overviewEpoch.value, 10) || 3);
                const summaries = groups.map((group) => {
                    const epoch = group.mechanism === 'no-skill' ? 0 : selectedEpoch;
                    const train = aggregate(group, epoch, 'valid_seen', null);
                    const test = aggregate(group, epoch, 'test', null);
                    const mechanismName = group.mechanism === 'no-skill' ? 'No-memory' : names[group.mechanism];
                    return `${mechanismName}${epoch ? ` e${epoch}` : ''}: train ${train ? `${train.ok}/${train.n} (${train.mean.toFixed(1)}%)` : 'n/a'}, test ${test ? `${test.ok}/${test.n} (${test.mean.toFixed(1)}%)` : 'n/a'}`;
                });
                const unit = datasetUnit();
                const averageNote = average ? `macro-average across ${taskTypes.length} ${unit}${taskTypes.length === 1 ? '' : 's'}` : `${taskTypes.length} ${unit}${taskTypes.length === 1 ? '' : 's'}`;
                note.textContent = `${averageNote} · ${summaries.join(' · ')} · shared y-axis 0–100%.`;
            } else {
                const typeNote = mode === 'type' ? ` · ${taskTypes.length} task type${taskTypes.length === 1 ? '' : 's'} plotted across epochs` : '';
                note.textContent = `${groups.length} setting${groups.length === 1 ? '' : 's'} · ${trialCount} run series${typeNote} · mean environment success · shared y-axis auto-fit to ${yDomain.min}–${yDomain.max}%.`;
            }
        }

        function buildControls() {
            const datasetBenchmark = isDatasetBenchmark();
            const experiments = benchmarkExperiments();
            const mechanisms = ['no-skill', 'skillos'].filter((mechanism) => experiments.some((experiment) => experiment.mechanism === mechanism));
            mechanismsHost.innerHTML = mechanisms.map((mechanism) => `<label style="--series-color:${colors[mechanism]}"><input type="checkbox" value="${mechanism}" checked><i></i><span>${esc(datasetBenchmark && mechanism === 'no-skill' ? 'No-memory' : names[mechanism])}</span></label>`).join('');
            const pairs = Array.from(new Set(experiments.filter((experiment) => experiment.pair !== 'none').map((experiment) => experiment.pair))).sort();
            pairsHost.innerHTML = `<label><input type="checkbox" data-all-pairs checked><i class="pg-pair-line is-all"></i><span>All pairs</span></label>` + pairs.map((pair) => `<label><input type="checkbox" data-pair value="${pair}" checked><i class="pg-pair-line is-${pair}"></i><span>${pair.replace('-', ' / ')}</span></label>`).join('');
            const taskTypes = activeTaskTypes();
            taskTypesHost.innerHTML = `<label><input type="checkbox" data-all-task-types checked><i class="pg-task-shape">✣</i><span>All ${datasetBenchmark ? `${datasetUnit()}s` : 'task types'}</span></label>` + taskTypes.map((type, index) => `<label><input type="checkbox" data-task-type value="${esc(type)}" checked><i class="pg-task-shape">${taskShapeSymbols[index % taskShapeSymbols.length]}</i><span>${esc(shortType(type))}</span></label>`).join('');
            if (modeHost) modeHost.hidden = datasetBenchmark;
            if (pairFilter) pairFilter.hidden = datasetBenchmark;
            if (averageField) averageField.hidden = !datasetBenchmark || taskTypes.length < 2;
            if (taskFilterLabel) taskFilterLabel.textContent = datasetBenchmark ? `${datasetUnit()[0].toUpperCase()}${datasetUnit().slice(1)}s` : 'Task types';
            if (seenCaption) seenCaption.innerHTML = datasetBenchmark ? '<b>Training split</b><span>train</span>' : '<b>Seen evaluation</b><span>valid_seen</span>';
            if (heldoutCaption) heldoutCaption.innerHTML = datasetBenchmark ? '<b>Official test split</b><span>test</span>' : '<b>Held-out evaluation</b><span>test</span>';
            seenChart.setAttribute('aria-label', `${datasetBenchmark ? 'Training' : 'Seen environment success'} chart`);
            heldoutChart.setAttribute('aria-label', `${datasetBenchmark ? 'Test' : 'Held-out environment success'} chart`);
        }

        fetch('data/overview.json?v=4').then((response) => {
            if (!response.ok) throw new Error('Overview summary unavailable');
            return response.json();
        }).then((data) => {
            payload = data;
            buildControls();
            mechanismsHost.addEventListener('change', render);
            pairsHost.addEventListener('change', (event) => {
                const all = pairsHost.querySelector('[data-all-pairs]');
                const pairInputs = Array.from(pairsHost.querySelectorAll('[data-pair]'));
                if (event.target && event.target.hasAttribute('data-all-pairs')) {
                    pairInputs.forEach((input) => { input.checked = all.checked; });
                } else if (all) {
                    all.checked = pairInputs.length > 0 && pairInputs.every((input) => input.checked);
                }
                render();
            });
            taskTypesHost.addEventListener('change', (event) => {
                const all = taskTypesHost.querySelector('[data-all-task-types]');
                const typeInputs = Array.from(taskTypesHost.querySelectorAll('[data-task-type]'));
                if (event.target && event.target.hasAttribute('data-all-task-types')) {
                    typeInputs.forEach((input) => { input.checked = all.checked; });
                } else if (all) {
                    all.checked = typeInputs.length > 0 && typeInputs.every((input) => input.checked);
                }
                render();
            });
            root.querySelectorAll('input[name="pg-overview-mode"]').forEach((radio) => radio.addEventListener('change', render));
            if (benchmarkSelect) benchmarkSelect.addEventListener('change', () => {
                buildControls();
                render();
            });
            if (overviewEpoch) overviewEpoch.addEventListener('change', render);
            if (averageDatasets) averageDatasets.addEventListener('change', render);
            render();
        }).catch((error) => { note.textContent = error.message; });
    })();

    (function initPanelFolding() {
        const panels = Array.from(document.querySelectorAll('#pg-setup [data-fold-panel], #pg-replay[data-fold-panel]'));

        function setPanel(panel, collapsed) {
            if (!panel) return;
            if (panel.id === 'pg-wip') {
                const body = document.getElementById('pg-wip-body');
                const toggle = document.getElementById('pg-wip-toggle');
                const symbol = toggle && toggle.querySelector('.pg-wip-symbol');
                panel.classList.toggle('is-open', !collapsed);
                panel.classList.toggle('is-folded', collapsed);
                if (body) body.hidden = collapsed;
                if (toggle) {
                    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                    toggle.setAttribute('aria-label', collapsed ? 'Expand Mechanism' : 'Collapse Mechanism');
                }
                if (symbol) symbol.textContent = collapsed ? '+' : '−';
                return;
            }
            const body = panel.querySelector(':scope > .pg-fold-body');
            const button = panel.querySelector(':scope > .pg-panel-head .pg-fold-toggle, :scope > .pg-overview-head .pg-fold-toggle');
            panel.classList.toggle('is-folded', collapsed);
            if (body) body.hidden = collapsed;
            if (button) {
                button.textContent = collapsed ? '+' : '−';
                button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${panel.getAttribute('aria-labelledby') ? (document.getElementById(panel.getAttribute('aria-labelledby')) || {}).textContent || 'panel' : 'panel'}`);
            }
        }

        panels.forEach((panel) => {
            const button = panel.querySelector(':scope > .pg-panel-head .pg-fold-toggle, :scope > .pg-overview-head .pg-fold-toggle');
            if (button) button.addEventListener('click', () => setPanel(panel, !panel.classList.contains('is-folded')));
        });

    })();

    (function initPlaygroundSetup() {
        const root = document.getElementById('pg-setup');
        if (!root) return;

        const bench = document.getElementById('pg-benchmark');
        const domain = document.getElementById('pg-domain');
        const domainField = document.getElementById('pg-domain-field');
        const domainLabel = document.getElementById('pg-domain-label');
        const mechanism = document.getElementById('pg-mechanism');
        const executor = document.getElementById('pg-executor');
        const curator = document.getElementById('pg-curator');
        const judge = document.getElementById('pg-judge');
        const epochs = document.getElementById('pg-epochs');
        const trial = document.getElementById('pg-trial');
        const budget = document.getElementById('pg-budget');
        const topk = document.getElementById('pg-k');
        const topkField = document.getElementById('pg-k-field');
        const memoryFilter = document.getElementById('pg-memory-filter');
        const memoryFilterField = document.getElementById('pg-memory-filter-field');
        const curatorField = document.getElementById('pg-curator-field');
        const judgeField = document.getElementById('pg-judge-field');
        const userModelField = document.getElementById('pg-user-model-field');
        const evaluatorModelField = document.getElementById('pg-evaluator-model-field');
        const agentLoop = document.getElementById('pg-agent-loop');
        const history = document.getElementById('pg-history');
        const tabs = Array.from(root.querySelectorAll('[data-mech]'));
        const board = document.getElementById('pg-mech-board');
        const caption = document.getElementById('pg-mech-caption');
        const nodes = board ? Array.from(board.querySelectorAll('[data-node]')) : [];
        let active = (mechanism && mechanism.value) || 'skillos';
        let flowTimer = null;
        let flowStep = 0;
        let savedEpoch = (epochs && epochs.value) || '3';
        let savedTrial = (trial && trial.value) || 'trial1';
        const BENCHMARK_CONFIG = {
            alfworld: { datasets: [], budget: '30', loop: 'ReAct · <think> · <action>', history: 'last 3 steps' },
            tau2: { datasets: [['airline', 'Airline'], ['retail', 'Retail'], ['telecom', 'Telecom'], ['telecom-workflow', 'Telecom workflow'], ['banking_knowledge', 'Banking knowledge']], budget: '200', loop: 'Tau2 tool-use agent', history: 'full conversation' },
            enterpriseops: { datasets: [['csm', 'Customer service management']], budget: '50', loop: 'Enterprise tool-use agent', history: 'full conversation' },
            bird: { datasets: [['all', 'Schema-disjoint split']], budget: '1', loop: 'Text-to-SQL executor', history: 'one SQL query' }
        };

        const MECH = {
            'no-skill': {
                on: ['task', 'executor', 'trajectory'],
                layout: { task: [1, 1], executor: [1, 3], trajectory: [1, 5] },
                edges: [['right', 1, 2], ['right', 1, 4]],
                labels: { trajectory: 'Trajectory' },
                chips: {
                    task: 'current task',
                    executor: 'frozen',
                    trajectory: 'discarded'
                },
                flow: ['node:task', 'edge:0', 'node:executor', 'edge:1', 'node:trajectory'],
                caption: 'No memory path — experience ends with the episode.'
            },
            skillos: {
                on: ['task', 'retriever', 'executor', 'trajectory', 'curator', 'bank'],
                layout: { task: [1, 1], retriever: [1, 3], executor: [1, 7], trajectory: [3, 7], curator: [3, 5], bank: [3, 3] },
                edges: [['right', 1, 2], ['long-right', 1, 4, 7], ['down', 2, 7], ['left', 3, 6], ['left', 3, 4], ['vertical-bidirectional', 2, 3]],
                labels: { bank: 'Skill bank', retriever: 'Skill retriever', curator: 'Skill Curator' },
                chips: {
                    task: 'current task',
                    retriever: 'top-K skills',
                    executor: 'frozen',
                    trajectory: 'completed episode',
                    curator: 'no-op · create · update · delete',
                    bank: 'reusable skills'
                },
                flow: ['node:task', 'edge:0', ['node:bank', 'edge:5', 'node:retriever'], 'edge:1', 'node:executor', 'edge:2', 'node:trajectory', 'edge:3', 'node:curator', 'edge:4', 'node:bank'],
                caption: 'SkillOS — retrieve reusable skills before acting; after the episode, distill the new trajectory into the skill bank for later tasks.'
            },
            memcurator: {
                on: ['task', 'bank', 'retriever', 'curator', 'executor', 'trajectory'],
                layout: { task: [1, 1], retriever: [1, 3], curator: [1, 5], executor: [1, 7], trajectory: [3, 7], bank: [3, 3] },
                edges: [['right', 1, 2], ['right', 1, 4], ['right', 1, 6], ['down', 2, 7], ['long-left', 3, 4, 7], ['vertical-bidirectional', 2, 3]],
                labels: { bank: 'Trajectory bank', retriever: 'Trace retriever', curator: 'Skill Curator' },
                chips: {
                    task: 'current task',
                    retriever: 'top-K traces',
                    curator: 'task-adaptive skill',
                    executor: 'frozen',
                    trajectory: 'stored whole',
                    bank: 'raw trajectories'
                },
                flow: ['node:task', 'edge:0', ['node:bank', 'edge:5', 'node:retriever'], 'edge:1', 'node:curator', 'edge:2', 'node:executor', 'edge:3', 'node:trajectory', 'edge:4', 'node:bank'],
                caption: 'JitMem — retrieve whole past trajectories after the current task is known, curate a just-in-time skill for the executor, then store the completed trajectory according to the selected policy.'
            }
        };
        const diagramMechanism = (mech) => String(mech).startsWith('memcurator') ? 'memcurator' : mech;

        function stopFlow() {
            if (flowTimer) clearTimeout(flowTimer);
            flowTimer = null;
            if (!board) return;
            board.classList.remove('is-flow-running');
            board.querySelectorAll('.is-flow-current').forEach((element) => element.classList.remove('is-flow-current'));
        }

        function startFlow(mech) {
            stopFlow();
            if (!board) return;
            const cfg = MECH[diagramMechanism(mech)] || MECH['no-skill'];
            const sequence = cfg.flow || [];
            if (!sequence.length) return;
            board.classList.add('is-flow-running');
            flowStep = 0;

            function advance() {
                if (active !== mech) return;
                if (board.offsetParent === null || document.hidden) {
                    flowTimer = setTimeout(advance, 500);
                    return;
                }
                board.querySelectorAll('.is-flow-current').forEach((element) => element.classList.remove('is-flow-current'));
                const stepTargets = Array.isArray(sequence[flowStep]) ? sequence[flowStep] : [sequence[flowStep]];
                stepTargets.forEach((stepTarget) => {
                    const [kind, id] = stepTarget.split(':');
                    const target = kind === 'node'
                        ? board.querySelector(`[data-node="${id}"]`)
                        : board.querySelector(`[data-flow-index="${id}"]`);
                    if (target) target.classList.add('is-flow-current');
                });
                flowStep = (flowStep + 1) % sequence.length;
                flowTimer = setTimeout(advance, flowStep === 0 ? 1400 : 850);
            }

            advance();
        }

        function paintBoard(mech) {
            const displayMech = diagramMechanism(mech);
            const cfg = MECH[displayMech] || MECH['no-skill'];
            const on = new Set(cfg.on);
            if (board) board.dataset.activeMech = displayMech;
            if (board) board.querySelectorAll('.pg-flow-edge').forEach((edge) => edge.remove());
            nodes.forEach((el) => {
                const id = el.dataset.node;
                const lit = on.has(id);
                el.classList.toggle('is-on', lit);
                el.classList.toggle('is-dim', !lit);
                el.classList.toggle('is-dead', mech === 'no-skill' && id === 'trajectory' && lit);
                const position = cfg.layout && cfg.layout[id];
                el.style.gridRow = position ? String(position[0]) : '';
                el.style.gridColumn = position ? String(position[1]) : '';
                const label = el.querySelector('[data-node-label]');
                const defaults = { task: 'Task', executor: 'Executor', trajectory: 'Trajectory', curator: 'Curator', bank: 'Memory bank', retriever: 'Retriever' };
                if (label) label.textContent = (cfg.labels && cfg.labels[id]) || defaults[id] || id;
                const chip = el.querySelector('[data-chip]');
                if (chip) {
                    const text = lit ? (cfg.chips[id] || '') : '';
                    chip.textContent = text;
                    chip.hidden = !text;
                }
            });
            if (board) {
                (cfg.edges || []).forEach(([direction, row, column, endColumn], edgeIndex) => {
                    const edge = document.createElement('span');
                    edge.className = 'pg-flow-edge is-' + direction;
                    edge.dataset.flowIndex = String(edgeIndex);
                    edge.setAttribute('aria-hidden', 'true');
                    edge.style.gridRow = String(row);
                    edge.style.gridColumn = direction === 'long-left' || direction === 'long-right' ? `${column} / ${endColumn || 9}` : String(column);
                    board.appendChild(edge);
                });
            }
            if (caption) caption.textContent = cfg.caption;
            startFlow(mech);
        }

        function syncDatasetOptions() {
            if (!domain) return;
            const benchmark = (bench && bench.value) || 'alfworld';
            const config = BENCHMARK_CONFIG[benchmark] || BENCHMARK_CONFIG.alfworld;
            const previous = domain.value;
            domain.innerHTML = config.datasets.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
            if (config.datasets.some(([value]) => value === previous)) domain.value = previous;
            if (domainLabel) domainLabel.textContent = benchmark === 'tau2' || benchmark === 'enterpriseops' ? 'Domain' : 'Dataset';
        }

        function show(mech) {
            const benchmark = (bench && bench.value) || 'alfworld';
            const benchmarkConfig = BENCHMARK_CONFIG[benchmark] || BENCHMARK_CONFIG.alfworld;
            const isTau2 = benchmark === 'tau2';
            const datasetBenchmark = benchmark !== 'alfworld';
            syncDatasetOptions();
            const allowedMechanisms = ['no-skill', 'skillos'];
            if (!allowedMechanisms.includes(mech)) mech = 'skillos';
            const previous = active;
            active = mech;
            if (mechanism && mechanism.value !== mech) mechanism.value = mech;
            const noSkill = mech === 'no-skill';
            if (mechanism) {
                Array.from(mechanism.options).forEach((option) => {
                    const unavailable = !allowedMechanisms.includes(option.value);
                    option.disabled = unavailable;
                    option.hidden = unavailable;
                });
            }
            if (domainField) domainField.hidden = !datasetBenchmark;
            if (userModelField) userModelField.hidden = !isTau2;
            if (evaluatorModelField) evaluatorModelField.hidden = !isTau2;
            if (agentLoop) agentLoop.textContent = benchmarkConfig.loop;
            if (history) history.textContent = benchmarkConfig.history;
            if (budget) budget.value = benchmarkConfig.budget;
            const overview = document.getElementById('pg-overview');
            if (overview) overview.hidden = false;
            if (datasetBenchmark && curator) curator.value = 'gpt-5.6-luna';
            if (datasetBenchmark && judge) judge.value = 'gpt-5.6-luna';
            if (curator) curator.disabled = noSkill;
            if (judge) judge.disabled = noSkill || datasetBenchmark;
            if (topk) topk.disabled = true;
            if (budget) budget.disabled = true;
            if (curatorField) curatorField.classList.toggle('is-unused', noSkill);
            if (judgeField) judgeField.classList.toggle('is-unused', noSkill || datasetBenchmark);
            if (topkField) topkField.classList.toggle('is-unused', noSkill);
            if (memoryFilter) memoryFilter.disabled = diagramMechanism(mech) !== 'memcurator';
            if (memoryFilterField) memoryFilterField.classList.toggle('is-unused', diagramMechanism(mech) !== 'memcurator');
            if (epochs) {
                Array.from(epochs.options).forEach((opt) => {
                    const locked = noSkill && parseInt(opt.value, 10) > 1;
                    opt.disabled = locked;
                    opt.hidden = locked;
                });
                if (noSkill) {
                    if (previous !== 'no-skill' && epochs.value !== '1') savedEpoch = epochs.value;
                    epochs.value = '1';
                    epochs.disabled = false;
                } else if (previous === 'no-skill') {
                    const restore = Array.from(epochs.options).some((opt) => opt.value === savedEpoch);
                    if (restore) epochs.value = savedEpoch;
                    epochs.disabled = false;
                } else {
                    savedEpoch = epochs.value;
                }
            }
            if (trial) {
                Array.from(trial.options).forEach((opt) => {
                    const locked = noSkill && opt.value !== 'trial1';
                    opt.disabled = locked;
                    opt.hidden = locked;
                });
                if (noSkill) {
                    if (previous !== 'no-skill' && trial.value !== 'trial1') savedTrial = trial.value;
                    trial.value = 'trial1';
                } else if (previous === 'no-skill') {
                    const restore = Array.from(trial.options).some((opt) => opt.value === savedTrial);
                    if (restore) trial.value = savedTrial;
                } else {
                    savedTrial = trial.value;
                }
            }

            tabs.forEach((tab) => {
                const on = tab.dataset.mech === diagramMechanism(mech);
                tab.classList.toggle('is-active', on);
                tab.setAttribute('aria-selected', on ? 'true' : 'false');
                tab.disabled = !allowedMechanisms.includes(tab.dataset.mech);
            });
            paintBoard(mech);
        }

        function manifestRows(mech) {
            if (!pgExpt.loaded) return [];
            const benchmark = (bench && bench.value) || 'alfworld';
            const split = benchmark === 'alfworld' ? 'valid_seen' : 'train';
            return pgExpt.leaves.map((leaf) => {
                const parts = String(leaf).split('/');
                return {
                    mech: parts[0],
                    pair: parts[1],
                    epoch: parts[2],
                    trial: parts[3],
                    split: parts[4]
                };
            }).filter((row) => {
                const benchmarkMatch = benchmark === 'alfworld'
                    ? !/^(tau2|enterpriseops|bird)-/.test(row.pair)
                    : row.pair.startsWith(benchmark + '-');
                return row.mech === mech && row.split === split && benchmarkMatch;
            });
        }

        function setOptions(select, allowed, hideUnavailable) {
            if (!select) return;
            Array.from(select.options).forEach((option) => {
                const available = allowed.has(option.value);
                option.disabled = !available;
                option.hidden = Boolean(hideUnavailable && !available);
                option.title = available ? '' : 'No imported run is available for this choice.';
            });
            if (select.selectedOptions[0] && select.selectedOptions[0].disabled) {
                const fallback = Array.from(select.options).find((option) => !option.disabled);
                if (fallback) select.value = fallback.value;
            }
        }

        function syncAvailability() {
            if (!pgExpt.loaded) return;
            const cfg = pgExpt.readConfig();
            if (cfg.mech === 'no-skill') return;

            if (cfg.benchmark !== 'alfworld') {
                const rows = manifestRows(cfg.mech).filter((row) => row.pair === cfg.pair);
                setOptions(trial, new Set(rows.map((row) => row.trial)), true);
                const epochNumbers = new Set(rows.map((row) => String(parseInt(row.epoch.replace('epoch_', ''), 10))));
                setOptions(epochs, epochNumbers, true);
                return;
            }

            let rows = manifestRows(cfg.mech);
            const pairs = new Set(rows.map((row) => row.pair));
            const curatorModels = new Set(Array.from(pairs).map((pair) => pair.split('-')[0]));
            setOptions(curator, new Set(Array.from(curator.options).filter((option) => curatorModels.has(pgExpt.shortModel(option.value))).map((option) => option.value)), false);

            const selectedCurator = pgExpt.shortModel(curator && curator.value);
            const judgeModels = new Set(Array.from(pairs).filter((pair) => pair.startsWith(selectedCurator + '-')).map((pair) => pair.split('-')[1]));
            setOptions(judge, new Set(Array.from(judge.options).filter((option) => judgeModels.has(pgExpt.shortModel(option.value))).map((option) => option.value)), false);

            const selectedPair = selectedCurator + '-' + pgExpt.shortModel(judge && judge.value);
            rows = rows.filter((row) => row.pair === selectedPair);
            setOptions(trial, new Set(rows.map((row) => row.trial)), true);

            const selectedTrial = trial && trial.value;
            const epochNumbers = new Set(rows.filter((row) => row.trial === selectedTrial).map((row) => String(parseInt(row.epoch.replace('epoch_', ''), 10))));
            setOptions(epochs, epochNumbers, true);
        }

        function showAndLoad(mech) {
            show(mech);
            syncAvailability();
            pgExpt.apply();
        }

        pgExpt.syncConfig = syncAvailability;

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => showAndLoad(tab.dataset.mech));
        });
        if (mechanism) mechanism.addEventListener('change', () => showAndLoad(mechanism.value));
        if (bench) bench.addEventListener('change', () => {
            const available = ['skillos', 'no-skill'].filter((candidate) => manifestRows(candidate).length > 0);
            const next = available.includes(active) ? active : (available[0] || active);
            showAndLoad(next);
        });
        [domain, executor, curator, judge, memoryFilter, epochs, trial].forEach((el) => {
            if (el) el.addEventListener('change', () => showAndLoad(active));
        });
        show(active);

        const wip = document.getElementById('pg-wip');
        const wipToggle = document.getElementById('pg-wip-toggle');
        const wipBody = document.getElementById('pg-wip-body');
        if (wip && wipToggle && wipBody) {
            wipToggle.addEventListener('click', () => {
                const open = wip.classList.toggle('is-open');
                wip.classList.toggle('is-folded', !open);
                wipToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                wipToggle.setAttribute('aria-label', open ? 'Collapse Mechanism' : 'Expand Mechanism');
                const symbol = wipToggle.querySelector('.pg-wip-symbol');
                if (symbol) symbol.textContent = open ? '−' : '+';
                wipBody.hidden = !open;
                if (open) startFlow(active);
                else stopFlow();
            });
        }
    })();

    (function initEvolutionReplay() {
        const root = document.getElementById('pg-replay');
        if (!root) return;

        const playBtn = document.getElementById('pg-replay-play');
        const resetBtn = document.getElementById('pg-replay-reset');
        const range = document.getElementById('pg-replay-range');
        const posEl = document.getElementById('pg-replay-pos');
        const detailsEl = document.getElementById('pg-replay-details');
        const detailsToggle = document.getElementById('pg-details-toggle');
        const demoFrame = document.getElementById('playground-dashboard-frame');

        let demoReady = false;
        let pendingSeek = null;
        let loadSeq = 0;

        function seekDashboard(i) {
            pendingSeek = i;
            if (!demoFrame || !demoFrame.contentWindow || !demoReady) return;
            demoFrame.contentWindow.postMessage(
                { source: 'sea-playground', type: 'seek', index: i },
                '*'
            );
            pendingSeek = null;
        }

        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || data.source !== 'memcurator') return;
            if (data.type === 'ready') {
                demoReady = true;
                if (pendingSeek != null) seekDashboard(pendingSeek);
            }
            if (data.type === 'seeked' && Number.isFinite(Number(data.index))) {
                stopPlay();
                paint(Number(data.index) + 1);
            }
        });
        document.addEventListener('pg-dashboard-reload', () => {
            demoReady = false;
        });

        let results = [];
        let completed = 0;
        let playing = false;
        let timer = null;

        if (detailsToggle && detailsEl) {
            detailsToggle.addEventListener('click', () => {
                const expanded = detailsToggle.getAttribute('aria-expanded') !== 'true';
                detailsToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                detailsToggle.textContent = expanded ? 'Hide detailed stats' : 'Show detailed stats';
                detailsEl.classList.toggle('is-detailed', expanded);
            });
        }

        function isSuccess(row) {
            // Environment success is authoritative for the playground.
            // Judge predictions stay out of metrics pending the TODO analysis.
            if (row && row.env_success != null) return Number(row.env_success) === 1;
            if (row && row.success != null) return row.success === true || Number(row.success) === 1;
            return Boolean(row && Number(row.hard) === 1);
        }

        function parseResultsJsonl(text) {
            return text.trim().split('\n').filter(Boolean).map((line) => {
                const row = JSON.parse(line);
                row.success = isSuccess(row);
                return row;
            }).sort((a, b) => {
                const na = parseInt(String(a.id).replace(/\D/g, '') || '0', 10);
                const nb = parseInt(String(b.id).replace(/\D/g, '') || '0', 10);
                return na - nb;
            });
        }

        function emptyReplay(message) {
            results = [];
            completed = 0;
            if (range) range.max = '0';
            if (posEl) posEl.textContent = '—';
            renderReplayDetails([]);
        }

        function replayMean(values) {
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        }

        function replayMedian(values) {
            if (!values.length) return null;
            const sorted = values.slice().sort((a, b) => a - b);
            const middle = Math.floor(sorted.length / 2);
            return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        }

        function renderReplayDetails(rows) {
            if (!detailsEl) return;
            const safeRows = rows || [];
            const mechanismSelect = document.getElementById('pg-mechanism');
            const isNoSkill = mechanismSelect && mechanismSelect.value === 'no-skill';
            const success = safeRows.filter((row) => row.success).length;
            const steps = safeRows.map((row) => Number(row.n_turns)).filter(Number.isFinite);
            const totalTokens = safeRows.map((row) => Number(row.total_tokens)).filter(Number.isFinite);
            const latest = safeRows[safeRows.length - 1] || {};
            const bankSize = latest.repo_size_after ?? latest.bank_size_after ?? 0;
            const fmt = (value) => value == null ? '—' : value.toFixed(1);
            const estimateSkillTokens = (text) => Math.ceil(String(text || '').trim().length / 4);
            const currentSkills = new Map();
            safeRows.forEach((row) => {
                const ops = Array.isArray(row.curation && row.curation.ops) ? row.curation.ops : [];
                ops.forEach((op) => {
                    if (op.ok === false) return;
                    const args = op.arguments || {};
                    const oldName = String(args.skill_name || args.new_name || '').trim();
                    const nextName = String(args.new_name || args.skill_name || '').trim();
                    if (op.tool === 'skill_delete') {
                        currentSkills.delete(oldName);
                    } else if (op.tool === 'new_skill_insert' && nextName) {
                        currentSkills.set(nextName, String(args.content || args.new_content || ''));
                    } else if (op.tool === 'skill_update' && nextName) {
                        const content = String(args.new_content || args.content || currentSkills.get(oldName) || '');
                        if (oldName && oldName !== nextName) currentSkills.delete(oldName);
                        currentSkills.set(nextName, content);
                    }
                });
            });
            let skillTokenCounts = Array.from(currentSkills.values()).map(estimateSkillTokens).filter((value) => value > 0);
            if (!skillTokenCounts.length && !isNoSkill) {
                skillTokenCounts = safeRows.map((row) => estimateSkillTokens(row.jit_skill)).filter((value) => value > 0);
            }
            const meanTokensPerSkill = replayMean(skillTokenCounts);
            const executorCards = [
                [safeRows.length, 'tasks'],
                [safeRows.length ? Math.round(100 * success / safeRows.length) + '%' : '—', 'success rate'],
                [fmt(replayMean(steps)), 'mean steps'],
                [replayMean(totalTokens) == null ? '—' : Math.round(replayMean(totalTokens)).toLocaleString(), 'mean tokens'],
                [meanTokensPerSkill == null ? '—' : Math.round(meanTokensPerSkill).toLocaleString(), 'mean tokens / skill']
            ];
            const successfulSteps = safeRows.filter((row) => row.success).map((row) => Number(row.n_turns)).filter(Number.isFinite);
            const failedSteps = safeRows.filter((row) => !row.success).map((row) => Number(row.n_turns)).filter(Number.isFinite);
            const budgetHits = safeRows.filter((row) => Number(row.n_turns) >= Number(row.max_turns || 30)).length;
            const executorTokenTotals = {};
            safeRows.forEach((row) => {
                ['prompt_tokens', 'reasoning_tokens', 'output_tokens'].forEach((key) => {
                    const value = Number(row[key]);
                    if (Number.isFinite(value)) executorTokenTotals[key] = (executorTokenTotals[key] || 0) + value;
                });
            });
            const executorTokenEntries = ['prompt_tokens', 'reasoning_tokens', 'output_tokens']
                .filter((key) => executorTokenTotals[key] != null)
                .map((key) => [key, executorTokenTotals[key]]);
            const executorTokenTotal = totalTokens.reduce((sum, value) => sum + value, 0);

            const opCounts = { failed: 0, 'no-op': 0, create: 0, update: 0, delete: 0 };
            const curatorTokens = {};
            let curatorCalls = 0;
            safeRows.forEach((row) => {
                const curation = row.curation || {};
                const ops = Array.isArray(curation.ops) ? curation.ops : [];
                if (row.curation) {
                    curatorCalls++;
                    if (!ops.length) {
                        if (curation.failed || curation.error) opCounts.failed++;
                        else opCounts['no-op']++;
                    }
                }
                ops.forEach((op) => {
                    if (op.ok === false) opCounts.failed++;
                    else if (op.tool === 'new_skill_insert' || op.tool === 'trajectory_store') opCounts.create++;
                    else if (op.tool === 'skill_update') opCounts.update++;
                    else if (op.tool === 'skill_delete') opCounts.delete++;
                    else opCounts.failed++;
                });
                Object.entries(curation.usage || {}).forEach(([key, value]) => {
                    const number = Number(value);
                    if (Number.isFinite(number)) curatorTokens[key] = (curatorTokens[key] || 0) + number;
                });
            });

            const judged = safeRows.filter((row) => row.judge_success === 0 || row.judge_success === 1 || row.judge_success === false || row.judge_success === true);
            const agreements = judged.filter((row) => Boolean(Number(row.judge_success)) === Boolean(row.success)).length;
            const falsePositive = judged.filter((row) => Boolean(Number(row.judge_success)) && !row.success).length;
            const falseNegative = judged.filter((row) => !Boolean(Number(row.judge_success)) && row.success).length;
            const truePositive = judged.filter((row) => Boolean(Number(row.judge_success)) && row.success).length;
            const trueNegative = judged.filter((row) => !Boolean(Number(row.judge_success)) && !row.success).length;
            const predictedSuccess = truePositive + falsePositive;
            const predictedFailure = trueNegative + falseNegative;
            const judgeTokens = {};
            judged.forEach((row) => {
                Object.entries(row.judge_usage || {}).forEach(([key, value]) => {
                    const number = Number(value);
                    if (Number.isFinite(number)) judgeTokens[key] = (judgeTokens[key] || 0) + number;
                });
            });
            const statCards = (items) => items.map(([value, label]) => `<div class="pg-replay-stat"><b>${value}</b><span>${label}</span></div>`).join('');
            const percentRows = (items, total, labels) => items.map(([key, value]) => {
                const percent = total ? 100 * Number(value) / total : 0;
                const label = (labels && labels[key]) || String(key).replaceAll('_', ' ');
                return `<span><i>${label}</i><b>${percent < 1 && percent > 0 ? percent.toFixed(1) : Math.round(percent)}%</b></span>`;
            }).join('');
            const percentLine = (items, total, labels) => items.length
                ? `<div class="pg-replay-percent-line">${percentRows(items, total, labels)}</div>`
                : '<div class="pg-replay-percent-line is-empty">—</div>';
            const compactLine = (items) => items.length
                ? `<div class="pg-replay-percent-line">${items.map(([label, value]) => `<span><i>${label}</i><b>${value}</b></span>`).join('')}</div>`
                : '<div class="pg-replay-percent-line is-empty">—</div>';
            const tokenLabels = { prompt_tokens: 'Prompt', reasoning_tokens: 'Reasoning', output_tokens: 'Output', completion_tokens: 'Completion' };
            const operationLabels = { failed: 'Failed', 'no-op': 'No-op', create: 'Create', update: 'Update', delete: 'Delete' };
            const operationEntries = ['failed', 'no-op', 'create', 'update', 'delete'].map((key) => [key, opCounts[key]]);
            const operationTotal = operationEntries.reduce((sum, [, value]) => sum + value, 0);
            const preferredTokenKeys = ['prompt_tokens', 'reasoning_tokens', 'output_tokens'];
            let tokenEntries = preferredTokenKeys.filter((key) => curatorTokens[key] != null).map((key) => [key, curatorTokens[key]]);
            if (!tokenEntries.length) {
                tokenEntries = ['prompt_tokens', 'completion_tokens'].filter((key) => curatorTokens[key] != null).map((key) => [key, curatorTokens[key]]);
            }
            const tokenTotal = Number(curatorTokens.total_tokens) || tokenEntries.reduce((sum, [, value]) => sum + value, 0);
            const tokensInMillions = tokenTotal ? tokenTotal / 1000000 : null;
            const compactTokenTotal = tokensInMillions == null
                ? '—'
                : `${tokensInMillions.toFixed(tokensInMillions < 0.1 ? 3 : tokensInMillions < 10 ? 2 : 1)}M`;
            const curatorSection = isNoSkill
                ? '<section class="pg-replay-detail-section"><h4>Curator stats</h4></section>'
                : `<section class="pg-replay-detail-section"><h4>Curator stats</h4><div class="pg-replay-stat-grid">${statCards([[curatorCalls, 'calls'], [bankSize, 'bank size'], [compactTokenTotal, 'total tokens']])}</div><div class="pg-replay-stat-details"><h5>Operations by type</h5>${percentLine(operationEntries, operationTotal, operationLabels)}<h5>Token usage</h5>${percentLine(tokenEntries, tokenTotal, tokenLabels)}</div></section>`;
            const executorSection = `<section class="pg-replay-detail-section pg-replay-task-summary"><h4>Executor stats</h4><div class="pg-replay-stat-grid">${statCards(executorCards)}</div><div class="pg-replay-stat-details"><h5>Step efficiency</h5>${compactLine([['Success', fmt(replayMean(successfulSteps))], ['Failure', fmt(replayMean(failedSteps))], ['Budget hit', safeRows.length ? Math.round(100 * budgetHits / safeRows.length) + '%' : '—']])}<h5>Token usage</h5>${percentLine(executorTokenEntries, executorTokenTotal, tokenLabels)}</div></section>`;
            const judgeTokenEntries = ['prompt_tokens', 'reasoning_tokens', 'output_tokens']
                .filter((key) => judgeTokens[key] != null)
                .map((key) => [key, judgeTokens[key]]);
            const judgeTokenTotal = Number(judgeTokens.total_tokens) || judgeTokenEntries.reduce((sum, [, value]) => sum + value, 0);
            const judgeSection = isNoSkill
                ? '<section class="pg-replay-detail-section"><h4>Self-judge stats</h4></section>'
                : `<section class="pg-replay-detail-section"><h4>Self-judge stats</h4><div class="pg-replay-stat-grid">${statCards([[judged.length, 'recorded'], [judged.length ? Math.round(100 * agreements / judged.length) + '%' : '—', 'agreement'], [falsePositive, 'false positive'], [falseNegative, 'false negative']])}</div><div class="pg-replay-stat-details"><div class="pg-replay-subgrid"><div><h5>Prediction mix</h5>${percentLine([['success', predictedSuccess], ['failure', predictedFailure]], judged.length, { success: 'Success', failure: 'Failure' })}</div><div><h5>Agreement detail</h5>${percentLine([['tp', truePositive], ['tn', trueNegative], ['fp', falsePositive], ['fn', falseNegative]], judged.length, { tp: 'TP', tn: 'TN', fp: 'FP', fn: 'FN' })}</div></div><h5>Token usage</h5>${percentLine(judgeTokenEntries, judgeTokenTotal, tokenLabels)}</div></section>`;
            detailsEl.innerHTML = `${executorSection}
                ${curatorSection}
                ${judgeSection}`;
        }

        async function loadLeaf(run, found, runs) {
            const seq = ++loadSeq;
            stopPlay();
            const chain = (runs && runs.length) ? runs : (run ? [run] : []);
            if (!found || !chain.length) {
                emptyReplay('No completed production run is available for this configuration.');
                return;
            }
            try {
                const parts = [];
                for (const leaf of chain) {
                    const res = await fetch(PLAYGROUND_DATA_ROOT + '/' + leaf + '/results.jsonl');
                    if (!res.ok) throw new Error('missing');
                    parts.push(parseResultsJsonl(await res.text()));
                }
                if (seq !== loadSeq) return;
                results = parts.reduce((all, chunk) => all.concat(chunk), []);
                if (range) range.max = String(results.length);
                paint(results.length);
            } catch (err) {
                if (seq !== loadSeq) return;
                emptyReplay('No completed production run is available for this configuration.');
            }
        }

        function paint(c) {
            if (!results.length) return;
            completed = Math.max(0, Math.min(c, results.length));
            const index = completed - 1;

            if (range) range.value = String(completed);
            if (posEl) posEl.textContent = completed + ' / ' + results.length;
            renderReplayDetails(results.slice(0, completed));

            seekDashboard(index);
        }

        function stopPlay() {
            playing = false;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            if (playBtn) playBtn.textContent = 'Play';
        }

        function startPlay() {
            if (!results.length) return;
            playing = true;
            if (playBtn) playBtn.textContent = 'Pause';
            const replay = document.getElementById('pg-replay');
            if (replay && replay.scrollIntoView) {
                replay.scrollIntoView({ block: 'start', inline: 'nearest' });
            }
            if (completed >= results.length) paint(0);
            timer = setInterval(() => {
                if (completed >= results.length) {
                    stopPlay();
                    return;
                }
                paint(completed + 1);
            }, 420);
        }

        if (range) {
            range.addEventListener('input', () => {
                stopPlay();
                paint(parseInt(range.value, 10) || 0);
            });
        }
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                if (playing) stopPlay();
                else startPlay();
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                stopPlay();
                paint(0);
            });
        }

        document.addEventListener('pg-run', (event) => {
            const detail = event.detail || {};
            loadLeaf(detail.run, detail.found, detail.runs);
        });
    })();

    (function initTrajectoryCompare() {
        const tray = document.getElementById('trajectory-compare-tray');
        const slots = document.getElementById('trajectory-compare-slots');
        const openButton = document.getElementById('trajectory-compare-open');
        const clearButton = document.getElementById('trajectory-compare-clear');
        const panel = document.getElementById('trajectory-compare-panel');
        const grid = document.getElementById('trajectory-compare-grid');
        const closeButton = document.getElementById('trajectory-compare-close');
        if (!tray || !slots || !openButton || !panel || !grid) return;
        let saved = [];

        function esc(value) {
            return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
        }

        function runLabel(run) {
            const parts = String(run || '').split('/');
            const names = { 'no-skill': 'No-skill', skillos: 'SkillOS', memcurator: 'JitMem · all', 'memcurator-success-only': 'JitMem · successful', 'memcurator-latest': 'JitMem · latest', 'memcurator-success-latest': 'JitMem · successful + latest' };
            const mechanism = names[parts[0]] || parts[0] || 'Experiment';
            const epoch = parts[2] && parts[2] !== 'n-a' ? ` · epoch ${parseInt(parts[2].replace(/\D/g, ''), 10)}` : ' · epoch 0';
            const pair = parts[1] && parts[1] !== 'none' ? ` · ${parts[1].replace('-', '/')}` : '';
            return mechanism + pair + epoch + (parts[3] ? ` · ${parts[3].replace('trial', 'trial ')}` : '');
        }

        function curationText(curation) {
            if (!curation) return 'Not recorded';
            if (curation.skipped) return 'Skipped';
            if (Array.isArray(curation.ops) && curation.ops.length) {
                return curation.ops.map((op) => {
                    const tool = String(op.tool || 'operation').replaceAll('_', ' ');
                    const args = op.arguments || {};
                    return tool + (args.skill_name ? ` · ${args.skill_name}` : '');
                }).join('; ');
            }
            if (curation.jit_skill_chars != null) return `Generated JIT skill · ${curation.jit_skill_chars} characters`;
            return 'No bank mutation recorded';
        }

        function curatorAuditHtml(item) {
            const curation = item.curation || {};
            const records = [];
            if (curation.raw_text) records.push(`<p><strong>Rationale / raw response</strong>${esc(curation.raw_text)}</p>`);
            if (item.jitSkill) records.push(`<p><strong>Exact JIT memory</strong>${esc(item.jitSkill)}</p>`);
            (curation.ops || []).forEach((op, index) => {
                records.push(`<p><strong>Operation ${index + 1} · ${esc(op.tool || 'unknown')}</strong>${esc(JSON.stringify({ arguments: op.arguments || {}, ok: op.ok, reason: op.reason }, null, 2))}</p>`);
            });
            const meta = { skipped: curation.skipped, n_retrieved: curation.n_retrieved, n_ops: curation.n_ops, n_valid: curation.n_valid, usage: curation.usage, stored_traj: item.storedTraj || null, bank_before: item.bankBefore, bank_after: item.bankAfter };
            records.push(`<details class="compare-curator-raw"><summary>Raw curator metadata</summary><pre>${esc(JSON.stringify(meta, null, 2))}</pre></details>`);
            return records.join('');
        }

        function itemCard(item, includeSteps) {
            const judgeRecorded = item.judgeSuccess === 0 || item.judgeSuccess === 1 || item.judgeSuccess === true || item.judgeSuccess === false;
            const judgeOk = item.judgeSuccess === 1 || item.judgeSuccess === true;
            const retrieved = item.retrieved && item.retrieved.length
                ? item.retrieved.map((skill) => `<span>${esc(skill)}</span>`).join('')
                : '<em>None</em>';
            const stepRows = (item.steps || []).map((step) => `<details class="compare-step">
                <summary><b>Step ${esc(step.number)}</b><span>${esc(step.action || 'No action')}</span></summary>
                ${step.reasoning ? `<p><strong>Think</strong>${esc(step.reasoning)}</p>` : ''}
                ${step.feedback ? `<p><strong>Environment</strong>${esc(step.feedback)}</p>` : ''}
            </details>`).join('');
            return `<article class="trajectory-compare-card">
                <header><span>${esc(runLabel(item.run))}</span><h4>${esc(item.id)} · ${esc(item.nTurns)} steps</h4></header>
                <dl>
                    <div><dt>Original query</dt><dd>${esc(item.query || '—')}</dd></div>
                    <div><dt>Retrieved skills / traces</dt><dd class="compare-tags">${retrieved}</dd></div>
                    <div><dt>Environment outcome</dt><dd><b class="compare-result ${item.envSuccess ? 'success' : 'failure'}">${item.envSuccess ? 'Success' : 'Failed'}</b>${item.failReason ? `<p>${esc(item.failReason)}</p>` : ''}</dd></div>
                    <div><dt>Self-judge assessment</dt><dd>${judgeRecorded ? `<b class="compare-result ${judgeOk ? 'success' : 'failure'}">Predicted ${judgeOk ? 'success' : 'failure'}</b>` : '<em>Not recorded</em>'}${item.judgeRationale ? `<p>${esc(item.judgeRationale)}</p>` : ''}</dd></div>
                    <div><dt>Curation decision</dt><dd>${esc(curationText(item.curation))}<div class="compare-curator-output">${curatorAuditHtml(item)}</div></dd></div>
                </dl>
                ${includeSteps ? `<div class="compare-steps"><h5>Trajectory steps</h5>${stepRows || '<p>No trace available.</p>'}</div>` : ''}
            </article>`;
        }

        function normalizedAction(step) {
            return String((step && step.action) || '').trim().toLowerCase().replace(/\s+/g, ' ');
        }

        function alignSteps(leftSteps, rightSteps) {
            const left = leftSteps || [];
            const right = rightSteps || [];
            const length = Math.max(left.length, right.length);
            return Array.from({ length: length }, (_, index) => {
                const leftStep = left[index] || null;
                const rightStep = right[index] || null;
                let status = 'different';
                if (!leftStep) status = 'right-only';
                else if (!rightStep) status = 'left-only';
                else if (normalizedAction(leftStep) === normalizedAction(rightStep)) status = 'same';
                return { left: leftStep, right: rightStep, status: status, ordinal: index + 1 };
            });
        }

        function actionDiffPair(leftStep, rightStep) {
            const left = String((leftStep && leftStep.action) || 'No action').trim().split(/\s+/).filter(Boolean);
            const right = String((rightStep && rightStep.action) || 'No action').trim().split(/\s+/).filter(Boolean);
            const dp = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
            for (let i = left.length - 1; i >= 0; i--) {
                for (let j = right.length - 1; j >= 0; j--) {
                    dp[i][j] = left[i].toLowerCase() === right[j].toLowerCase()
                        ? dp[i + 1][j + 1] + 1
                        : Math.max(dp[i + 1][j], dp[i][j + 1]);
                }
            }
            const leftSame = new Set();
            const rightSame = new Set();
            let i = 0, j = 0;
            while (i < left.length && j < right.length) {
                if (left[i].toLowerCase() === right[j].toLowerCase()) {
                    leftSame.add(i++);
                    rightSame.add(j++);
                } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
                else j++;
            }
            const render = (tokens, same, kind) => tokens.map((token, index) => same.has(index) ? esc(token) : `<mark class="diff-token-${kind}">${esc(token)}</mark>`).join(' ');
            return { left: render(left, leftSame, 'delete'), right: render(right, rightSame, 'add') };
        }

        function diffStepCell(step, actionHtml) {
            if (!step) return '';
            return `<details class="trajectory-diff-step">
                <summary><span>${actionHtml || esc(step.action || 'No action')}</span></summary>
                ${step.reasoning ? `<p><strong>Think</strong>${esc(step.reasoning)}</p>` : ''}
                ${step.feedback ? `<p><strong>Environment</strong>${esc(step.feedback)}</p>` : ''}
            </details>`;
        }

        function stepDiff(left, right) {
            const rows = alignSteps(left.steps, right.steps);
            const different = rows.filter((row) => row.status !== 'same').length;
            const firstDifference = rows.findIndex((row) => row.status !== 'same');
            const counts = rows.reduce((summary, row) => { summary[row.status]++; return summary; }, { same: 0, different: 0, 'left-only': 0, 'right-only': 0 });
            const body = rows.map((row, index) => {
                const actionDiff = row.status === 'different' ? actionDiffPair(row.left, row.right) : null;
                const leftAction = actionDiff ? actionDiff.left : row.status === 'left-only' ? `<mark class="diff-token-delete">${esc(row.left.action || 'No action')}</mark>` : null;
                const rightAction = actionDiff ? actionDiff.right : row.status === 'right-only' ? `<mark class="diff-token-add">${esc(row.right.action || 'No action')}</mark>` : null;
                const marker = { same: '', different: '~', 'left-only': '−', 'right-only': '+' }[row.status];
                return `<tr class="is-${row.status}" data-diff-row="${index}">
                    <th class="trajectory-diff-line" scope="row"><span>${row.left ? esc(row.left.number) : ''}</span><i>${marker}</i></th>
                    <td class="diff-a">${diffStepCell(row.left, leftAction)}</td>
                    <th class="trajectory-diff-line" scope="row"><span>${row.right ? esc(row.right.number) : ''}</span><i>${marker}</i></th>
                    <td class="diff-b">${diffStepCell(row.right, rightAction)}</td>
                </tr>`;
            }).join('');
            return `<section class="trajectory-step-diff">
                <div class="trajectory-step-diff-head">
                    <div><span class="pre">Step-by-step diff checker</span><h4>${different ? `${different} differing step${different === 1 ? '' : 's'}` : 'All actions match'}</h4></div>
                    <p>${firstDifference >= 0 ? `First divergence at step ${firstDifference + 1}` : `${rows.length} matching actions`}</p>
                </div>
                <div class="trajectory-diff-toolbar">
                    <div class="trajectory-diff-counts"><span class="changed">~ ${counts.different} changed</span><span class="deleted">− ${counts['left-only']} removed</span><span class="added">+ ${counts['right-only']} added</span><span>${counts.same} unchanged</span></div>
                    <div class="trajectory-diff-actions"><label><input type="checkbox" data-diff-only> Differences only</label><button type="button" data-diff-nav="prev">↑ Previous</button><button type="button" data-diff-nav="next">↓ Next</button><output data-diff-position>0 / ${different}</output></div>
                </div>
                <div class="trajectory-diff-scroll">
                    <table>
                        <colgroup><col class="diff-line-col"><col><col class="diff-line-col"><col></colgroup>
                        <thead><tr><th colspan="2">A · ${esc(runLabel(left.run))} · ${esc(left.id)}</th><th colspan="2">B · ${esc(runLabel(right.run))} · ${esc(right.id)}</th></tr></thead>
                        <tbody>${body || '<tr><td colspan="4">No step traces available.</td></tr>'}</tbody>
                    </table>
                </div>
            </section>`;
        }

        function wireDiffControls() {
            const diff = grid.querySelector('.trajectory-step-diff');
            if (!diff) return;
            const changes = Array.from(diff.querySelectorAll('tbody tr:not(.is-same)'));
            const position = diff.querySelector('[data-diff-position]');
            let active = -1;
            const move = (direction) => {
                if (!changes.length) return;
                active = (active + direction + changes.length) % changes.length;
                changes.forEach((row, index) => row.classList.toggle('is-focused', index === active));
                if (position) position.textContent = `${active + 1} / ${changes.length}`;
                changes[active].scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
            diff.querySelectorAll('[data-diff-nav]').forEach((button) => button.addEventListener('click', () => move(button.dataset.diffNav === 'next' ? 1 : -1)));
            const only = diff.querySelector('[data-diff-only]');
            if (only) only.addEventListener('change', () => diff.classList.toggle('show-differences-only', only.checked));
        }

        function comparisonHtml() {
            if (saved.length !== 2) return saved.map((item) => itemCard(item, true)).join('');
            return stepDiff(saved[0], saved[1]) + saved.map((item) => itemCard(item, false)).join('');
        }

        function render() {
            tray.hidden = saved.length === 0;
            slots.innerHTML = saved.map((item, index) => `<div class="trajectory-compare-slot"><span>${index + 1}</span><b>${esc(runLabel(item.run))}</b><small>${esc(item.id)}</small><button type="button" data-remove="${index}" aria-label="Remove ${esc(item.id)}">×</button></div>`).join('');
            openButton.disabled = saved.length !== 2;
            if (!panel.hidden) {
                grid.innerHTML = comparisonHtml();
                wireDiffControls();
            }
            slots.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
                saved.splice(Number(button.dataset.remove), 1);
                if (saved.length < 2) panel.hidden = true;
                render();
            }));
        }

        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || data.source !== 'memcurator' || data.type !== 'save-compare' || !data.item) return;
            saved = saved.filter((item) => item.key !== data.item.key);
            saved.push(data.item);
            if (saved.length > 2) saved.shift();
            render();
        });
        openButton.addEventListener('click', () => {
            if (saved.length !== 2) return;
            grid.innerHTML = comparisonHtml();
            wireDiffControls();
            panel.hidden = false;
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        closeButton.addEventListener('click', () => { panel.hidden = true; });
        clearButton.addEventListener('click', () => { saved = []; panel.hidden = true; render(); });
    })();

    fetch(PLAYGROUND_DATA_ROOT + '/manifest.json')
        .then((res) => (res.ok ? res.json() : { leaves: [] }))
        .then((manifest) => {
            pgExpt.leaves = manifest.leaves || [];
        })
        .catch(() => {
            pgExpt.leaves = [];
        })
        .finally(() => {
            pgExpt.loaded = true;
            if (typeof pgExpt.syncConfig === 'function') pgExpt.syncConfig();
            pgExpt.apply();
        });

    // Publications theme filter
    (function initPubsThemes() {
        const themeHost = document.querySelector('[data-pubs-themes]');
        const paperList = document.querySelector('[data-paper-list]');
        const upcomingList = document.querySelector('[data-upcoming-list]');
        if (!themeHost) return;

        const buttons = Array.from(themeHost.querySelectorAll('[data-theme]'));
        const cards = Array.from(document.querySelectorAll('#panel-publications [data-themes]'));
        let active = null;

        function applyTheme(theme, allowToggle = true) {
            if (allowToggle && theme && theme === active) theme = null;
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

        document.querySelectorAll('[data-vision-theme]').forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                applyTheme(link.dataset.visionTheme, false);
                activateTab('publications', { focusTab: true });
                requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            });
        });
    })();
});
