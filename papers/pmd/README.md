# Procedural Memory Distillation

[![Paper](https://img.shields.io/badge/Paper-PDF-red)](assets/Procedural_Memory_Distillation.pdf)
[![License: CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)

Official repository for **Procedural Memory Distillation: Online Reflection for Self-Improving Language Models**.

**Procedural Memory Distillation (PMD)** is a training-time self-improvement framework that converts repeated rollout experience into reusable procedural memory, then distills that memory into the model parameters. The key idea is simple: rather than treating each verifier-labeled rollout as an isolated episode, PMD keeps track of what the model has tried, reflects on what worked or failed, abstracts reusable behaviors, and uses this evolving memory to train the next policy.

<p align="center">
  <img src="assets/PMD_wf.png" width="90%" alt="Overview of Procedural Memory Distillation" />
</p>

## Why PMD?

RLVR and self-distillation methods such as SDPO usually learn from episode-local feedback: a rollout is verified, the policy is updated, and the richer procedural information in that rollout is discarded. PMD instead preserves cross-episode learning signals:

- Which strategies consistently pass verification?
- Which mistakes recur across attempts?
- Which reasoning behaviors transfer across related problems?
- How should memory evolve as the policy itself changes?

PMD treats memory as a **training scaffold**, not an inference-time dependency. The final student model performs inference without external memory retrieval.

## Method Overview

PMD runs a recursive policy-memory co-evolution loop:

1. **Student attempts tasks.** The current policy samples rollouts and receives verifier feedback.
2. **Online memory formation.** Successful and failed attempts are summarized into procedural memory.
3. **Memory-conditioned teacher.** A self-teacher uses relevant memory to provide stronger supervision.
4. **Distill into the student.** The student matches the memory-conditioned teacher on its own sampled trajectories.

## Main Results

PMD improves over strong RLVR and self-distillation baselines on both scientific reasoning and code generation.

### SciKnowEval and LiveCodeBench

| Model | Method | SciKnowEval AVG | LiveCodeBench v6 |
|---|---:|---:|---:|
| Qwen3-8B | Base Policy | 47.9 | 27.1 |
| Qwen3-8B | GRPO | 69.4 | 41.2 |
| Qwen3-8B | SDPO | 74.4 | 47.9 |
| Qwen3-8B | **PMD** | **77.2** | **51.7** |
| OLMo3-Instruct-7B | Base Policy | 27.7 | 27.7 |
| OLMo3-Instruct-7B | GRPO | 63.9 | 36.1 |
| OLMo3-Instruct-7B | SDPO | 69.5 | 45.0 |
| OLMo3-Instruct-7B | **PMD** | **73.3** | **51.1** |

Relative to SDPO, PMD improves:

- **+3.8% to +5.5%** on SciKnowEval.
- **+7.9% to +13.6%** on LiveCodeBench.

The controlled studies show that PMD's gains come from the interaction of three mechanisms: reflective abstraction, persistent memory, and policy-memory co-evolution.

## Key Findings

- **Procedural memory provides a strong self-learning signal.** PMD consistently improves over GRPO and SDPO across model families and benchmarks.
- **Co-evolution matters.** Freezing either memory or policy substantially underperforms full PMD, showing that memory must stay aligned with the changing policy.
- **Memory can be internalized.** PMD uses memory only on the teacher path during training; the final student does not require memory at inference.
- **Test-time scaling improves.** PMD preserves broader answer-space coverage than SDPO, leaving more headroom for verifier reranking and best-of-N sampling.

## Citation

```bibtex
@article{liu2026proceduralmemorydistillation,
  title   = {Procedural Memory Distillation: Online Reflection for Self-Improving Language Models},
  author  = {Liu, Ye and Bansal, Srijan and Pang, Bo and Li, Yang and Liu, Zeyu Leo and Ming, Yifei and Ke, Zixuan and Joty, Shafiq and Yavuz, Semih},
  year    = {2026}
}
```

## Contact

For questions, please contact **Ye Liu** at `yeliu@salesforce.com`.

## License

This paper and related assets are released under the Creative Commons Attribution 4.0 International License (CC BY 4.0).

You are free to share and adapt the material, provided that appropriate credit is given.

See [LICENSE](LICENSE) for details.
