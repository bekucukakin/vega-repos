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
    /** Risk Level: LOW, MEDIUM, HIGH (PR etiketi) */
    private String riskLevel;
    /** Risk reasons (özet nedenler) */
    private List<String> riskReasons;
    /** Risk recommendations (öneriler) */
    private List<String> riskRecommendations;
}
