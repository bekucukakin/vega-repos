package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * PR metadata - read from HDFS repo/.pr/PR-*.json
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PrDto {
    private String id;
    private String sourceBranch;
    private String targetBranch;
    private String author;
    /** Optional PR description / title from creator */
    private String description;
    private String status;
    private long createdTimestamp;
    private List<String> commitHashes;
    private String diffSummary;
    private boolean hasConflicts;
    private List<String> conflictedFiles;
    /** PR Summary: files changed, lines +/- (rule-based analysis) */
    private Integer summaryFilesChanged;
    private Integer summaryLinesAdded;
    private Integer summaryLinesRemoved;
    /** Risk Level: LOW, MEDIUM, HIGH */
    private String riskLevel;
    /** Risk reasons */
    private List<String> riskReasons;
    /** Risk recommendations */
    private List<String> riskRecommendations;
    /** Optionally assigned reviewer username (set at PR creation time) */
    private String assignedReviewer;
    /** Who approved the PR */
    private String approvedBy;
    /** Who started review */
    private String reviewedBy;
    /** Who rejected the PR */
    private String rejectedBy;
    /** Who merged the PR */
    private String mergedBy;
    /** Timestamps */
    private Long reviewStartedAt;
    private Long reviewCompletedAt;
    /** PR purpose type (BUG_FIX, HOTFIX, NEW_FEATURE, REFACTOR, PERFORMANCE, SECURITY, DOCUMENTATION, CHORE) */
    private String prType;

    /** AI-generated analysis fields (populated on demand) */
    private String aiExplanation;
    private String aiRiskSummary;
    /** Structured AI findings: "SEVERITY:::CATEGORY:::description:::scoreDelta" */
    private List<String> aiFindings;
    /** Score contributed by AI findings */
    private Integer aiScoreDelta;

    /**
     * Analysis reasoning tree — each entry: "icon:::metric:::delta:::reason"
     * Shows exactly WHY the PR got its risk score (one node per scoring contribution).
     */
    private List<String> analysisTree;

    // ── Enriched Risk Metrics (populated at PR creation time) ──

    /** Numeric risk score (0–100+). Drives riskLevel. */
    private Integer riskScore;

    /** Metric 1: File Age — max days since any changed file was last modified in target branch */
    private Integer fileAgeDaysMax;
    /** Metric 1: File Age — average days */
    private Integer fileAgeDaysAvg;
    /** Metric 1: File Age — files not touched in > 90 days */
    private List<String> staleFiles;

    /** Metric 2: Author Diversity — unique authors who touched the changed files */
    private Integer authorDiversityCount;

    /** Metric 3: First-Time Contributor — files the PR author never modified before */
    private List<String> firstTimeFiles;

    /** Metric 4: Test Coverage — % of changed source files that have a test counterpart */
    private Integer testCoveragePercent;

    /** Metric 5: Hotspot Files — files changed >= 6 times in recent history (bug-prone) */
    private List<String> hotspotFiles;

    /** Metric 6: Critical Pattern — security/config sensitive file paths */
    private List<String> criticalPatternFiles;

    /** Metric 7: Change Concentration — average lines changed per file */
    private Double changeConcentration;
}
