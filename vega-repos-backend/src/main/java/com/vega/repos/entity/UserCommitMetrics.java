package com.vega.repos.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * Per-user AI commit message metrics.
 * Mirrors CommitMessageMetrics from VEGA CLI.
 */
@Entity
@Table(name = "user_commit_metrics", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"username"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserCommitMetrics {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "username", nullable = false, unique = true, length = 100)
    private String username;

    @Column(name = "total_generated", nullable = false)
    @Builder.Default
    private Long totalGenerated = 0L;

    @Column(name = "accepted_first", nullable = false)
    @Builder.Default
    private Long acceptedFirst = 0L;

    @Column(name = "accepted_after_regenerate", nullable = false)
    @Builder.Default
    private Long acceptedAfterRegenerate = 0L;

    @Column(name = "rejected", nullable = false)
    @Builder.Default
    private Long rejected = 0L;

    @Column(name = "total_regenerations", nullable = false)
    @Builder.Default
    private Long totalRegenerations = 0L;

    @Column(name = "total_time_to_accept_ms", nullable = false)
    @Builder.Default
    private Long totalTimeToAcceptMs = 0L;
}
