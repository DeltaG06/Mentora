"""Flag engine thresholds. This is the ONLY place they are defined.

Locked defaults; calibration to the GCE scheme is deferred. Do not change the
values without a product decision.
"""

F1_SGPA_DROP = 1.0  # drop vs most recent earlier verified result
F2_SUBJECT_FAIL = 40  # raw final_marks below this
F3_SGPA_ABSOLUTE = 6.0
F4_INTERNAL_PCT = 40.0  # percent of max_per_test
F4_INTERNAL_DROP_PTS = 15.0  # percentage points, semester avg vs baseline
ESCALATION_DAYS = 14
