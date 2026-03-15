package com.vega.repos.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * Per-user PR review metrics.
 * Mirrors PRReviewMetricsStore from VEGA CLI.
 */
@Entity
@Table(name = "user_pr_metrics", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"username"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserPrMetrics {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username", nullable = false, unique = true, length = 100)
    private String username;

    @Column(name = "total_prs_analyzed", nullable = false)
    @Builder.Default
    private Long totalPrsAnalyzed = 0L;

    @Column(name = "total_review_time_with_feature_ms", nullable = false)
    @Builder.Default
    private Long totalReviewTimeWithFeatureMs = 0L;

    @Column(name = "total_review_time_without_feature_ms", nullable = false)
    @Builder.Default
    private Long totalReviewTimeWithoutFeatureMs = 0L;

    @Column(name = "prs_with_feature_count", nullable = false)
    @Builder.Default
    private Long prsWithFeatureCount = 0L;

    @Column(name = "prs_without_feature_count", nullable = false)
    @Builder.Default
    private Long prsWithoutFeatureCount = 0L;

    /** PRs approved by this user (as reviewer). */
    @Column(name = "approved_count", nullable = false)
    @Builder.Default
    private Long approvedCount = 0L;

    /** PRs rejected by this user (as reviewer). */
    @Column(name = "rejected_count", nullable = false)
    @Builder.Default
    private Long rejectedCount = 0L;
}
