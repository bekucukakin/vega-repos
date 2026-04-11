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
    /** AI-generated analysis fields (populated on demand) */
    private String aiExplanation;
    private String aiRiskSummary;
}
