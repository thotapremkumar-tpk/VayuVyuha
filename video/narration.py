"""Narration for the walkthrough: scene key -> list of sentences (shown as subtitles and spoken)."""
SCENES = [
 ("title", ["This is VayuVyuha, our working prototype for dynamic air operations planning.", "Everything you will see runs on synthetic data."]),
 ("overview", ["This is the Command view.", "The planner has built a twelve hour plan.", "Eighteen of twenty seven requested missions are tasked, and every aircraft, crew, weapon and runway limit is respected."]),
 ("mission", ["Click any mission to see its package.", "It shows which aircraft fly it, what they carry, and why this package was chosen."]),
 ("untasked", ["Some requests cannot be met with today's resources.", "For each one, the planner names the limit that blocks it, such as weapon stock, crew hours, or aircraft that are already committed."]),
 ("ground", ["Now let us change the situation.", "One and a half hours in, a jet fails its inspection, so we remove it from the pool."]),
 ("ground_plan", ["The planner re-plans in a fraction of a second, and then waits.", "The banner says what happened and what it recommends.", "The list shows each change and the reason for it.", "Missions that have already launched are never touched.", "We approve."]),
 ("sam", ["Next, a new air defence site appears on a planned route.", "We place it on the map."]),
 ("sam_plan", ["The planner recomputes the risk, and adds an escort where one is needed.", "Let us compare the options.", "Recommended, cautious, and maximum coverage are all valid plans.", "They differ in how much risk and change the commander accepts.", "A manual style re-plan is shown only for reference.", "We approve the recommended plan."]),
 ("tst", ["An urgent target appears, with a seventy five minute window.", "We place it on the map."]),
 ("tst_plan", ["The planner fits it in, and shows which lower value mission gives way.", "We open the new mission to see its package, and then approve."]),
 ("storm", ["Finally, a storm closes a strike corridor.", "We place it on the map as well.", "Missions inside it are moved or dropped, and again we approve."]),
 ("timeline", ["The Timeline view shows every sortie, aircraft by aircraft.", "Shaded bars have already launched.", "Hatched rows are grounded aircraft."]),
 ("fleet", ["The Fleet view shows each base.", "We see weapon stock, crew hours used, and the predicted chance that an aircraft fails its pre-flight check.", "Unreliable aircraft are kept off the highest priority missions."]),
 ("engine", ["The Engine view shows what happens inside.", "Nine rule checks run on every plan.", "We see how the plan was found, what the score is made of, and how much mission value survives across one thousand simulated days of aircraft failures."]),
 ("tradeoff", ["We can also explore the trade-off between risk and coverage.", "Each dot is a complete, valid plan."]),
 ("builtin", ["So far, the exact solver was running on a server.", "The same app also works with no server at all.", "We switch to the built-in engine, which plans inside the browser, and ground another jet.", "It re-plans just as quickly, and we approve."]),
 ("end", ["VayuVyuha.", "One live picture, a new plan in under a second, a reason for every change, and a human who approves.", "Thank you."]),
]
SAY = {"VayuVyuha": "Vaayu Vyooha", "re-plans": "replans", "re-plan": "replan", "pre-flight": "preflight", "trade-off": "trade off", "built-in": "built in", "today's": "todays"}
GAP = 0.28  # seconds of silence between sentences
