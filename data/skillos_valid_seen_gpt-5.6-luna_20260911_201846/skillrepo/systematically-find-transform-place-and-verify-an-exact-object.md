---
name: Systematically Find, Transform, Place, and Verify an Exact Object
description: For tasks requiring an exact object to be found, possibly brought to a requested state, and placed in a named receptacle, search every plausible source systematically and verify all final predicates.
---

# Workflow
1. Parse the request into the base object, any explicitly requested state, destination category, and final containment. Treat an adjective as a state requirement when the instruction naturally describes the object’s required condition (for example, “hot X” means X must be heated); treat it as part of a fixed noun only when the environment’s object vocabulary clearly uses it that way. Never silently drop a requested state.
2. Build a finite source checklist from the initial scene. Include every plausible source instance separately: exposed surfaces, cabinets, drawers, refrigerators, counters, tables, sinks, appliances, and other containers. Add nested contents only when actually revealed.
3. Maintain a ledger with source statuses, the first unchecked source, object identity, possession, required state, state status, destination identity, placement status, and verification status.
4. Inspect sources in a deliberate monotonic order. For each source, travel to it and perform the required open or examine action. Only after contents are observed, assign one terminal status: `inspected-empty`, `inspected-containing-target`, or `unavailable`; then advance to the next unchecked source.
5. Distinguish navigation from inspection. Arrival alone does not inspect a source, and an attempted open or examine without an observed contents result does not complete inspection. If an action fails or the trajectory ends mid-search, leave the source unchecked and resume there rather than assuming it is empty.
6. Treat each source as a separate checklist item, including visually exposed surfaces. An observed contents list is authoritative for that source at that moment. Do not skip later sources merely because many earlier sources were empty, and do not restart at already completed sources.
7. When the exact base object is found, record its stable identity, pick it up, and confirm possession. Stop searching immediately; do not substitute a similar object. If all viable sources are terminal without it, report the prerequisite as unavailable.
8. If a state is required, determine its operational context before acting. Place the held object in or on the relevant appliance, identify the actual state-changing affordance, execute it, and confirm the resulting state using explicit feedback or a reliable observation of the same object. Do not infer state from movement, closing, or mere examination.
9. Choose and record one concrete destination instance matching the requested category. Keep tracking the exact object and its state while navigating; do not re-inspect completed sources.
10. Execute the explicit put or place action using the recorded object and destination. If it fails, retry with the same identities after correcting only the immediate interaction issue.
11. Verify independently that the exact recorded object is contained by the destination and still satisfies every requested state predicate. Report success only after containment and state are both confirmed.

# Recovery and Search Discipline
- Keep a pointer to the first source without a terminal status. Before every action, compare the intended source with that pointer; if a source was skipped, inspect it before unrelated actions.
- If the agent loses its place, reconstruct statuses from the complete action and observation history and resume at the first unchecked source.
- Never treat an unfinished trajectory as evidence that the object is absent. Continue until discovery, exhaustive search, or a deliberate unavailability result.
- Preserve stable object identity through pickup, transformation, and placement; a newly observed similar item is not a substitute.

# When Not to Use
Do not use this workflow for purely observational tasks with no locating or placement requirement. If the wording clearly names a fixed object whose adjective is not a condition, omit the transformation phase; otherwise preserve all natural-language state requirements.
