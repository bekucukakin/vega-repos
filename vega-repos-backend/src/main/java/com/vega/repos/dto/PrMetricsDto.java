package com.vega.repos.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PrMetricsDto {
    private long totalPrs;
    private long openCount;
    private long reviewingCount;
    private long approvedCount;
    private long rejectedCount;
    private long mergedCount;
    private long withRiskAnalysisCount;
    private long totalPrsAnalyzed;
    /** How many PRs this user approved (reviewer perspective, from DB) */
    private long reviewerApprovedCount;
    /** How many PRs this user rejected (reviewer perspective, from DB) */
    private long reviewerRejectedCount;
    private long prsWithFeatureCount;
    private long prsWithoutFeatureCount;
    private long totalReviewTimeWithFeatureMs;
    private long totalReviewTimeWithoutFeatureMs;
    private long avgReviewTimeWithFeatureMs;
    private long avgReviewTimeWithoutFeatureMs;
    private double reviewTimeImprovementPercent;
}
